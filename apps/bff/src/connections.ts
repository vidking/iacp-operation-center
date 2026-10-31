import { randomUUID } from 'node:crypto';
import type { ServerConfig } from '@iacoc/config';
import type {
  Connection,
  ConnectionCreateRequest,
  ConnectionUpdateRequest,
} from '@iacoc/contracts';
import { activationRequestSchema } from '@iacoc/contracts';
import type { Database } from './db';
import { decryptBearer, encryptBearer } from './keyring';
import {
  activationDecision,
  fingerprintContract,
  fingerprintEndpoint,
  scopeNeedsReconfirmation,
} from './scope';
import { documentedIacpPaths, fetchIacp, UpstreamPolicyError } from './upstream';

type ConnectionRow = {
  id: string;
  name: string;
  endpoint: string;
  kind: Connection['kind'];
  status: Connection['status'];
  scope_confirmed: number;
  mode: Connection['mode'];
  active: number;
  tenant_id: string | null;
  tenant_published: number;
  dependencies: Connection['dependencies'];
  last_validation_at: string | null;
  evidence_at: string | null;
  credential_version: number;
  contract_fingerprint: string | null;
  endpoint_fingerprint: string;
  credential_ciphertext: string | null;
  credential_nonce: string | null;
  credential_tag: string | null;
  credential_key_id: string | null;
};

function mapConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    name: row.name,
    endpoint: row.endpoint,
    kind: row.kind,
    status: row.status,
    scopeConfirmed: row.scope_confirmed === 1,
    mode: row.mode,
    active: row.active === 1,
    tenantId: row.tenant_id,
    tenantPublished: row.tenant_published === 1,
    dependencies: row.dependencies,
    lastValidationAt: row.last_validation_at,
    evidenceAt: row.evidence_at,
    credentialVersion: row.credential_version,
    contractFingerprint: row.contract_fingerprint,
  };
}

export function listConnections(database: Database): Connection[] {
  const rows = database
    .prepare('SELECT * FROM connections ORDER BY name')
    .all() as unknown as ConnectionRow[];
  return rows.map(mapConnection);
}

export function getConnection(database: Database, id: string): Connection | null {
  const row = database.prepare('SELECT * FROM connections WHERE id = ?').get(id) as
    ConnectionRow | undefined;
  return row ? mapConnection(row) : null;
}

export function createConnection(
  database: Database,
  keyringFile: string,
  input: ConnectionCreateRequest,
): Connection {
  const id = randomUUID();
  const endpoint = new URL(input.endpoint).origin;
  const credentialVersion = 1;
  const encrypted = encryptBearer(keyringFile, id, credentialVersion, input.bearer);
  database
    .prepare(
      'INSERT INTO connections (id, name, endpoint, kind, status, scope_confirmed, mode, active, tenant_id, tenant_published, dependencies, last_validation_at, evidence_at, credential_version, contract_fingerprint, endpoint_fingerprint, credential_ciphertext, credential_nonce, credential_tag, credential_key_id, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, 0, NULL, 0, ?, NULL, NULL, ?, NULL, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      id,
      input.name,
      endpoint,
      'controlplane-v2',
      'validating',
      'READ_ONLY',
      'unknown',
      credentialVersion,
      fingerprintEndpoint(endpoint),
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.tag,
      encrypted.keyId,
      new Date().toISOString(),
    );
  const connection = getConnection(database, id);
  if (!connection) throw new Error('La conexión no pudo persistirse.');
  return connection;
}

export function updateConnection(
  database: Database,
  keyringFile: string,
  id: string,
  input: ConnectionUpdateRequest,
): Connection | null {
  const row = database.prepare('SELECT * FROM connections WHERE id = ?').get(id) as
    ConnectionRow | undefined;
  if (!row) return null;
  const endpoint = input.endpoint ? new URL(input.endpoint).origin : row.endpoint;
  const credentialChanged = input.bearer !== undefined;
  const endpointChanged = endpoint !== row.endpoint;
  const credentialVersion = credentialChanged ? row.credential_version + 1 : row.credential_version;
  const encrypted = credentialChanged
    ? encryptBearer(keyringFile, id, credentialVersion, input.bearer as string)
    : null;
  const scopeChanged = credentialChanged || endpointChanged;
  database
    .prepare(
      'UPDATE connections SET name = ?, endpoint = ?, status = ?, scope_confirmed = ?, mode = ?, active = ?, last_validation_at = ?, evidence_at = ?, credential_version = ?, contract_fingerprint = ?, endpoint_fingerprint = ?, credential_ciphertext = COALESCE(?, credential_ciphertext), credential_nonce = COALESCE(?, credential_nonce), credential_tag = COALESCE(?, credential_tag), credential_key_id = COALESCE(?, credential_key_id), updated_at = ? WHERE id = ?',
    )
    .run(
      input.name ?? row.name,
      endpoint,
      scopeChanged ? 'validating' : row.status,
      scopeChanged ? 0 : row.scope_confirmed,
      scopeChanged ? 'READ_ONLY' : row.mode,
      scopeChanged ? 0 : row.active,
      scopeChanged ? null : row.last_validation_at,
      scopeChanged ? null : row.evidence_at,
      credentialVersion,
      scopeChanged ? null : row.contract_fingerprint,
      fingerprintEndpoint(endpoint),
      encrypted?.ciphertext ?? null,
      encrypted?.nonce ?? null,
      encrypted?.tag ?? null,
      encrypted?.keyId ?? null,
      new Date().toISOString(),
      id,
    );
  return getConnection(database, id);
}

