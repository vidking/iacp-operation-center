import { z } from "zod";
import { createHash } from "node:crypto";
import { secureJson } from "../connections/transport.ts";
import { connectionContext, authorizedRead } from "../connections/service.ts";
import { discoverScope } from "../connections/source.ts";
import { requireRole, throttle } from "../security/auth.ts";
import { db, setting, setSetting, audit } from "../security/database.ts";
import { encryptSecret, decryptSecret } from "../security/crypto.ts";
import { SecurityError } from "../security/config.ts";
import {
  profileSchema,
  policySchema,
  instanceSchema,
  powerSchema,
  usageSchema,
  acceptedSchema,
  createInstanceSchema,
  activePolicy,
  planSchema,
  imageSchema,
  commercialCreateSchema,
} from "../../types/crm.ts";
import { freshness } from "../../types/observation.ts";
import { operationSchema } from "../../types/observation.ts";
import type { Principal } from "../../types/security.ts";
const uuid = z.uuid();
const operatorKey = (id: string) => "lifecycle:" + id;
const aad = (c: ReturnType<typeof connectionContext>) =>
  `lifecycle:${c.id}:${c.tenant}`;
export function lifecycleConfigured(user: Principal | undefined) {
  requireRole(user);
  try {
    const c = connectionContext(user);
    return !!setting(operatorKey(c.id));
  } catch {
    return false;
  }
}
export async function configureLifecycle(
  user: Principal | undefined,
  input: unknown,
) {
  const actor = requireRole(user, ["Administrator"]);
  throttle("connection-admin:" + actor.id, 30, 60000);
  const value = z
    .object({
      credential: z
        .string()
        .min(12)
        .max(4096)
        .regex(/^[\x21-\x7e]+$/),
      dedicatedTenantOperator: z.literal(true),
    })
    .strict()
    .parse(input);
  const c = connectionContext(actor);
  if (value.credential === c.token)
    throw new SecurityError("DEDICATED_OPERATOR_REQUIRED", 409);
  await authorizedRead(actor, async (source) => {
    await source.observability();
    const current = connectionContext(user);
    if (
      current.id !== c.id ||
      current.version !== c.version ||
      current.tenant !== c.tenant ||
      current.endpoint !== c.endpoint
    )
      throw new SecurityError("CONNECTION_CHANGED", 409);
    const scope = await discoverScope(c.endpoint, value.credential);
    if (scope.tenant_id !== c.tenant)
      throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 403);
    return true;
  });
  setSetting(operatorKey(c.id), encryptSecret(value.credential, aad(c)));
  audit(actor.id, "lifecycle.credential_registered", c.id, actor.tenantId);
  return { configured: true, permissions: "IACP authorizes each request" };
}
export function removeLifecycle(user: Principal | undefined) {
  const actor = requireRole(user, ["Administrator"]),
    c = connectionContext(actor);
  db().prepare("DELETE FROM settings WHERE key=?").run(operatorKey(c.id));
  audit(actor.id, "lifecycle.credential_removed", c.id, actor.tenantId);
  return { configured: false };
}
async function read<T>(
  user: Principal | undefined,
  path: string,
  schema: z.ZodType<T>,
) {
  const c = connectionContext(user);
  return authorizedRead(user, async (source) => {
    await source.observability();
    const current = connectionContext(user);
    if (
      current.id !== c.id ||
      current.version !== c.version ||
      current.tenant !== c.tenant ||
      current.endpoint !== c.endpoint
    )
      throw new SecurityError("CONNECTION_CHANGED", 409);
    try {
      const parsed = schema.parse(await secureJson(c.endpoint, path, c.token));
      const items = Array.isArray(parsed) ? parsed : [parsed];
      if (
        items.some(
          (item) =>
            item &&
            typeof item === "object" &&
            "tenant_id" in item &&
            item.tenant_id !== c.tenant,
        )
      )
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      return parsed;
    } catch (e) {
      if (e instanceof SecurityError) throw e;
      throw new SecurityError("UPSTREAM_CONTRACT_ERROR", 502);
    }
  });
}
export async function creationContract(
  user: Principal | undefined,
): Promise<"profile" | "commercial"> {
  const contract = await read(
    user,
    "/openapi.json",
    z.object({
      paths: z.object({
        "/v1/instances": z.object({
          post: z.object({
            requestBody: z.object({
              content: z.object({
                "application/json": z.object({
                  schema: z.object({ $ref: z.string() }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  );
  const ref =
    contract.paths["/v1/instances"].post.requestBody.content["application/json"]
      .schema.$ref;
  if (ref === "#/components/schemas/CommercialInstanceCreate")
    return "commercial";
  if (ref === "#/components/schemas/InstanceCreate") return "profile";
  throw new SecurityError("UNSUPPORTED_CREATION_CONTRACT", 502);
}
const inFlight = new Map<string, Promise<unknown>>();
const cooldown = new Map<string, { until: number; failures: number }>();
async function bounded<T>(key: string, run: () => Promise<T>): Promise<T> {
  if (inFlight.has(key)) return inFlight.get(key) as Promise<T>;
  const previous = cooldown.get(key);
  if (previous && previous.until > Date.now())
    throw new SecurityError("REFRESH_BACKOFF", 429);
  if (inFlight.size >= 16) throw new SecurityError("REFRESH_BUSY", 429);
  const pending = run();
  inFlight.set(key, pending);
  try {
    const data = await pending;
    cooldown.set(key, { until: Date.now(), failures: 0 });
    return data;
  } catch (e) {
    const failures = Math.min((previous?.failures ?? 0) + 1, 5);
    cooldown.set(key, {
      until: Date.now() + Math.min(60000, 2000 * 2 ** failures),
      failures,
    });
    throw e;
  } finally {
    inFlight.delete(key);
    if (cooldown.size > 512) {
      for (const [k, v] of cooldown)
        if (v.until < Date.now()) cooldown.delete(k);
    }
  }
}
export async function catalog(user: Principal | undefined) {
  const c = connectionContext(user);
  return bounded(`catalog:${c.id}:${c.version}`, async () => {
    const contract = await creationContract(user);
    const plans =
      contract === "commercial"
        ? await read(user, "/v1/plans", planSchema.array())
        : [];
    const images =
      contract === "commercial"
        ? await read(user, "/v1/images", imageSchema.array())
        : [];
    const profiles = await read(user, "/v1/profiles", profileSchema.array());
    const policies: z.infer<typeof policySchema>[] = [];
    for (let offset = 0; contract === "profile"; offset += 100) {
      const page = await read(
        user,
        `/v1/lab/policies?limit=100&offset=${offset}`,
        policySchema.array(),
      );
      if (page.some((p) => p.tenant_id !== c.tenant))
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      policies.push(...page);
      if (page.length < 100) break;
    }
    const usage = await read(user, "/v1/lab/usage", usageSchema);
    if (usage.tenant_id !== c.tenant)
      throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
    return {
      creationContract: contract,
      plans,
      images,
      profiles,
      policies,
      usage,
      observedAt: new Date().toISOString(),
    };
  });
}
export async function inventory(user: Principal | undefined, offset = 0) {
  const c = connectionContext(user);
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new SecurityError("INVALID_OFFSET");
  return bounded(`inventory:${c.id}:${c.version}:${offset}`, async () => {
    const instances = await read(
      user,
      `/v1/instances?limit=100&offset=${offset}`,
      instanceSchema.array(),
    );
    if (instances.some((i) => i.tenant_id !== c.tenant))
      throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
    if (instances.some((i) => i.infrastructure_kind === "simulated"))
      throw new SecurityError("NON_REAL_INFRASTRUCTURE_REJECTED", 502);
    return {
      instances,
      offset,
      hasMore: instances.length === 100,
      observedAt: new Date().toISOString(),
    };
  });
}
export async function detail(
  user: Principal | undefined,
  id: string,
  operationOffset = 0,
) {
  if (!Number.isSafeInteger(operationOffset) || operationOffset < 0)
    throw new SecurityError("INVALID_OFFSET");
  uuid.parse(id);
  const c = connectionContext(user);
  return bounded(
    `detail:${c.id}:${c.version}:${id}:${operationOffset}`,
    async () => {
      const instance = await read(user, `/v1/instances/${id}`, instanceSchema);
      if (instance.tenant_id !== c.tenant || instance.instance_id !== id)
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      if (instance.infrastructure_kind === "simulated")
        throw new SecurityError("NON_REAL_INFRASTRUCTURE_REJECTED", 502);
      let power: z.infer<typeof powerSchema> | null = null,
        powerError: string | null = null;
      try {
        power = await read(user, `/v1/instances/${id}/power`, powerSchema);
        if (power.instance_id !== id)
          throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      } catch (e) {
        if (
          e instanceof SecurityError &&
          [
            "UPSTREAM_CONFLICT",
            "UPSTREAM_NOT_FOUND",
            "UPSTREAM_SERVICE_UNAVAILABLE",
          ].includes(e.code)
        )
          powerError = e.code;
        else throw e;
      }
      const operations = await read(
        user,
        `/v1/operations?instance_id=${id}&limit=50&offset=${operationOffset}`,
        operationSchema.array(),
      );
      if (operations.some((o) => o.instance_id !== id))
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      const policies = await read(
        user,
        "/v1/lab/policies?limit=100&offset=0",
        policySchema.array(),
      );
      if (policies.some((p) => p.tenant_id !== c.tenant))
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      return {
        creationContract: await creationContract(user),
        policies,
        instance,
        power,
        powerError,
        operations,
        historyHasMore: operations.length === 50,
        observedAt: new Date().toISOString(),
      };
    },
  );
}
export function intents(user: Principal | undefined) {
  const actor = requireRole(user),
    c = connectionContext(actor);
  return db()
    .prepare(
      "SELECT id,action,instance_id,status,operation_id,error_code,created_at,updated_at FROM crm_intents WHERE workspace=? AND connection_id=? AND remote_tenant=? ORDER BY created_at DESC LIMIT 50",
    )
    .all(actor.tenantId, c.id, c.tenant);
}
export async function command(user: Principal | undefined, input: unknown) {
  const actor = requireRole(user, ["Administrator"]);
  const value = z
    .object({
      key: uuid,
      action: z.enum([
        "create",
        "start",
        "shutdown",
        "reboot",
        "delete",
        "reconcile",
      ]),
      instanceId: uuid.optional(),
      payload: z.unknown().optional(),
      confirmName: z.string().optional(),
    })
    .strict()
    .parse(input);
  const c = connectionContext(actor);
  const encoded = setting(operatorKey(c.id));
  if (!encoded) throw new SecurityError("LIFECYCLE_CREDENTIAL_REQUIRED", 409);
  const contract = await creationContract(user);
  const payload =
    value.action === "create"
      ? contract === "commercial"
        ? commercialCreateSchema.parse(value.payload)
        : createInstanceSchema.parse(value.payload)
      : {};
  const canonical = JSON.stringify({
    action: value.action,
    instanceId: value.instanceId ?? null,
    payload,
  });
  const hash = createHash("sha256").update(canonical).digest("hex");
  const existing = db()
    .prepare("SELECT * FROM crm_intents WHERE id=?")
    .get(value.key);
  if (existing) {
    if (
      existing.workspace !== actor.tenantId ||
      existing.connection_id !== c.id ||
      existing.remote_tenant !== c.tenant ||
      existing.payload_hash !== hash
    )
      throw new SecurityError("IDEMPOTENCY_CONFLICT", 409);
    // Never submit twice, including after process interruption or ambiguous timeout.
    return {
      intentId: value.key,
      status: existing.status,
      instance_id: existing.instance_id,
      operation_id: existing.operation_id,
      error: existing.error_code,
    };
  }
  // IACP is the admission authority. No local quotas, consumption caps or plan whitelist.
  let instanceId = value.instanceId;
  if (value.action !== "create") {
    if (!instanceId) throw new SecurityError("INSTANCE_REQUIRED");
    const instance = await read(
      user,
      `/v1/instances/${instanceId}`,
      instanceSchema,
    );
    if (instance.tenant_id !== c.tenant || instance.instance_id !== instanceId)
      throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
    if (instance.infrastructure_kind !== "kvm" && value.action !== "reconcile")
      throw new SecurityError("REAL_KVM_REQUIRED", 409);
    if (value.action !== "reconcile") {
      const power = await read(
        user,
        `/v1/instances/${instanceId}/power`,
        powerSchema,
      );
      if (power.instance_id !== instanceId)
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      if (
        freshness(power.observed_at) !== "fresh" ||
        !power.mutations_available ||
        instance.status !== "ready" ||
        (value.action === "start"
          ? power.power_state !== "stopped"
          : value.action === "delete"
            ? power.power_state !== "stopped"
            : power.power_state !== "running")
      )
        throw new SecurityError("POWER_STATE_BLOCKED", 409);
      if (
        value.action === "delete" &&
        (value.confirmName !== instance.name ||
          !instance.vmid ||
          instance.vmid < 30000)
      )
        throw new SecurityError("DELETE_CONFIRMATION_REQUIRED", 409);
    }
  }
  const at = new Date().toISOString();
  // Synchronous INSERT is the concurrency fence, before any upstream mutation.
  try {
    db()
      .prepare("INSERT INTO crm_intents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        value.key,
        actor.tenantId,
        c.id,
        c.tenant,
        actor.id,
        value.action,
        instanceId ?? null,
        hash,
        "uncertain",
        null,
        null,
        at,
        at,
      );
  } catch {
    throw new SecurityError("INTENT_ALREADY_RECORDED", 409);
  }
  audit(actor.id, "crm.request_recorded", value.key, actor.tenantId, {
    action: value.action,
  });
  try {
    const result = await authorizedRead(actor, async (source) => {
      await source.observability();
      const current = connectionContext(user);
      if (
        current.id !== c.id ||
        current.version !== c.version ||
        current.tenant !== c.tenant ||
        current.endpoint !== c.endpoint
      )
        throw new SecurityError("CONNECTION_CHANGED", 409);
      if (setting(operatorKey(c.id)) !== encoded)
        throw new SecurityError("CONNECTION_CHANGED", 409);
      const token = decryptSecret(encoded, aad(c));
      const scope = await discoverScope(c.endpoint, token);
      if (scope.tenant_id !== c.tenant)
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 403);
      const path =
        value.action === "create"
          ? "/v1/instances"
          : value.action === "delete"
            ? `/v1/instances/${instanceId}`
            : value.action === "reconcile"
              ? `/v1/instances/${instanceId}/reconcile`
              : `/v1/instances/${instanceId}/power/${value.action}`;
      const result = acceptedSchema.parse(
        await secureJson(c.endpoint, path, token, {
          method: value.action === "delete" ? "DELETE" : "POST",
          body: payload,
          key: value.key,
        }),
      );
      if (instanceId && result.instance_id !== instanceId)
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      return result;
    });
    db()
      .prepare(
        "UPDATE crm_intents SET status='accepted',instance_id=?,operation_id=?,updated_at=? WHERE id=?",
      )
      .run(
        result.instance_id,
        result.operation_id,
        new Date().toISOString(),
        value.key,
      );
    audit(actor.id, "crm.request_accepted", value.key, actor.tenantId, {
      operationId: result.operation_id,
    });
    return { ...result, intentId: value.key, admission: "accepted" };
  } catch (e) {
    const code =
      e instanceof SecurityError ? e.code : "UPSTREAM_CONTRACT_ERROR";
    const displayCode =
      e instanceof SecurityError ? (e.upstreamCode ?? code) : code;
    const rejected = [
      "UPSTREAM_UNAUTHORIZED",
      "UPSTREAM_FORBIDDEN",
      "UPSTREAM_CONFLICT",
      "UPSTREAM_VALIDATION_ERROR",
      "UPSTREAM_RATE_LIMITED",
      "UPSTREAM_NOT_FOUND",
    ].includes(code);
    db()
      .prepare(
        "UPDATE crm_intents SET status=?,error_code=?,updated_at=? WHERE id=?",
      )
      .run(
        rejected ? "rejected" : "uncertain",
        displayCode,
        new Date().toISOString(),
        value.key,
      );
    if (
      [
        "UPSTREAM_UNAUTHORIZED",
        "UPSTREAM_FORBIDDEN",
        "UPSTREAM_TENANT_MISMATCH",
      ].includes(code)
    )
      db().prepare("DELETE FROM settings WHERE key=?").run(operatorKey(c.id));
    audit(actor.id, "crm.request_failed", value.key, actor.tenantId, {
      code,
      uncertain: !rejected,
    });
    return {
      intentId: value.key,
      status: rejected ? "rejected" : "uncertain",
      error: displayCode,
      instance_id: instanceId ?? null,
      operation_id: null,
    };
  }
}
