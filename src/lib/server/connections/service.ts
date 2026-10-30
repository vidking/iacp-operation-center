import {
  openSync,
  closeSync,
  fstatSync,
  readFileSync,
  constants,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  db,
  audit,
  transaction,
  setting,
  setSetting,
} from "../security/database.ts";
import { config, SecurityError } from "../security/config.ts";
import { requireRole, throttle } from "../security/auth.ts";
import { encryptSecret, decryptSecret } from "../security/crypto.ts";
import { allowedTarget, canonicalOrigin } from "./transport.ts";
import { readonlySource, readReady } from "./source.ts";
import {
  discoverContract,
  type ContractDescriptor,
  type ScopeMode,
} from "./contract.ts";
import type { Principal, ConnectionView } from "../../types/security.ts";
import type { ApiProfile } from "../../types/security.ts";
import type { PortalData } from "../../types/portal.ts";
import { freshness, uniqueEvents } from "../../types/observation.ts";
import type { ConnectionCheck } from "../../types/connection-diagnostics.ts";
import { stateForError } from "../../types/connection-state.ts";
import {
  operationSchema,
  eventPageSchema,
  diagnosticsSchema,
} from "../../types/observation.ts";
const label = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[\p{L}\p{N} ._()-]+$/u);
const credential = z
  .string()
  .min(12)
  .max(4096)
  .regex(/^[\x21-\x7e]+$/);
export const createSchema = z
  .object({
    name: label,
    environment: z.enum(["development", "staging", "production"]),
    endpoint: z.string().max(300),
    serviceIdentity: label,
    credential,
  })
  .strict();
export const mutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update"),
      name: label,
      environment: z.enum(["development", "staging", "production"]),
      endpoint: z.string().max(300),
      serviceIdentity: label,
      credential: credential.optional(),
      expectedUpdatedAt: z.string().optional(),
    })
    .strict(),
  z.object({ action: z.literal("rotate"), credential }).strict(),
  z
    .object({
      action: z.enum(["test", "activate", "disable", "enable"]),
      confirmSingleTenant: z.boolean().optional(),
    })
    .strict(),
]);
interface Row {
  id: string;
  name: string;
  environment: string;
  endpoint: string;
  tenant_id: string;
  service_identity: string;
  secret: string;
  credential_version: number;
  enabled: number;
  updated_at: string;
  last_validation: string | null;
  last_code: string | null;
  validated_version: number | null;
}
function admin(user: Principal | undefined) {
  return requireRole(user, ["Administrator"]);
}
function findRow(user: Principal, id: string) {
  return db()
    .prepare("SELECT * FROM connections WHERE id=? AND tenant_id=?")
    .get(id, user.tenantId) as unknown as Row | undefined;
}
function rowFor(user: Principal, id: string) {
  const row = findRow(user, id);
  if (!row) throw new SecurityError("NOT_FOUND", 404);
  return row;
}
const activeKey = (tenant: string) => "active:" + tenant;
const modeKey = (tenant: string) => "mode:" + tenant;
const associationKey = (workspace: string) => "association:" + workspace;
const legacyLifecycleMigrationKey = "migration:single-bearer-v1";
export const associatedTenant = (workspace: string) =>
  setting(associationKey(workspace));

/**
 * 0.6.x stored a second encrypted lifecycle credential under these keys.
 * Preserve the ciphertext and its original AAD, but move it out of the active
 * namespace so the single Bearer connection is the only credential used.
 */
export function migrateLegacyLifecycleSettings() {
  if (setting(legacyLifecycleMigrationKey) === "done") return;
  transaction(() => {
    const rows = db().prepare("SELECT id,tenant_id FROM connections").all() as {
      id: string;
      tenant_id: string;
    }[];
    for (const row of rows) {
      for (const suffix of ["", "-mode", "-status"]) {
        const sourceKey = "lifecycle" + suffix + ":" + row.id;
        const value = setting(sourceKey);
        if (value === undefined) continue;
        const targetKey = "legacy:" + sourceKey;
        if (setting(targetKey) === undefined) setSetting(targetKey, value);
        db().prepare("DELETE FROM settings WHERE key=?").run(sourceKey);
        audit(
          "migration",
          "connection.legacy_lifecycle_migrated",
          row.id,
          row.tenant_id,
          { preserved: true, activeCredential: "connection" },
        );
      }
    }
    setSetting(legacyLifecycleMigrationKey, "done");
  });
}
interface ValidationReport {
  version: number;
  at: string;
  checks: ConnectionCheck[];
  upstreamTenant?: string;
  apiProfile?: ApiProfile;
  scopeMode?: ScopeMode;
  scopeBinding?: string;
  scopeConfirmed?: boolean;
  scopeConfirmedBy?: string;
  scopeConfirmedAt?: string;
}
function reportFor(row: Row): ValidationReport | undefined {
  const raw = setting("validation:" + row.id);
  return raw ? JSON.parse(raw) : undefined;
}

function currentReport(row: Row) {
  const report = reportFor(row);
  return report?.version === row.credential_version &&
    report.at === row.last_validation
    ? report
    : undefined;
}

function profileFor(row: Row, report = currentReport(row)): ApiProfile {
  return report?.apiProfile ?? "legacy";
}

function scopeModeFor(row: Row, report = currentReport(row)): ScopeMode {
  return (
    report?.scopeMode ??
    (profileFor(row, report) === "controlplane-v2"
      ? "single-tenant-endpoint"
      : "tenant")
  );
}

