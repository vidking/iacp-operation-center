import { z } from "zod";
import { contractPath, crmActions } from "../../types/iacp-client.ts";
import { iacpOperations } from "../../types/iacp.generated.ts";
import { createHash } from "node:crypto";
import { secureJson } from "../connections/transport.ts";
import { sharedRead } from "../connections/reads.ts";
import { connectionContext, authorizedRead } from "../connections/service.ts";
import { requireRole, throttle } from "../security/auth.ts";
import { db, audit } from "../security/database.ts";
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
export async function read<T>(
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
      const parsed = schema.parse(await sharedRead(c.endpoint, path, c.token));
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
    const [plans, images, profiles, usage] = await Promise.all([
      contract === "commercial"
        ? read(user, contractPath("listKVMPlans"), planSchema.array())
        : Promise.resolve([]),
      contract === "commercial"
        ? read(user, contractPath("listGoldenImages"), imageSchema.array())
        : Promise.resolve([]),
      read(user, contractPath("listAuthorizedProfiles"), profileSchema.array()),
      read(user, contractPath("getLabUsage"), usageSchema),
    ]);
    const policies: z.infer<typeof policySchema>[] = [];
    for (let offset = 0; contract === "profile"; offset += 100) {
      const page = await read(
        user,
        `${contractPath("listLabPolicies")}?limit=100&offset=${offset}`,
        policySchema.array(),
      );
      if (page.some((p) => p.tenant_id !== c.tenant))
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      policies.push(...page);
      if (page.length < 100) break;
    }
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
export async function inventory(
  user: Principal | undefined,
  offset = 0,
  query = "",
) {
  const c = connectionContext(user);
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new SecurityError("INVALID_OFFSET");
  const normalizedQuery = query.trim().toLowerCase();
  return bounded(
    `inventory:${c.id}:${c.version}:${offset}:${normalizedQuery}`,
    async () => {
      let instances: z.infer<typeof instanceSchema>[];
      if (normalizedQuery) {
        const all: z.infer<typeof instanceSchema>[] = [];
        for (let pageOffset = 0; ; pageOffset += 100) {
          const page = await read(
            user,
            `${contractPath("listInstances")}?limit=100&offset=${pageOffset}`,
            instanceSchema.array(),
          );
          all.push(...page);
          if (page.length < 100) break;
        }
        instances = all.filter((instance) =>
          `${instance.name} ${instance.instance_id} ${instance.vmid ?? ""} ${instance.image} ${instance.node ?? ""} ${instance.ip_addresses.join(" ")}`
            .toLowerCase()
            .includes(normalizedQuery),
        );
      } else {
        instances = await read(
          user,
          `${contractPath("listInstances")}?limit=100&offset=${offset}`,
          instanceSchema.array(),
        );
      }
      if (instances.some((i) => i.tenant_id !== c.tenant))
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      if (instances.some((i) => i.infrastructure_kind === "simulated"))
        throw new SecurityError("NON_REAL_INFRASTRUCTURE_REJECTED", 502);
      return {
        instances,
        offset: normalizedQuery ? 0 : offset,
        hasMore: normalizedQuery ? false : instances.length === 100,
        searched: normalizedQuery.length > 0,
        observedAt: new Date().toISOString(),
      };
    },
  );
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
      const instance = await read(
        user,
        contractPath("getInstance", { instance_id: id }),
        instanceSchema,
      );
      if (instance.tenant_id !== c.tenant || instance.instance_id !== id)
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      if (instance.infrastructure_kind === "simulated")
        throw new SecurityError("NON_REAL_INFRASTRUCTURE_REJECTED", 502);
      const [contract, observedPower, operations, policies] = await Promise.all(
        [
          creationContract(user),
          (async () => {
            if (instance.status === "deleted")
              return { power: null, powerError: null };
            try {
              const power = await read(
                user,
                contractPath("getInstancePower", { instance_id: id }),
                powerSchema,
              );
              if (power.instance_id !== id)
                throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
              return { power, powerError: null };
            } catch (e) {
              if (
                e instanceof SecurityError &&
                [
                  "UPSTREAM_CONFLICT",
                  "UPSTREAM_NOT_FOUND",
                  "UPSTREAM_SERVICE_UNAVAILABLE",
                ].includes(e.code)
              )
                return { power: null, powerError: e.upstreamCode ?? e.code };
              throw e;
            }
          })(),
          read(
            user,
            `${contractPath("listOperations")}?instance_id=${id}&limit=50&offset=${operationOffset}`,
            operationSchema.array(),
          ),
          read(
            user,
            contractPath("listLabPolicies") + "?limit=100&offset=0",
            policySchema.array(),
          ),
        ],
      );
      const { power, powerError } = observedPower;
      if (operations.some((o) => o.instance_id !== id))
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      if (policies.some((p) => p.tenant_id !== c.tenant))
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      return {
        creationContract: contract,
        capabilities: await publishedActions(user),
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
        "discover",
        "initialize",
        "verifyAccess",
        "provision",
        "retryProvision",
      ]),
      instanceId: uuid.optional(),
      payload: z.unknown().optional(),
      confirmName: z.string().optional(),
      recoveryOperationId: uuid.optional(),
      expectedOperationUpdatedAt: z.iso.datetime({ offset: true }).optional(),
      expectedInstanceUpdatedAt: z.iso.datetime({ offset: true }).optional(),
    })
    .strict()
    .parse(input);
  const c = connectionContext(actor);
  const contract = await creationContract(user);
  const payload =
    value.action === "create"
      ? contract === "commercial"
        ? commercialCreateSchema.parse(value.payload)
        : createInstanceSchema.parse(value.payload)
      : value.action === "retryProvision"
        ? z
            .object({ expected_attempt: z.number().int().positive() })
            .strict()
            .parse(value.payload)
        : z
            .object({})
            .strict()
            .parse(value.payload ?? {});
  const canonical = JSON.stringify({
    action: value.action,
    instanceId: value.instanceId ?? null,
    payload,
    ...(["reconcile", "provision", "retryProvision"].includes(value.action)
      ? { recoveryOperationId: value.recoveryOperationId ?? null }
      : {}),
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
      contractPath("getInstance", { instance_id: instanceId }),
      instanceSchema,
    );
    if (instance.tenant_id !== c.tenant || instance.instance_id !== instanceId)
      throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
    if (instance.infrastructure_kind === "simulated")
      throw new SecurityError("NON_REAL_INFRASTRUCTURE_REJECTED", 502);
    if (["deleted", "deleting"].includes(instance.status))
      throw new SecurityError("RESOURCE_NO_LONGER_ACTIVE", 409);
    if (value.action === "reconcile")
      await validateRecovery(user, instanceId, value);
    if (
      instance.infrastructure_kind !== "kvm" &&
      !["reconcile", "provision", "retryProvision"].includes(value.action)
    )
      throw new SecurityError("REAL_KVM_REQUIRED", 409);
    if (
      [
        "discover",
        "initialize",
        "verifyAccess",
        "provision",
        "retryProvision",
      ].includes(value.action)
    ) {
      await validateContractAction(
        user,
        value.action as keyof typeof crmActions,
        instanceId,
        value,
      );
    } else if (value.action !== "reconcile") {
      const power = await read(
        user,
        contractPath("getInstancePower", { instance_id: instanceId }),
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
  let submitted = false;
  try {
    if (value.action === "reconcile")
      await validateRecovery(actor, instanceId!, value);
    if (
      [
        "discover",
        "initialize",
        "verifyAccess",
        "provision",
        "retryProvision",
      ].includes(value.action)
    )
      await validateContractAction(actor, value.action, instanceId!, value);
    // Revalidate the read connection immediately before a command. The
    // mutation response itself is deliberately outside authorizedRead: a
    // legitimate IACP 401/403 for one operation must not invalidate the
    // otherwise healthy connection used by the portal.
    await authorizedRead(actor, (source) => source.observability());
    const current = connectionContext(actor);
    if (
      current.id !== c.id ||
      current.version !== c.version ||
      current.tenant !== c.tenant ||
      current.endpoint !== c.endpoint
    )
      throw new SecurityError("CONNECTION_CHANGED", 409);
    if (instanceId) {
      const latest = await read(
        actor,
        contractPath("getInstance", { instance_id: instanceId }),
        instanceSchema,
      );
      if (
        latest.tenant_id !== current.tenant ||
        latest.instance_id !== instanceId
      )
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      if (latest.infrastructure_kind === "simulated")
        throw new SecurityError("NON_REAL_INFRASTRUCTURE_REJECTED", 502);
      if (["deleted", "deleting"].includes(latest.status))
        throw new SecurityError("RESOURCE_NO_LONGER_ACTIVE", 409);
      if (value.action === "reconcile")
        await validateRecovery(actor, instanceId, value);
    }
    const path = contractPath(
      crmActions[value.action],
      value.action === "create" ? {} : { instance_id: instanceId! },
    );
    submitted = true;
    const result = acceptedSchema.parse(
      await secureJson(current.endpoint, path, current.token, {
        method: value.action === "delete" ? "DELETE" : "POST",
        body: payload,
        key: value.key,
      }),
    );
    if (instanceId && result.instance_id !== instanceId)
      throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
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
    const rejected =
      !submitted ||
      [
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

// Read-only preflight. IACP remains the authority for admission and its final response.
export async function recoveryContract(user: Principal | undefined) {
  const api = await read(
    user,
    "/openapi.json",
    z.object({ paths: z.record(z.string(), z.unknown()) }),
  );
  const route = z
    .object({ post: z.object({ responses: z.object({ "202": z.unknown() }) }) })
    .safeParse(api.paths[iacpOperations.reconcileInstance.path]);
  return route.success;
}
export async function validateRecovery(
  user: Principal | undefined,
  id: string,
  expected: {
    recoveryOperationId?: string;
    expectedOperationUpdatedAt?: string;
    expectedInstanceUpdatedAt?: string;
  } = {},
) {
  const instance = await read(
    user,
    contractPath("getInstance", { instance_id: id }),
    instanceSchema,
  );
  if (
    instance.instance_id !== id ||
    ["deleted", "deleting"].includes(instance.status)
  )
    throw new SecurityError("RESOURCE_NO_LONGER_ACTIVE", 409);
  if (!(await recoveryContract(user)))
    throw new SecurityError("RECONCILIATION_NOT_AVAILABLE", 409);
  let operation;
  if (expected.recoveryOperationId) {
    operation = await read(
      user,
      `/v1/operations/${uuid.parse(expected.recoveryOperationId)}`,
      operationSchema,
    );
    if (
      operation.operation_id !== expected.recoveryOperationId ||
      operation.instance_id !== id
    )
      throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
  } else {
    for (let offset = 0; ; offset += 50) {
      const ops = await read(
        user,
        `${contractPath("listOperations")}?instance_id=${id}&limit=50&offset=${offset}`,
        operationSchema.array(),
      );
      if (ops.some((o) => o.instance_id !== id))
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      operation = ops.find(
        (o) => o.normalized_status === "uncertain" && o.recovery_required,
      );
      if (operation || ops.length < 50) break;
    }
  }
  if (
    !operation ||
    operation.normalized_status !== "uncertain" ||
    !operation.recovery_required
  )
    throw new SecurityError("RECOVERY_NOT_ELIGIBLE", 409);
  if (
    (expected.expectedOperationUpdatedAt &&
      operation.updated_at !== expected.expectedOperationUpdatedAt) ||
    (expected.expectedInstanceUpdatedAt &&
      instance.updated_at !== expected.expectedInstanceUpdatedAt)
  )
    throw new SecurityError("EVIDENCE_CHANGED_REFRESH_REQUIRED", 409);
  return { instance, operation };
}

export async function publishedActions(user: Principal | undefined) {
  const api = await read(
    user,
    "/openapi.json",
    z.object({ paths: z.record(z.string(), z.unknown()) }),
  );
  return Object.entries(crmActions)
    .filter(([, id]) => {
      const parsed = z
        .record(z.string(), z.unknown())
        .safeParse(api.paths[iacpOperations[id].path]);
      return (
        parsed.success &&
        z
          .object({ responses: z.object({ "202": z.unknown() }) })
          .safeParse(parsed.data[iacpOperations[id].method.toLowerCase()])
          .success
      );
    })
    .map(([action]) => action);
}
export async function validateContractAction(
  user: Principal | undefined,
  action: keyof typeof crmActions,
  id: string,
  expected: {
    payload?: unknown;
    recoveryOperationId?: string;
    expectedOperationUpdatedAt?: string;
    expectedInstanceUpdatedAt?: string;
    confirmName?: string;
  },
) {
  const instance = await read(
    user,
    contractPath("getInstance", { instance_id: id }),
    instanceSchema,
  );
  if (
    instance.instance_id !== id ||
    ["deleted", "deleting"].includes(instance.status)
  )
    throw new SecurityError("RESOURCE_NO_LONGER_ACTIVE", 409);
  const api = await read(
    user,
    "/openapi.json",
    z.object({ paths: z.record(z.string(), z.unknown()) }),
  );
  const route =
    api.paths[
      Object.values(crmActions).includes(crmActions[action])
        ? iacpOperations[crmActions[action]].path
        : ""
    ];
  if (
    !z
      .object({
        post: z.object({ responses: z.object({ "202": z.unknown() }) }),
      })
      .safeParse(route).success
  )
    throw new SecurityError("CAPABILITY_NOT_PUBLISHED", 409);
  if (
    expected.expectedInstanceUpdatedAt &&
    instance.updated_at !== expected.expectedInstanceUpdatedAt
  )
    throw new SecurityError("EVIDENCE_CHANGED_REFRESH_REQUIRED", 409);
  if (action === "provision" || action === "retryProvision") {
    if (expected.confirmName !== instance.name || !expected.recoveryOperationId)
      throw new SecurityError("RESOURCE_CONFIRMATION_REQUIRED", 409);
    const op = await read(
      user,
      contractPath("getOperation", {
        operation_id: expected.recoveryOperationId,
      }),
      operationSchema,
    );
    if (
      op.instance_id !== id ||
      op.operation_id !== expected.recoveryOperationId
    )
      throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
    if (
      expected.expectedOperationUpdatedAt &&
      op.updated_at !== expected.expectedOperationUpdatedAt
    )
      throw new SecurityError("EVIDENCE_CHANGED_REFRESH_REQUIRED", 409);
    if (
      op.kind !== "instance.create" ||
      !op.provisioning ||
      op.normalized_status === "uncertain"
    )
      throw new SecurityError("RECOVERY_NOT_ELIGIBLE", 409);
    if (action === "retryProvision") {
      const body = z
        .object({ expected_attempt: z.number().int().positive() })
        .strict()
        .parse(expected.payload);
      if (
        op.normalized_status !== "failed" ||
        op.provisioning.phase !== "failed" ||
        op.provisioning.started_at ||
        body.expected_attempt !== op.provisioning.attempt
      )
        throw new SecurityError("RECOVERY_NOT_ELIGIBLE", 409);
    }
  }
}
export async function reference(
  user: Principal | undefined,
  kind: "job" | "policy",
  id: string,
) {
  uuid.parse(id);
  if (kind === "policy")
    return read(
      user,
      contractPath("getLabPolicy", { policy_id: id }),
      policySchema,
    );
  const job = await read(
    user,
    contractPath("getJob", { job_id: id }),
    z.object({
      job_id: z.string(),
      operation: z.string(),
      status: z.string(),
      created_at: z.iso.datetime({ offset: true }),
      updated_at: z.iso.datetime({ offset: true }),
    }),
  );
  if (job.job_id !== id)
    throw new SecurityError("UPSTREAM_CONTRACT_ERROR", 502);
  return job;
}