function encryptedCredential(row: ConnectionRow) {
  if (
    !row.credential_ciphertext ||
    !row.credential_nonce ||
    !row.credential_tag ||
    !row.credential_key_id
  ) {
    return null;
  }
  return {
    ciphertext: row.credential_ciphertext,
    nonce: row.credential_nonce,
    tag: row.credential_tag,
    keyId: row.credential_key_id,
  };
}

export function liveConnectionCredential(
  database: Database,
  keyringFile: string,
  id: string,
): { connection: Connection; bearer: string } | null {
  const row = database.prepare('SELECT * FROM connections WHERE id = ?').get(id) as
    ConnectionRow | undefined;
  if (!row || row.active !== 1 || row.scope_confirmed !== 1 || row.mode !== 'LIVE') return null;
  const encrypted = encryptedCredential(row);
  if (!encrypted) return null;
  return {
    connection: mapConnection(row),
    bearer: decryptBearer(keyringFile, row.id, row.credential_version, encrypted),
  };
}

export async function validateConnection(
  database: Database,
  config: ServerConfig,
  id: string,
): Promise<
  | { ok: true; connection: Connection }
  | { ok: false; connection: Connection | null; code: string; error: string }
> {
  const row = database.prepare('SELECT * FROM connections WHERE id = ?').get(id) as
    ConnectionRow | undefined;
  if (!row) {
    return {
      ok: false,
      connection: null,
      code: 'CONNECTION_NOT_FOUND',
      error: 'La conexión no existe.',
    };
  }
  const encrypted = encryptedCredential(row);
  if (!encrypted) {
    return {
      ok: false,
      connection: getConnection(database, id),
      code: 'CREDENTIAL_NOT_CONFIGURED',
      error: 'La conexión no tiene una credencial configurada.',
    };
  }
  try {
    const bearer = decryptBearer(config.keyringFile, row.id, row.credential_version, encrypted);
    const live = await fetchIacp(config, row.endpoint, '/health/live', bearer);
    const ready = await fetchIacp(config, row.endpoint, '/health/ready', bearer);
    if (
      !live ||
      typeof live !== 'object' ||
      Array.isArray(live) ||
      (live as { status?: unknown }).status !== 'live' ||
      !ready ||
      typeof ready !== 'object' ||
      Array.isArray(ready) ||
      (ready as { status?: unknown }).status !== 'ready'
    ) {
      throw new Error('ControlPlaneV2 no devolvió el contrato esperado de health.');
    }
    let observability: Record<string, unknown> | null = null;
    try {
      const candidate = await fetchIacp(config, row.endpoint, '/v1/observability', bearer);
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        observability = candidate as Record<string, unknown>;
      }
    } catch (error) {
      if (error instanceof UpstreamPolicyError) throw error;
    }
    const contractFingerprint = fingerprintContract({
      paths: documentedIacpPaths,
      live,
      ready,
      observabilityKeys: observability ? Object.keys(observability).sort() : [],
    });
    const changed = scopeNeedsReconfirmation(
      {
        kind: row.kind,
        scopeConfirmed: row.scope_confirmed === 1,
        endpointFingerprint: row.endpoint_fingerprint,
        credentialVersion: row.credential_version,
        contractFingerprint: row.contract_fingerprint,
      },
      {
        endpointFingerprint: fingerprintEndpoint(row.endpoint),
        credentialVersion: row.credential_version,
        contractFingerprint,
      },
    );
    const confirmed = changed ? 0 : row.scope_confirmed;
    const active = changed ? 0 : row.active;
    const now = new Date().toISOString();
    const tenantId = typeof observability?.tenant_id === 'string' ? observability.tenant_id : null;
    const tenantPublished = tenantId ? 1 : 0;
    const dependencies =
      observability?.dependencies &&
      typeof observability.dependencies === 'object' &&
      Object.keys(observability.dependencies).length > 0
        ? 'published'
        : 'not-published';
    const evidenceAt =
      typeof observability?.observed_at === 'string' ? observability.observed_at : now;
    database
      .prepare(
        'UPDATE connections SET status = ?, scope_confirmed = ?, mode = ?, active = ?, tenant_id = ?, tenant_published = ?, dependencies = ?, last_validation_at = ?, evidence_at = ?, contract_fingerprint = ?, updated_at = ? WHERE id = ?',
      )
      .run(
        confirmed ? (active ? 'active-partial' : 'disconnected') : 'pending-confirmation',
        confirmed,
        confirmed ? row.mode : 'READ_ONLY',
        active,
        tenantId,
        tenantPublished,
        dependencies,
        now,
        evidenceAt,
        contractFingerprint,
        now,
        id,
      );
    const connection = getConnection(database, id);
    if (!connection) throw new Error('La conexión desapareció durante la validación.');
    return { ok: true, connection };
  } catch (error) {
    const code =
      error instanceof UpstreamPolicyError ? 'UPSTREAM_POLICY_REJECTED' : 'VALIDATION_FAILED';
    const message = error instanceof Error ? error.message : 'La validación IACP falló.';
    database
      .prepare('UPDATE connections SET status = ?, updated_at = ? WHERE id = ?')
      .run('error', new Date().toISOString(), id);
    return { ok: false, connection: getConnection(database, id), code, error: message };
  }
}

