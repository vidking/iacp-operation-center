import type { Connection } from '@iacoc/contracts';
import { activationRequestSchema } from '@iacoc/contracts';
import type { Database } from './db';
import { activationDecision, fingerprintEndpoint, scopeNeedsReconfirmation } from './scope';

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

export function activateConnection(
  database: Database,
  id: string,
  rawRequest: unknown,
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

  database.prepare('UPDATE connections SET active = 0 WHERE id <> ?').run(id);
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