function scopeBindingFor(row: Row, report = currentReport(row)) {
  return (
    report?.scopeBinding ??
    (profileFor(row, report) === "controlplane-v2"
      ? canonicalOrigin(row.endpoint)
      : (report?.upstreamTenant ?? associatedTenant(row.tenant_id) ?? null))
  );
}

function scopeConfirmedFor(row: Row, report = currentReport(row)) {
  const mode = scopeModeFor(row, report);
  if (mode === "single-tenant-endpoint") return report?.scopeConfirmed === true;
  return Boolean(
    report?.upstreamTenant &&
    associatedTenant(row.tenant_id) === report.upstreamTenant,
  );
}

export function destinationStatus(
  user: Principal | undefined,
  endpoint: string,
) {
  admin(user);
  try {
    allowedTarget(endpoint);
    return "OK";
  } catch (e) {
    return e instanceof SecurityError ? e.code : "DESTINATION_POLICY_INVALID";
  }
}
function view(row: Row): ConnectionView {
  const stale =
    !row.last_validation ||
    Date.now() - Date.parse(row.last_validation) > 300_000;
  let destinationCode = "OK";
  try {
    allowedTarget(row.endpoint);
  } catch (e) {
    destinationCode =
      e instanceof SecurityError ? e.code : "DESTINATION_POLICY_INVALID";
  }
  const report = reportFor(row);
  const profile = profileFor(row);
  const scopeMode = scopeModeFor(row);
  const scopeBinding = scopeBindingFor(row);
  const scopeConfirmed = scopeConfirmedFor(row);
  const currentReport =
    report?.version === row.credential_version &&
    report.at === row.last_validation;
  const snapshot = db()
    .prepare(
      "SELECT saved_at FROM snapshots WHERE connection_id=? AND version=?",
    )
    .get(row.id, row.credential_version) as { saved_at: string } | undefined;
  const syncRaw = setting("sync:" + row.id);
  const sync = syncRaw
    ? (JSON.parse(syncRaw) as {
        version: number;
        status: import("../../types/connection-state.ts").ConnectionState;
      })
    : undefined;
  const operationalState =
    !config().liveEnabled || destinationCode !== "OK"
      ? "disconnected"
      : row.last_code && row.last_code !== "OK"
        ? stateForError(row.last_code)
        : selectionEnabled(row.tenant_id) &&
            config().liveEnabled &&
            !setting("activation-required:" + row.id) &&
            setting(activeKey(row.tenant_id)) === row.id &&
            row.enabled &&
            scopeConfirmed &&
            sync?.version === row.credential_version
          ? freshness(snapshot?.saved_at ?? null) === "fresh"
            ? sync.status
            : "degraded"
          : "disconnected";
  return {
    operationalState,
    selected:
      setting(activeKey(row.tenant_id)) === row.id &&
      selectionEnabled(row.tenant_id),
    lastSync: snapshot?.saved_at ?? null,
    upstreamTenantId:
      profile === "controlplane-v2"
        ? null
        : currentReport
          ? (report?.upstreamTenant ?? null)
          : (associatedTenant(row.tenant_id) ?? null),
    associationState: scopeConfirmed
      ? "confirmed"
      : currentReport && scopeBinding
        ? "pending"
        : "unverified",
    apiProfile: currentReport ? profile : null,
    scopeMode: currentReport ? scopeMode : null,
    scopeBinding: currentReport ? scopeBinding : null,
    scopeConfirmed,
    checks:
      report?.version === row.credential_version &&
      report.at === row.last_validation
        ? report.checks
        : [],
    destinationCode,
    activationCode: !config().liveEnabled
      ? "LIVE_DISABLED"
      : destinationCode !== "OK"
        ? destinationCode
        : !row.enabled
          ? "CONNECTION_DISABLED"
          : stale
            ? "VALIDATION_REQUIRED"
            : !currentReport || !scopeConfirmed
              ? profile === "controlplane-v2"
                ? "SINGLE_TENANT_CONFIRMATION_REQUIRED"
                : "ASSOCIATION_REQUIRED"
              : row.last_code !== "OK" ||
                  row.validated_version !== row.credential_version
                ? "VALIDATION_REQUIRED"
                : "OK",
    id: row.id,
    name: row.name,
    environment: row.environment,
    endpoint: row.endpoint,
    tenantId: row.tenant_id,
    serviceIdentity: row.service_identity,
    enabled: Boolean(row.enabled),
    credentialsConfigured: Boolean(row.secret),
    credentialVersion: row.credential_version,
    updatedAt: row.updated_at,
    lastValidation: row.last_validation,
    lastCode: row.last_code,
    status:
      row.last_code === "OK"
        ? stale
          ? "stale"
          : "valid"
        : row.last_code
          ? "failed"
          : "unknown",
    active:
      Boolean(row.enabled) &&
      config().liveEnabled &&
      !setting("activation-required:" + row.id) &&
      row.last_code === "OK" &&
      scopeConfirmed &&
      row.validated_version === row.credential_version &&
      setting(activeKey(row.tenant_id)) === row.id &&
      selectionEnabled(row.tenant_id),
  };
}
export function workspaceStatus(user: Principal | undefined) {
  const actor = requireRole(user);
  const id = setting(activeKey(actor.tenantId));
  if (!id || !selectionEnabled(actor.tenantId) || !config().liveEnabled)
    return "disconnected" as const;
  const row = findRow(actor, id);
  return row ? view(row).operationalState : ("disconnected" as const);
}
export function listConnections(user: Principal | undefined) {
  const actor = admin(user);
  migrateLegacyLifecycleSettings();
  return (
    db()
      .prepare(
        "SELECT * FROM connections WHERE tenant_id=? ORDER BY updated_at DESC",
      )
      .all(actor.tenantId) as unknown as Row[]
  ).map(view);
}
export function history(user: Principal | undefined, id: string) {
  const actor = admin(user);
  const rows = db()
    .prepare(
      "SELECT id,occurred_at,actor,action,detail FROM audit WHERE object_id=? AND tenant_id=? ORDER BY occurred_at DESC,rowid DESC LIMIT 100",
    )
    .all(id, actor.tenantId);
  // Deleted records remain auditable only within their original workspace.
  const existing = db()
    .prepare("SELECT id FROM connections WHERE id=? AND tenant_id=?")
    .get(id, actor.tenantId);
  if (!existing && !rows.length) throw new SecurityError("NOT_FOUND", 404);
  return rows;
}
function releaseSelection(workspace: string, id: string) {
  if (setting(activeKey(workspace)) !== id) return;
  setSetting(modeKey(workspace), "DISCONNECTED");
  db().prepare("DELETE FROM settings WHERE key=?").run(activeKey(workspace));
}
export function createConnection(user: Principal | undefined, input: unknown) {
  const actor = admin(user);
  const value = createSchema.parse(input),
    id = randomUUID(),
    endpoint = allowedTarget(value.endpoint).origin,
    now = new Date().toISOString();
  const secret = encryptSecret(
    value.credential,
    `${id}:${actor.tenantId}:${endpoint}`,
  );
  transaction(() => {
    db()
      .prepare(
        "INSERT INTO connections(id,name,environment,endpoint,tenant_id,service_identity,secret,updated_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        value.name,
        value.environment,
        endpoint,
        actor.tenantId,
        value.serviceIdentity,
        secret,
        now,
      );
    audit(actor.id, "connection.created", id, actor.tenantId, { version: 1 });
  });
  return view(rowFor(actor, id));
}
function connectionToken(row: Row) {
  if (!row.enabled) throw new SecurityError("CONNECTION_DISABLED", 409);
  allowedTarget(row.endpoint);
  return decryptSecret(
    row.secret,
    row.id + ":" + row.tenant_id + ":" + row.endpoint,
  );
}
function sourceFor(
  row: Row,
  remoteTenant = associatedTenant(row.tenant_id),
  profile: ApiProfile = profileFor(row),
  scopeMode: ScopeMode = scopeModeFor(row),
) {
  if (scopeMode !== "single-tenant-endpoint" && !remoteTenant)
    throw new SecurityError("ASSOCIATION_REQUIRED", 409);
  return readonlySource({
    endpoint: row.endpoint,
    tenantId: remoteTenant,
    profile,
    scopeMode,
    token: connectionToken(row),
  });
}
export function deleteConnection(
  user: Principal | undefined,
  id: string,
  input: unknown,
) {
  const actor = admin(user);
  const value = z
    .object({ action: z.literal("delete"), confirmId: z.string() })
    .strict()
    .parse(input);
  const row = rowFor(actor, id);
  throttle("connection-admin:" + actor.id, 30, 60_000);
  if (value.confirmId !== id)
    throw new SecurityError("DELETE_CONFIRMATION_REQUIRED", 400);
  transaction(() => {
    if (
      setting(activeKey(actor.tenantId)) === id &&
      selectionEnabled(actor.tenantId)
    )
      throw new SecurityError("CONNECTION_IN_USE", 409);
    db()
      .prepare("DELETE FROM connections WHERE id=? AND tenant_id=?")
      .run(id, actor.tenantId);
    db()
      .prepare("DELETE FROM settings WHERE key=?")
      .run("validation:" + id);
    db()
      .prepare("DELETE FROM settings WHERE key=?")
      .run("activation-required:" + id);
    db()
      .prepare("DELETE FROM settings WHERE key=?")
      .run("sync:" + id);
    db()
      .prepare("DELETE FROM settings WHERE key=?")
      .run("lifecycle:" + id);
    db()
      .prepare("DELETE FROM settings WHERE key=?")
      .run("lifecycle-mode:" + id);
    db()
      .prepare("DELETE FROM settings WHERE key=?")
      .run("lifecycle-status:" + id);
    db()
      .prepare("DELETE FROM settings WHERE key=?")
      .run("legacy:lifecycle:" + id);
    db()
      .prepare("DELETE FROM settings WHERE key=?")
      .run("legacy:lifecycle-mode:" + id);
    db()
      .prepare("DELETE FROM settings WHERE key=?")
      .run("legacy:lifecycle-status:" + id);
    releaseSelection(actor.tenantId, id);
    audit(actor.id, "connection.deleted", id, actor.tenantId, {
      name: row.name,
      version: row.credential_version,
    });
  });
  return { deleted: true as const, id };
}
export async function mutateConnection(
  user: Principal | undefined,
  id: string,
  input: unknown,
) {
  const actor = admin(user),
    value = mutationSchema.parse(input),
    row = rowFor(actor, id);
  throttle("connection-admin:" + actor.id, 30, 60_000);
  if (value.action === "test") {
    let code = "OK";
    const checks: ConnectionCheck[] = [];
    const tasks: { id: ConnectionCheck["id"]; run: () => Promise<unknown> }[] =
      [];
    let ops: Awaited<ReturnType<ReturnType<typeof sourceFor>["operations"]>> =
      [];
    // Build the source inside the first check: policy/key failures are also auditable.
    let source: ReturnType<typeof sourceFor>;
    let upstreamTenant: string | undefined;
    let descriptor: ContractDescriptor | undefined;
    tasks.push(
      {
        id: "ready",
        run: async () => {
          return readReady(row.endpoint, connectionToken(row));
        },
      },
      {
        id: "observability",
        run: async () => {
          try {
            const diagnostics = await readonlySource({
              endpoint: row.endpoint,
              profile: "legacy",
              scopeMode: "tenant",
              token: connectionToken(row),
            }).observability();
            if (!diagnostics.tenant_id || diagnostics.tenant_id.length > 128)
              throw new SecurityError("UPSTREAM_CONTRACT_ERROR", 502);
            const expected = associatedTenant(row.tenant_id);
            if (expected && expected !== diagnostics.tenant_id)
              throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
            descriptor = {
              profile: "legacy",
              createRef: "legacy-observability",
              scopeMode: "tenant",
              scopeBinding: diagnostics.tenant_id,
            };
            upstreamTenant = diagnostics.tenant_id;
            source = sourceFor(row, upstreamTenant, "legacy", "tenant");
          } catch (error) {
            if (
              !(error instanceof SecurityError) ||
              error.code !== "UPSTREAM_CONTRACT_ERROR"
            )
              throw error;
            descriptor = await discoverContract(
              row.endpoint,
              connectionToken(row),
            );
            if (descriptor.profile !== "controlplane-v2") throw error;
            source = readonlySource({
              endpoint: row.endpoint,
              profile: descriptor.profile,
              scopeMode: descriptor.scopeMode,
              token: connectionToken(row),
            });
            await source.observability();
          }
        },
      },
      { id: "events", run: () => source.events() },
      {
        id: "operations",
        run: async () => {
          ops = await source.operations();
        },
      },
      {
        id: "operation",
        run: async () => {
          if (ops[0]) await source.operation(ops[0].operation_id);
        },
      },
    );
    for (const task of tasks) {
      if (code !== "OK" || (task.id === "operation" && !ops[0])) {
        checks.push({
          id: task.id,
          status: "skipped",
          code: code !== "OK" ? "PREVIOUS_CHECK_FAILED" : "NO_OPERATIONS",
        });
        continue;
      }
      try {
        await task.run();
        checks.push({ id: task.id, status: "passed", code: "OK" });
      } catch (e) {
        code = e instanceof SecurityError ? e.code : "UPSTREAM_CONTRACT_ERROR";
        checks.push({ id: task.id, status: "failed", code });
      }
    }
    const current = rowFor(actor, id);
    if (current.credential_version !== row.credential_version)
      throw new SecurityError("CONNECTION_CHANGED", 409);
    const at = new Date().toISOString();
    transaction(() => {
      setSetting(
        "validation:" + id,
        JSON.stringify({
          version: row.credential_version,
          at,
          checks,
          upstreamTenant,
          apiProfile: descriptor?.profile,
          scopeMode: descriptor?.scopeMode,
          scopeBinding:
            descriptor?.profile === "controlplane-v2"
              ? canonicalOrigin(row.endpoint)
              : upstreamTenant,
          scopeConfirmed: false,
        }),
      );
      db()
        .prepare(
          "UPDATE connections SET last_validation=?,last_code=?,validated_version=? WHERE id=?",
        )
        .run(at, code, code === "OK" ? row.credential_version : null, id);
      if (
        [
          "UPSTREAM_UNAUTHORIZED",
          "UPSTREAM_FORBIDDEN",
          "UPSTREAM_TENANT_MISMATCH",
        ].includes(code)
      ) {
        setSetting("activation-required:" + id, "1");
        db().prepare("DELETE FROM snapshots WHERE connection_id=?").run(id);
      }
      audit(actor.id, "connection.tested", id, actor.tenantId, {
        code,
        version: row.credential_version,
      });
    });
    return view(rowFor(actor, id));
  }
  if (value.action === "activate") {
    if (!config().liveEnabled) throw new SecurityError("LIVE_DISABLED", 409);
    if (
      !row.enabled ||
      row.last_code !== "OK" ||
      row.validated_version !== row.credential_version ||
      !row.last_validation ||
      Date.now() - Date.parse(row.last_validation) > 300_000
    )
      throw new SecurityError("VALIDATION_REQUIRED", 409);
    const report = reportFor(row);
    if (
      !report ||
      report.version !== row.credential_version ||
      report.at !== row.last_validation
    ) {
      // Keep the legacy lifecycle's association error for records created
      // before validation reports were persisted. v2 has no tenant
      // association to recover, so it must revalidate instead.
      throw new SecurityError(
        report?.apiProfile === "controlplane-v2"
          ? "VALIDATION_REQUIRED"
          : "ASSOCIATION_REQUIRED",
        409,
      );
    }
    const profile = report.apiProfile ?? "legacy";
    if (profile === "controlplane-v2") {
      if (
        report.scopeMode !== "single-tenant-endpoint" ||
        report.scopeBinding !== canonicalOrigin(row.endpoint)
      )
        throw new SecurityError("SINGLE_TENANT_CONFIRMATION_REQUIRED", 409);
      if (!report.scopeConfirmed && value.confirmSingleTenant !== true)
        throw new SecurityError("SINGLE_TENANT_CONFIRMATION_REQUIRED", 409);
      sourceFor(row, undefined, profile, "single-tenant-endpoint");
    } else {
      if (!report.upstreamTenant)
        throw new SecurityError("ASSOCIATION_REQUIRED", 409);
      const bound = associatedTenant(row.tenant_id);
      if (bound && bound !== report.upstreamTenant)
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 409);
      sourceFor(row, report.upstreamTenant, profile, "tenant");
    }
    transaction(() => {
      if (profile === "controlplane-v2") {
        const confirmedAt = new Date().toISOString();
        setSetting(
          "validation:" + id,
          JSON.stringify({
            ...report,
            scopeConfirmed: true,
            scopeConfirmedBy: actor.id,
            scopeConfirmedAt: confirmedAt,
          }),
        );
        audit(
          actor.id,
          "identity.single_tenant_scope_confirmed",
          id,
          actor.tenantId,
          {
            scopeBinding: report.scopeBinding!,
          },
        );
      } else {
        setSetting(associationKey(actor.tenantId), report.upstreamTenant!);
        audit(actor.id, "identity.associated", id, actor.tenantId, {
          upstreamTenant: report.upstreamTenant!,
        });
      }
      db()
        .prepare("DELETE FROM settings WHERE key=?")
        .run("activation-required:" + id);
      setSetting(activeKey(actor.tenantId), id);
      setSetting(modeKey(actor.tenantId), "LIVE");
      audit(actor.id, "connection.activated", id, actor.tenantId);
    });
    return view(rowFor(actor, id));
  }
  const updatedAt = new Date(
    Math.max(Date.now(), (Date.parse(row.updated_at) || 0) + 1),
  ).toISOString();
  transaction(() => {
    if (value.action === "disable" || value.action === "enable") {
      db()
        .prepare(
          "UPDATE connections SET enabled=?,credential_version=credential_version+1,last_code=NULL,last_validation=NULL,validated_version=NULL,updated_at=? WHERE id=?",
        )
        .run(value.action === "enable" ? 1 : 0, updatedAt, id);
      releaseSelection(actor.tenantId, id);
      db().prepare("DELETE FROM snapshots WHERE connection_id=?").run(id);
      db()
        .prepare("DELETE FROM settings WHERE key=?")
        .run("validation:" + id);
    } else {
      if (value.action !== "update" && value.action !== "rotate")
        throw new SecurityError("INVALID_REQUEST");
      if (
        value.action === "update" &&
        value.expectedUpdatedAt &&
        value.expectedUpdatedAt !== row.updated_at
      )
        throw new SecurityError("CONNECTION_CHANGED", 409);
      const endpoint =
        value.action === "update"
          ? value.endpoint === row.endpoint
            ? row.endpoint
            : allowedTarget(value.endpoint).origin
          : row.endpoint;
      const replacement = value.credential;
      const authorizationChanged =
        endpoint !== row.endpoint || replacement !== undefined;
      if (authorizationChanged) {
        setSetting("activation-required:" + id, "1");
        const secret =
          replacement ??
          decryptSecret(
            row.secret,
            row.id + ":" + row.tenant_id + ":" + row.endpoint,
          );
        const encrypted = encryptSecret(
          secret,
          row.id + ":" + row.tenant_id + ":" + endpoint,
        );
        db()
          .prepare(
            "UPDATE connections SET name=?,environment=?,endpoint=?,service_identity=?,secret=?,credential_version=credential_version+1,last_code=NULL,last_validation=NULL,validated_version=NULL,updated_at=? WHERE id=?",
          )
          .run(
            value.action === "update" ? value.name : row.name,
            value.action === "update" ? value.environment : row.environment,
            endpoint,
            value.action === "update"
              ? value.serviceIdentity
              : row.service_identity,
            encrypted,
            updatedAt,
            id,
          );
        db().prepare("DELETE FROM snapshots WHERE connection_id=?").run(id);
        db()
          .prepare("DELETE FROM settings WHERE key=?")
          .run("validation:" + id);
      } else if (value.action === "update") {
        db()
          .prepare(
            "UPDATE connections SET name=?,environment=?,service_identity=?,updated_at=? WHERE id=?",
          )
          .run(
            value.name,
            value.environment,
            value.serviceIdentity,
            updatedAt,
            id,
          );
      }
    }
    const current = rowFor(actor, id);
    audit(actor.id, "connection." + value.action, id, actor.tenantId, {
      version: current.credential_version,
    });
  });
  return view(rowFor(actor, id));
}