export function activateConnection(
  database: Database,
  id: string,
  rawRequest: unknown,
  liveEnabled: boolean,
): { connection: Connection; idempotent: boolean } | { error: string; code: string } {
  const request = activationRequestSchema.safeParse(rawRequest);
  if (!request.success) {
    return { error: 'El comando de activación no cumple el contrato.', code: 'INVALID_REQUEST' };
  }
  const row = database.prepare('SELECT * FROM connections WHERE id = ?').get(id) as
    ConnectionRow | undefined;
  if (!row) {
    return { error: 'La conexión no existe.', code: 'CONNECTION_NOT_FOUND' };
  }
  if (!row.last_validation_at) {
    return {
      error: 'La conexión debe tener una validación exitosa antes de pasar a LIVE.',
      code: 'VALIDATION_REQUIRED',
    };
  }
  if (!liveEnabled) {
    return {
      error: 'LIVE no está habilitado por la configuración del servidor.',
      code: 'LIVE_DISABLED',
    };
  }
  const decision = activationDecision(
    {
      kind: row.kind,
      scopeConfirmed: row.scope_confirmed === 1,
      endpointFingerprint: row.endpoint_fingerprint,
      credentialVersion: row.credential_version,
      contractFingerprint: row.contract_fingerprint,
    },
    request.data,
  );
  if (!decision.ok) return { error: decision.message, code: decision.code };

  database
    .prepare(
      'UPDATE connections SET active = 1, status = ?, scope_confirmed = 1, mode = ?, updated_at = ? WHERE id = ?',
    )
    .run('active-partial', 'LIVE', new Date().toISOString(), id);
  const updated = getConnection(database, id);
  if (!updated)
    return { error: 'La conexión desapareció durante la activación.', code: 'STATE_ERROR' };
  return { connection: updated, idempotent: decision.idempotent };
}

export function deactivateConnection(database: Database, id: string): Connection | null {
  const row = database.prepare('SELECT * FROM connections WHERE id = ?').get(id) as
    ConnectionRow | undefined;
  if (!row) return null;
  database
    .prepare('UPDATE connections SET active = 0, status = ?, mode = ?, updated_at = ? WHERE id = ?')
    .run('disconnected', 'READ_ONLY', new Date().toISOString(), id);
  return getConnection(database, id);
}

export function invalidateChangedScope(
  database: Database,
  id: string,
  endpoint: string,
  credentialVersion: number,
  contractFingerprint: string | null,
): Connection | null {
  const current = database.prepare('SELECT * FROM connections WHERE id = ?').get(id) as
    ConnectionRow | undefined;
  if (!current) return null;
  const changed = scopeNeedsReconfirmation(
    {
      kind: current.kind,
      scopeConfirmed: current.scope_confirmed === 1,
      endpointFingerprint: current.endpoint_fingerprint,
      credentialVersion: current.credential_version,
      contractFingerprint: current.contract_fingerprint,
    },
    {
      endpointFingerprint: fingerprintEndpoint(endpoint),
      credentialVersion,
      contractFingerprint,
    },
  );
  database
    .prepare(
      'UPDATE connections SET endpoint = ?, endpoint_fingerprint = ?, credential_version = ?, contract_fingerprint = ?, scope_confirmed = ?, status = ?, mode = ?, active = ?, updated_at = ? WHERE id = ?',
    )
    .run(
      endpoint,
      fingerprintEndpoint(endpoint),
      credentialVersion,
      contractFingerprint,
      changed ? 0 : current.scope_confirmed,
      changed ? 'pending-confirmation' : current.status,
      changed ? 'READ_ONLY' : current.mode,
      changed ? 0 : current.active,
      new Date().toISOString(),
      id,
    );
  return getConnection(database, id);
}
