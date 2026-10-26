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
import { allowedTarget } from "./transport.ts";
import { readonlySource } from "./source.ts";
import type { Principal, ConnectionView } from "../../types/security.ts";
import type { PortalData } from "../../types/portal.ts";
import { freshness, uniqueEvents } from "../../types/observation.ts";
import type { ConnectionCheck } from "../../types/connection-diagnostics.ts";
import { mockSource } from "../data/mock.ts";
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
    })
    .strict(),
  z.object({ action: z.literal("rotate"), credential }).strict(),
  z.object({ action: z.enum(["test", "activate", "disable"]) }).strict(),
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
function rowFor(user: Principal, id: string) {
  const row = db()
    .prepare("SELECT * FROM connections WHERE id=? AND tenant_id=?")
    .get(id, user.tenantId) as unknown as Row | undefined;
  if (!row) throw new SecurityError("NOT_FOUND", 404);
  return row;
}
const activeKey = (tenant: string) => "active:" + tenant;
const modeKey = (tenant: string) => "mode:" + tenant;
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
  const validation = setting("validation:" + row.id);
  const report = validation
    ? (JSON.parse(validation) as {
        version: number;
        at: string;
        checks: ConnectionCheck[];
      })
    : undefined;
  return {
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
          : stale ||
              row.last_code !== "OK" ||
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
      row.last_code === "OK" &&
      row.validated_version === row.credential_version &&
      setting(activeKey(row.tenant_id)) === row.id &&
      modeFor(row.tenant_id) === "LIVE",
  };
}
export function listConnections(user: Principal | undefined) {
  const actor = admin(user);
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
  rowFor(actor, id);
  return db()
    .prepare(
      "SELECT id,occurred_at,actor,action,detail FROM audit WHERE object_id=? AND tenant_id=? ORDER BY occurred_at DESC LIMIT 100",
    )
    .all(id, actor.tenantId);
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
function sourceFor(row: Row) {
  if (!row.enabled) throw new SecurityError("CONNECTION_DISABLED", 409);
  allowedTarget(row.endpoint);
  return readonlySource({
    endpoint: row.endpoint,
    tenantId: row.tenant_id,
    token: decryptSecret(
      row.secret,
      `${row.id}:${row.tenant_id}:${row.endpoint}`,
    ),
  });
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
    tasks.push(
      {
        id: "ready",
        run: async () => {
          source = sourceFor(row);
          return source.ready();
        },
      },
      { id: "observability", run: () => source.observability() },
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
        JSON.stringify({ version: row.credential_version, at, checks }),
      );
      db()
        .prepare(
          "UPDATE connections SET last_validation=?,last_code=?,validated_version=? WHERE id=?",
        )
        .run(at, code, code === "OK" ? row.credential_version : null, id);
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
    sourceFor(row);
    transaction(() => {
      setSetting(activeKey(actor.tenantId), id);
      setSetting(modeKey(actor.tenantId), "LIVE");
      audit(actor.id, "connection.activated", id, actor.tenantId);
    });
    return view(rowFor(actor, id));
  }
  transaction(() => {
    if (value.action === "disable")
      db()
        .prepare(
          "UPDATE connections SET enabled=0,credential_version=credential_version+1,last_code=NULL,validated_version=NULL,updated_at=? WHERE id=?",
        )
        .run(new Date().toISOString(), id);
    else {
      const endpoint =
        value.action === "update"
          ? allowedTarget(value.endpoint).origin
          : row.endpoint;
      const secret =
        value.action === "rotate"
          ? value.credential
          : decryptSecret(row.secret, `${id}:${row.tenant_id}:${row.endpoint}`);
      const encrypted = encryptSecret(
        secret,
        `${id}:${row.tenant_id}:${endpoint}`,
      );
      db()
        .prepare(
          "UPDATE connections SET name=?,environment=?,endpoint=?,service_identity=?,secret=?,credential_version=credential_version+1,enabled=1,last_code=NULL,last_validation=NULL,validated_version=NULL,updated_at=? WHERE id=?",
        )
        .run(
          value.action === "update" ? value.name : row.name,
          value.action === "update" ? value.environment : row.environment,
          endpoint,
          value.action === "update"
            ? value.serviceIdentity
            : row.service_identity,
          encrypted,
          new Date().toISOString(),
          id,
        );
    }
    db().prepare("DELETE FROM snapshots WHERE connection_id=?").run(id);
    audit(actor.id, "connection." + value.action, id, actor.tenantId, {
      version: row.credential_version + 1,
    });
  });
  return view(rowFor(actor, id));
}
export function modeFor(tenant: string) {
  return setting(modeKey(tenant)) ?? config().dataMode;
}
export function useMock(user: Principal | undefined) {
  const actor = admin(user);
  transaction(() => {
    setSetting(modeKey(actor.tenantId), "MOCK");
    audit(actor.id, "mode.mock", "workspace", actor.tenantId);
  });
}
export function liveSource(user: Principal | undefined) {
  const actor = requireRole(user);
  if (modeFor(actor.tenantId) !== "LIVE" || !config().liveEnabled)
    throw new SecurityError("LIVE_DISABLED", 409);
  const id = setting(activeKey(actor.tenantId));
  if (!id) throw new SecurityError("LIVE_NOT_CONFIGURED", 409);
  const row = rowFor(actor, id);
  if (
    row.last_code !== "OK" ||
    row.validated_version !== row.credential_version
  )
    throw new SecurityError("VALIDATION_REQUIRED", 409);
  return { row, source: sourceFor(row) };
}
export async function portalData(
  user: Principal | undefined,
): Promise<PortalData> {
  const actor = requireRole(user),
    mode = modeFor(actor.tenantId);
  if (mode === "MOCK") {
    const [operations, events, diagnostics] = await Promise.all([
      mockSource.operations(),
      mockSource.events(),
      mockSource.observability(),
    ]);
    return {
      mode,
      operations,
      events: uniqueEvents(events.events),
      diagnostics,
      freshness: freshness(diagnostics.observed_at),
      partial: false,
      blocked: false,
    };
  }
  if (mode !== "LIVE") throw new SecurityError("INVALID_DATA_MODE", 503);
  const empty: PortalData = {
    mode: "LIVE",
    operations: [],
    events: [],
    diagnostics: null,
    freshness: "unknown",
    partial: true,
    blocked: true,
  };
  let context: ReturnType<typeof liveSource>;
  try {
    context = liveSource(actor);
  } catch {
    return empty;
  }
  try {
    const [operations, eventPage, diagnostics] = await Promise.all([
      context.source.operations(),
      context.source.events(),
      context.source.observability(),
    ]);
    const payload = {
      ...empty,
      operations,
      events: uniqueEvents(eventPage.events),
      diagnostics,
      freshness: freshness(diagnostics.observed_at),
      partial: false,
      blocked: false,
    };
    const current = rowFor(actor, context.row.id);
    if (
      current.credential_version !== context.row.credential_version ||
      !current.enabled
    )
      throw new SecurityError("CONNECTION_CHANGED", 409);
    db()
      .prepare(
        "INSERT INTO snapshots VALUES(?,?,?,?) ON CONFLICT(connection_id) DO UPDATE SET version=excluded.version,payload=excluded.payload,saved_at=excluded.saved_at",
      )
      .run(
        context.row.id,
        context.row.credential_version,
        JSON.stringify(payload),
        new Date().toISOString(),
      );
    return payload;
  } catch {
    const snapshot = db()
      .prepare(
        "SELECT payload FROM snapshots WHERE connection_id=? AND version=?",
      )
      .get(context.row.id, context.row.credential_version) as
      { payload: string } | undefined;
    if (!snapshot) return { ...empty, blocked: false };
    return {
      ...JSON.parse(snapshot.payload),
      mode: "LIVE",
      freshness: "stale",
      partial: true,
      blocked: false,
    };
  }
}