// Read the legacy marker without exposing a product mode or selecting a synthetic source.
export function selectionEnabled(workspace: string) {
  return setting(modeKey(workspace)) === "LIVE";
}
export function selectedConnectionId(user: Principal | undefined) {
  const actor = requireRole(user);
  return setting(activeKey(actor.tenantId));
}
export function disconnectWorkspace(user: Principal | undefined) {
  const actor = admin(user);
  transaction(() => {
    setSetting(modeKey(actor.tenantId), "DISCONNECTED");
    db()
      .prepare("DELETE FROM settings WHERE key=?")
      .run(activeKey(actor.tenantId));
    audit(actor.id, "connection.disconnected", "workspace", actor.tenantId);
  });
}
export function liveSource(user: Principal | undefined) {
  const actor = requireRole(user);
  if (!selectionEnabled(actor.tenantId) || !config().liveEnabled)
    throw new SecurityError("LIVE_DISABLED", 409);
  const id = setting(activeKey(actor.tenantId));
  if (!id) throw new SecurityError("LIVE_NOT_CONFIGURED", 409);
  const row = rowFor(actor, id);
  if (
    row.last_code !== "OK" ||
    row.validated_version !== row.credential_version ||
    setting("activation-required:" + row.id)
  )
    throw new SecurityError("VALIDATION_REQUIRED", 409);
  const report = currentReport(row);
  if (!scopeConfirmedFor(row, report))
    throw new SecurityError(
      profileFor(row, report) === "controlplane-v2"
        ? "SINGLE_TENANT_CONFIRMATION_REQUIRED"
        : "ASSOCIATION_REQUIRED",
      409,
    );
  return { row, source: sourceFor(row) };
}
export async function authorizedRead<T>(
  user: Principal | undefined,
  read: (source: ReturnType<typeof sourceFor>) => Promise<T>,
): Promise<T> {
  const actor = requireRole(user),
    context = liveSource(actor);
  try {
    const result = await read(context.source);
    const current = findRow(actor, context.row.id);
    if (
      !current ||
      !current.enabled ||
      current.credential_version !== context.row.credential_version ||
      current.last_code !== "OK" ||
      current.validated_version !== current.credential_version ||
      setting("activation-required:" + current.id) ||
      !selectionEnabled(actor.tenantId) ||
      setting(activeKey(actor.tenantId)) !== current.id ||
      !config().liveEnabled
    )
      throw new SecurityError("CONNECTION_CHANGED", 409);
    return result;
  } catch (e) {
    if (
      e instanceof SecurityError &&
      [
        "UPSTREAM_UNAUTHORIZED",
        "UPSTREAM_FORBIDDEN",
        "UPSTREAM_TENANT_MISMATCH",
      ].includes(e.code)
    ) {
      const current = findRow(actor, context.row.id);
      if (current?.credential_version === context.row.credential_version)
        transaction(() => {
          db()
            .prepare(
              "UPDATE connections SET last_code=?,last_validation=NULL,validated_version=NULL WHERE id=?",
            )
            .run(e.code, current.id);
          db()
            .prepare("DELETE FROM settings WHERE key=?")
            .run("validation:" + current.id);
          setSetting("activation-required:" + current.id, "1");
          db()
            .prepare("DELETE FROM snapshots WHERE connection_id=?")
            .run(current.id);
          audit(
            "server",
            "connection.authorization_failed",
            current.id,
            actor.tenantId,
            { code: e.code },
          );
        });
    }
    throw e;
  }
}
async function readPortalData(
  user: Principal | undefined,
): Promise<PortalData> {
  const actor = requireRole(user);
  const empty: PortalData = {
    status: "disconnected",
    operations: [],
    events: [],
    diagnostics: null,
    freshness: "unknown",
    partial: true,
    blocked: true,
    eventCursor: 0,
    evidence: {
      source: "IACP portal read model",
      queriedAt: new Date().toISOString(),
      observedAt: null,
      freshness: "unknown",
      status: "disconnected",
    },
  };
  const evidenceFor = (
    status: string,
    stateFreshness: "fresh" | "stale" | "unknown" = "unknown",
    observedAt: string | null = null,
    errorCode?: string,
  ) => ({
    source: "IACP portal read model",
    queriedAt: new Date().toISOString(),
    observedAt,
    freshness: stateFreshness,
    status,
    ...(errorCode ? { errorCode } : {}),
  });
  if (!selectionEnabled(actor.tenantId))
    return { ...empty, errorCode: "CONNECTION_REQUIRED" };
  let context: ReturnType<typeof liveSource>;
  try {
    context = liveSource(actor);
  } catch (e) {
    const code = e instanceof SecurityError ? e.code : "LIVE_NOT_CONFIGURED";
    const id = setting(activeKey(actor.tenantId)),
      row = id ? findRow(actor, id) : undefined;
    const reason =
      row?.last_code && row.last_code !== "OK" ? row.last_code : code;
    const state = stateForError(reason);
    return {
      ...empty,
      status: state,
      errorCode: reason,
      evidence: evidenceFor(state, "unknown", null, reason),
    };
  }
  const stillAuthorized = () => {
    const current = findRow(actor, context.row.id);
    return (
      current &&
      current.enabled &&
      current.credential_version === context.row.credential_version &&
      current.last_code === "OK" &&
      current.validated_version === current.credential_version &&
      !setting("activation-required:" + current.id) &&
      selectionEnabled(actor.tenantId) &&
      setting(activeKey(actor.tenantId)) === current.id
    );
  };
  const singleTenantScope = profileFor(context.row) === "controlplane-v2";
  const eventScopeMatches = (
    diagnostics: import("../../types/observation.ts").Diagnostics,
    events: import("../../types/observation.ts").AuditEvent[],
  ) =>
    singleTenantScope
      ? diagnostics.tenant_id === null &&
        events.every((event) => event.tenant_id === null)
      : diagnostics.tenant_id === associatedTenant(actor.tenantId) &&
        events.every((event) => event.tenant_id === diagnostics.tenant_id);
  try {
    let previousEvents: import("../../types/observation.ts").AuditEvent[] = [];
    const previous = db()
      .prepare(
        "SELECT payload FROM snapshots WHERE connection_id=? AND version=?",
      )
      .get(context.row.id, context.row.credential_version) as
      { payload: string } | undefined;
    if (previous)
      try {
        const values = eventPageSchema.parse({
          events: JSON.parse(previous.payload).events,
          next_after: 0,
        }).events;
        if (
          values.every((e) =>
            singleTenantScope
              ? e.tenant_id === null
              : e.tenant_id === associatedTenant(actor.tenantId),
          )
        )
          previousEvents = values;
      } catch {}
    const eventAfter =
      Math.max(0, ...previousEvents.map((e) => e.event_id)) - 20;
    const eventBootstrapKey = "events-bootstrap-v2:" + context.row.id;
    const eventBootstrapComplete = setting(eventBootstrapKey) === "done";
    async function eventWindow(after: number) {
      const collected: import("../../types/observation.ts").AuditEvent[] = [];
      let cursor = after;
      for (;;) {
        const page = await context.source.events(cursor);
        collected.push(...page.events);
        if (page.events.length < 100) return { ...page, events: collected };
        if (page.next_after <= cursor || !Number.isSafeInteger(page.next_after))
          throw new SecurityError("UPSTREAM_CONTRACT_ERROR", 502);
        cursor = page.next_after;
      }
    }
    async function recentOperations() {
      let operations = await context.source.operations(0);
      if (operations.length < 50) return operations;
      let low = 0;
      let high = 1;
      while ((await context.source.operations(high * 50)).length) {
        low = high;
        high *= 2;
        if (!Number.isSafeInteger(high * 50))
          throw new SecurityError("INVALID_OFFSET");
      }
      while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if ((await context.source.operations(middle * 50)).length) low = middle;
        else high = middle;
      }
      return context.source.operations(low * 50);
    }
    const eventRead =
      eventBootstrapComplete || previousEvents.length
        ? eventWindow(Math.max(0, eventAfter))
        : eventWindow(0);
    const [operations, eventPage, diagnostics, ready] = await Promise.all([
      recentOperations(),
      eventRead,
      context.source.observability(),
      context.source.ready(),
    ]);
    if (ready.status !== "ready")
      throw new SecurityError("UPSTREAM_NOT_READY", 503);
    if (!stillAuthorized()) throw new SecurityError("CONNECTION_CHANGED", 409);
    operations.sort(
      (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at),
    );
    const age = freshness(diagnostics.observed_at);
    const dependencyStates = Object.values(diagnostics.dependencies).map(
      (state) => state.trim().toLowerCase(),
    );
    const knownFailures = dependencyStates.filter(
      (state) =>
        !["ready", "ok", "up", "healthy", "unknown", ""].includes(state),
    );
    const unknownDependencies = dependencyStates.some(
      (state) => state === "unknown" || state === "",
    );
    const evidenceState =
      age === "unknown"
        ? "unknown"
        : age === "stale"
          ? "stale"
          : knownFailures.length
            ? "degraded"
            : unknownDependencies
              ? "unknown"
              : operations.length || eventPage.events.length
                ? "connected"
                : "empty";
    // The remote event stream is the authority for a successful refresh. The
    // overlap above normally proves continuity with the local snapshot. If a
    // source has been compacted or re-seeded and no event from that overlap is
    // returned, retaining the old tail would mix two unrelated histories in
    // the "recent" feed. Keep the old snapshot only while continuity is
    // evidenced; transient failures still use it through the fallback below.
    const previousEventIds = new Set(
      previousEvents.map((event) => event.event_id),
    );
    const eventHistoryContinues =
      previousEvents.length === 0 ||
      eventPage.events.some((event) => previousEventIds.has(event.event_id));
    const recentEvents = eventHistoryContinues
      ? [...previousEvents, ...eventPage.events]
      : eventPage.events;
    const payload: PortalData = {
      ...empty,
      operations,
      events: uniqueEvents(recentEvents)
        .sort((a, b) => a.event_id - b.event_id)
        .slice(-100),
      eventCursor: eventPage.next_after,
      diagnostics,
      freshness: age,
      status: evidenceState,
      partial: evidenceState !== "connected",
      blocked: false,
      evidence: {
        source: "IACP portal read model",
        queriedAt: new Date().toISOString(),
        observedAt: diagnostics.observed_at,
        freshness: age,
        status: evidenceState,
      },
    };
    const at = new Date().toISOString();
    db()
      .prepare(
        "INSERT INTO snapshots VALUES(?,?,?,?) ON CONFLICT(connection_id) DO UPDATE SET version=excluded.version,payload=excluded.payload,saved_at=excluded.saved_at",
      )
      .run(
        context.row.id,
        context.row.credential_version,
        JSON.stringify(payload),
        at,
      );
    setSetting(
      "sync:" + context.row.id,
      JSON.stringify({
        version: context.row.credential_version,
        status: payload.status,
        at,
      }),
    );
    setSetting(eventBootstrapKey, "done");
    return payload;
  } catch (e) {
    const code = e instanceof SecurityError ? e.code : "UPSTREAM_UNAVAILABLE";
    const current = findRow(actor, context.row.id);
    if (
      [
        "UPSTREAM_UNAUTHORIZED",
        "UPSTREAM_FORBIDDEN",
        "UPSTREAM_TENANT_MISMATCH",
      ].includes(code)
    ) {
      if (current?.credential_version === context.row.credential_version)
        transaction(() => {
          setSetting("activation-required:" + current.id, "1");
          db()
            .prepare(
              "UPDATE connections SET last_code=?,last_validation=NULL,validated_version=NULL WHERE id=?",
            )
            .run(code, current.id);
          db()
            .prepare("DELETE FROM settings WHERE key=?")
            .run("validation:" + current.id);
          db()
            .prepare("DELETE FROM snapshots WHERE connection_id=?")
            .run(current.id);
          audit(
            "server",
            "connection.authorization_failed",
            current.id,
            actor.tenantId,
            { code },
          );
        });
      return {
        ...empty,
        status: stateForError(code),
        errorCode: code,
        evidence: evidenceFor(stateForError(code), "unknown", null, code),
      };
    }
    if (!stillAuthorized())
      return {
        ...empty,
        errorCode: "CONNECTION_CHANGED",
        evidence: evidenceFor(
          "disconnected",
          "unknown",
          null,
          "CONNECTION_CHANGED",
        ),
      };
    setSetting(
      "sync:" + context.row.id,
      JSON.stringify({
        version: context.row.credential_version,
        status: stateForError(code),
        code,
        at: new Date().toISOString(),
      }),
    );
    const snapshot = db()
      .prepare(
        "SELECT payload FROM snapshots WHERE connection_id=? AND version=?",
      )
      .get(context.row.id, context.row.credential_version) as
      { payload: string } | undefined;
    if (!snapshot)
      return {
        ...empty,
        status: stateForError(code),
        errorCode: code,
        blocked: false,
        evidence: evidenceFor(stateForError(code), "unknown", null, code),
      };
    try {
      // Project 0.4.1 snapshots rather than trusting legacy presentation fields.
      const saved = JSON.parse(snapshot.payload);
      const diagnostics = diagnosticsSchema.parse(saved.diagnostics);
      const events = eventPageSchema.parse({
        events: saved.events,
        next_after: 0,
      }).events;
      const operations = operationSchema.array().parse(saved.operations);
      if (!eventScopeMatches(diagnostics, events)) throw new Error();
      return {
        ...empty,
        operations,
        events,
        diagnostics,
        status: "degraded",
        freshness: "stale",
        partial: true,
        blocked: false,
        errorCode: code,
        evidence: evidenceFor(
          "stale",
          "stale",
          saved.diagnostics.observed_at,
          code,
        ),
      };
    } catch {
      const state = stateForError(code);
      return {
        ...empty,
        status: state,
        errorCode: code,
        evidence: evidenceFor(state, "unknown", null, code),
      };
    }
  }
}

export async function connectIacp(user: Principal | undefined, input: unknown) {
  const actor = admin(user);
  const value = z
    .object({
      credential: credential.min(32).optional(),
      connectionId: z.string().optional(),
      confirmSingleTenant: z.boolean().optional(),
    })
    .strict()
    .parse(input);
  let supplied = value.credential;
  let current: Row | undefined;
  if (value.connectionId) current = rowFor(actor, value.connectionId);
  if (!supplied && !current) {
    const path = process.env.IACOC_READER_CREDENTIAL_FILE;
    if (!path) throw new SecurityError("SERVICE_CREDENTIAL_REQUIRED", 409);
    if (process.env.IACOC_READER_WORKSPACE !== actor.tenantId)
      throw new SecurityError("SERVICE_CREDENTIAL_FORBIDDEN", 403);
    let fd: number | undefined;
    try {
      fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > 4096 || stat.mode & 0o077)
        throw new Error();
      supplied = credential.min(32).parse(readFileSync(fd, "utf8").trim());
    } catch {
      throw new SecurityError("SERVICE_CREDENTIAL_UNAVAILABLE", 503);
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }
  let connection: ConnectionView;
  if (value.connectionId) {
    if (!current) throw new SecurityError("NOT_FOUND", 404);
    allowedTarget(current.endpoint);
    if (supplied) {
      const rotated = await mutateConnection(actor, current.id, {
        action: "rotate",
        credential: supplied,
      });
      if ("deleted" in rotated) throw new SecurityError("INTERNAL_ERROR", 500);
      connection = rotated;
    } else connection = view(current);
  } else
    connection = createConnection(actor, {
      name: "IACP Cyberfuel",
      environment: "production",
      endpoint: "https://iac.cyberfuel.com",
      serviceIdentity: "Infrastructure as Code reader",
      credential: supplied,
    });
  let checked = await mutateConnection(actor, connection.id, {
    action: "test",
  });
  if (checked.lastCode !== "OK") return { connection: checked };
  checked = await mutateConnection(actor, connection.id, {
    action: "activate",
    ...(value.confirmSingleTenant ? { confirmSingleTenant: true } : {}),
  });
  return { connection: checked };
}

// Server-only context. Existing connection encryption AAD remains unchanged.
export function connectionContext(user: Principal | undefined) {
  migrateLegacyLifecycleSettings();
  const { row } = liveSource(user);
  if (!row.enabled) throw new SecurityError("CONNECTION_DISABLED", 409);
  const report = currentReport(row);
  const profile = profileFor(row, report);
  const scopeMode = scopeModeFor(row, report);
  const tenant =
    scopeMode === "tenant"
      ? (report?.upstreamTenant ?? associatedTenant(row.tenant_id))
      : null;
  const scopeKey =
    scopeMode === "single-tenant-endpoint"
      ? (report?.scopeBinding ?? canonicalOrigin(row.endpoint))
      : tenant;
  if (!scopeKey) throw new SecurityError("ASSOCIATION_REQUIRED", 409);
  return {
    id: row.id,
    version: row.credential_version,
    endpoint: row.endpoint,
    tenant,
    scopeKey,
    scopeMode,
    profile,
    token: connectionToken(row),
  };
}

const portalFlights = new Map<string, Promise<PortalData>>();
export function portalData(user: Principal | undefined): Promise<PortalData> {
  const actor = requireRole(user);
  const key =
    actor.tenantId +
    ":" +
    (setting(activeKey(actor.tenantId)) ?? "disconnected");
  const existing = portalFlights.get(key);
  if (existing) return existing;
  const pending = readPortalData(actor);
  portalFlights.set(key, pending);
  void pending
    .finally(() => {
      if (portalFlights.get(key) === pending) portalFlights.delete(key);
    })
    .catch(() => {});
  return pending;
}
