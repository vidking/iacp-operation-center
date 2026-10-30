import { z } from "zod";
import { sharedRead } from "./reads.ts";
import { SecurityError } from "../security/config.ts";
import type { ApiProfile } from "../../types/security.ts";

export type ScopeMode = "tenant" | "single-tenant-endpoint";

export interface ContractDescriptor {
  profile: ApiProfile;
  createRef: string;
  scopeMode: ScopeMode;
  scopeBinding: string | null;
}

const recordSchema = z.record(z.string(), z.unknown());
const timestamp = z.iso.datetime({ offset: true });

function record(value: unknown, code = "UPSTREAM_CONTRACT_ERROR") {
  const parsed = recordSchema.safeParse(value);
  if (!parsed.success) throw new SecurityError(code, 502);
  return parsed.data;
}

function requiredString(value: unknown) {
  if (typeof value !== "string" || !value.trim())
    throw new SecurityError("UPSTREAM_CONTRACT_ERROR", 502);
  return value;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function requiredTimestamp(value: unknown) {
  const parsed = timestamp.safeParse(value);
  if (!parsed.success) throw new SecurityError("UPSTREAM_CONTRACT_ERROR", 502);
  return parsed.data;
}

function evidenceTimestamp(value: Record<string, unknown>) {
  for (const key of ["updated_at", "finished_at", "started_at", "created_at"])
    if (value[key] !== undefined && value[key] !== null)
      return requiredTimestamp(value[key]);
  throw new SecurityError("UPSTREAM_CONTRACT_ERROR", 502);
}

function optionalTimestamp(value: unknown) {
  if (value === null || value === undefined) return null;
  return requiredTimestamp(value);
}

function nonNegativeInt(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : fallback;
}

function requiredInt(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new SecurityError("UPSTREAM_CONTRACT_ERROR", 502);
  return value;
}

function nullableInt(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function collection(value: unknown, key: string) {
  if (Array.isArray(value)) return value;
  const root = record(value),
    items = root[key];
  if (!Array.isArray(items))
    throw new SecurityError("UPSTREAM_CONTRACT_ERROR", 502);
  return items;
}

function operationStatus(value: unknown) {
  const raw = requiredString(value).toLowerCase();
  if (["queued", "pending", "planned"].includes(raw)) return "queued" as const;
  if (
    ["running", "planning", "applying", "destroying", "powering"].includes(raw)
  )
    return "running" as const;
  if (["completed", "succeeded", "success"].includes(raw))
    return "completed" as const;
  if (raw === "uncertain") return "uncertain" as const;
  if (raw === "failed") return "failed" as const;
  throw new SecurityError("UPSTREAM_CONTRACT_ERROR", 502);
}

function operationKind(value: Record<string, unknown>) {
  const action = optionalString(value.action) ?? optionalString(value.command);
  if (action === "provision" || action === "apply" || action === "plan")
    return "instance.create";
  if (action === "destroy") return "instance.delete";
  if (action === "power") return "instance.power";
  if (action === "reconcile") return "instance.reconcile";
  return action ?? "operation";
}

function instanceStatus(value: unknown) {
  const raw = requiredString(value).toLowerCase();
  if (raw === "succeeded") return "ready";
  if (["pending", "planned"].includes(raw)) return "pending";
  if (["planning", "applying", "running", "powering"].includes(raw))
    return "provisioning";
  if (raw === "destroying") return "deleting";
  return raw;
}

function v2Availability() {
  return {
    available: true,
    capacity_verified: false,
    reasons: ["CAPACITY_NOT_PUBLISHED_BY_UPSTREAM"],
  };
}

export function descriptorFromOpenApi(value: unknown): ContractDescriptor {
  const root = record(value),
    paths = record(root.paths);
  const instances = record(paths["/v1/instances"]);
  const post = record(instances.post);
  const requestBody = record(post.requestBody);
  const content = record(requestBody.content);
  const applicationJson = record(content["application/json"]);
  const schema = record(applicationJson.schema);
  const createRef = requiredString(schema.$ref);
  const v2 =
    createRef === "#/components/schemas/InstanceCreateRequest" &&
    paths["/v1/instances/{instance_id}/provision"] !== undefined &&
    paths["/v1/instances/{instance_id}/reconcile"] !== undefined;
  if (v2)
    return {
      profile: "controlplane-v2",
      createRef,
      scopeMode: "single-tenant-endpoint",
      scopeBinding: null,
    };
  if (
    createRef === "#/components/schemas/CommercialInstanceCreate" ||
    createRef === "#/components/schemas/InstanceCreate"
  )
    return {
      profile: "legacy",
      createRef,
      scopeMode: "tenant",
      scopeBinding: null,
    };
  throw new SecurityError("UNSUPPORTED_CREATION_CONTRACT", 502);
}

export async function discoverContract(
  endpoint: string,
  token: string,
): Promise<ContractDescriptor> {
  const descriptor = descriptorFromOpenApi(
    await sharedRead(endpoint, "/openapi.json", token),
  );
  return descriptor;
}

export function normalizeV2Plan(value: unknown) {
  const item = record(value),
    planId = requiredString(item.plan_id);
  return {
    plan_id: planId,
    name: optionalString(item.name) ?? planId,
    vcpus: requiredInt(item.vcpus),
    memory_mb: requiredInt(item.memory_mb),
    disk_gb: requiredInt(item.disk_gb),
    availability: v2Availability(),
  };
}

export function normalizeV2Image(value: unknown) {
  const item = record(value),
    imageId = requiredString(item.image_id);
  const minimum = item.minimum_requirements;
  return {
    image_id: imageId,
    operating_system: optionalString(item.operating_system) ?? imageId,
    version: optionalString(item.version) ?? imageId,
    status: "habilitada" as const,
    cloud_init:
      typeof item.cloudinit_username === "string" ||
      typeof item.cloud_init === "boolean"
        ? ((item.cloud_init as boolean | null | undefined) ?? true)
        : null,
    qemu_guest_agent:
      typeof item.qemu_guest_agent === "boolean" ? item.qemu_guest_agent : null,
    root_access: null,
    ssh_access: null,
    minimum_requirements:
      minimum && typeof minimum === "object"
        ? {
            vcpus: nonNegativeInt((minimum as Record<string, unknown>).vcpus),
            memory_mb: nonNegativeInt(
              (minimum as Record<string, unknown>).memory_mb,
            ),
            disk_gb: nonNegativeInt(
              (minimum as Record<string, unknown>).disk_gb,
            ),
          }
        : {
            vcpus: nonNegativeInt(item.minimum_vcpus, 1),
            memory_mb: nonNegativeInt(item.minimum_memory_mb, 512),
            disk_gb: nonNegativeInt(item.minimum_disk_gb, 20),
          },
    compatible_plans: Array.isArray(item.compatible_plans)
      ? stringList(item.compatible_plans)
      : [],
    authorized: true,
    availability: v2Availability(),
  };
}

export function normalizeV2Operation(value: unknown) {
  const item = record(value);
  const operationId = requiredString(item.operation_id);
  const instanceId = requiredString(item.instance_id);
  const normalized = operationStatus(item.status);
  const latestEvent = item.latest_event;
  return {
    operation_id: operationId,
    instance_id: instanceId,
    kind: operationKind(item),
    status: normalized,
    normalized_status: normalized,
    source_status: requiredString(item.status),
    requested_by: optionalString(item.requested_by),
    error_code: optionalString(item.error_code),
    error_message: optionalString(item.error),
    created_at: requiredTimestamp(item.created_at),
    updated_at: evidenceTimestamp(item),
    recovery_required:
      typeof item.recovery_required === "boolean"
        ? item.recovery_required
        : normalized === "uncertain",
    provisioning: null,
    deletion: null,
    network: null,
    result: null,
    ...(latestEvent ? { events: [] } : {}),
  };
}

export function normalizeV2Instance(value: unknown) {
  const item = record(value),
    spec = record(item.spec);
  const instanceId = requiredString(item.instance_id);
  const operationId = requiredString(item.operation_id);
  return {
    instance_id: instanceId,
    tenant_id: null,
    operation_id: operationId,
    job_id: optionalString(item.job_id) ?? operationId,
    name: requiredString(item.name),
    image: optionalString(item.image) ?? requiredString(spec.image),
    vcpus: requiredInt(spec.vcpus),
    memory_mb: requiredInt(spec.memory_mb),
    disk_gb: requiredInt(spec.disk_gb),
    status: instanceStatus(item.status),
    infrastructure_kind: "kvm" as const,
    vmid: nullableInt(item.vmid),
    node: optionalString(item.node),
    access: null,
    ip_addresses: stringList(item.ip_addresses),
    network_mode: optionalString(spec.network_mode) ?? "unknown",
    network_observation:
      item.network_observation && typeof item.network_observation === "object"
        ? item.network_observation
        : null,
    result: null,
    network_profile: null,
    self_service_policy_id: null,
    created_at: requiredTimestamp(item.created_at),
    updated_at: requiredTimestamp(item.updated_at),
  };
}

export function normalizeV2Power(value: unknown) {
  const item = record(value);
  const power = requiredString(item.power_state);
  if (!(["running", "stopped"] as string[]).includes(power))
    throw new SecurityError("UPSTREAM_CONTRACT_ERROR", 502);
  return {
    instance_id: requiredString(item.instance_id),
    power_state: power,
    observed_at: requiredTimestamp(item.observed_at),
    mutations_available: Boolean(item.mutations_available),
    blocked_reason: optionalString(item.blocked_reason),
    guest_ready: null,
    guest_agent: "unknown" as const,
    cloud_init: "unknown" as const,
  };
}

export function normalizeV2Event(value: unknown) {
  const item = record(value);
  return {
    event_id: nonNegativeInt(item.event_id),
    correlation_id: optionalString(item.correlation_id),
    operation_id: requiredString(item.operation_id),
    instance_id: optionalString(item.instance_id),
    tenant_id: null,
    occurred_at: requiredTimestamp(item.occurred_at),
    kind: optionalString(item.kind) ?? "operation",
    status: optionalString(item.status) ?? "unknown",
    code: optionalString(item.code),
    actor: optionalString(item.actor),
    service: null,
  };
}

export function normalizeV2Diagnostics(value: unknown) {
  const item = record(value);
  const active = Array.isArray(item.active_operations)
    ? item.active_operations.length
    : nonNegativeInt(item.active_operations);
  const uncertain = Array.isArray(item.uncertain_operations)
    ? item.uncertain_operations.length
    : nonNegativeInt(item.uncertain_operations);
  return {
    tenant_id: null,
    observed_at: null,
    dependencies: {},
    active_operations: active,
    uncertain_operations: uncertain,
    oldest_active_age_seconds: null,
    worker_liveness: "unknown" as const,
    queue_depth: null,
    queue_scope: "not-disclosed" as const,
  };
}

export function normalizeV2EventPage(value: unknown) {
  const root = record(value),
    events = Array.isArray(root.events)
      ? root.events.map(normalizeV2Event)
      : [];
  const next = root.next_after;
  return {
    events,
    next_after:
      typeof next === "number" && Number.isSafeInteger(next)
        ? next
        : Math.max(0, ...events.map((event) => event.event_id)),
  };
}

export function normalizeV2Response(path: string, value: unknown): unknown {
  if (path === "/v1/plans")
    return collection(value, "plans").map(normalizeV2Plan);
  if (path === "/v1/images")
    return collection(value, "images").map(normalizeV2Image);
  if (/^\/v1\/instances\/[a-zA-Z0-9_-]{1,128}\/power$/.test(path))
    return normalizeV2Power(value);
  if (/^\/v1\/instances\/[a-zA-Z0-9_-]{1,128}$/.test(path))
    return normalizeV2Instance(value);
  if (path === "/v1/instances" || path.startsWith("/v1/instances?"))
    return collection(value, "instances").map(normalizeV2Instance);
  if (/^\/v1\/operations\/[a-zA-Z0-9_-]{1,128}$/.test(path))
    return normalizeV2Operation(value);
  if (path === "/v1/operations" || path.startsWith("/v1/operations?"))
    return collection(value, "operations").map(normalizeV2Operation);
  if (path === "/v1/events" || path.startsWith("/v1/events?"))
    return normalizeV2EventPage(value);
  if (path === "/v1/observability") return normalizeV2Diagnostics(value);
  return value;
}

export function normalizeV2Accepted(value: unknown) {
  const item = record(value);
  return {
    instance_id: requiredString(item.instance_id),
    operation_id: requiredString(item.operation_id),
    status: requiredString(item.status),
    job_id: optionalString(item.job_id) ?? requiredString(item.operation_id),
  };
}

export function v2ActionPath(
  action: string,
  instanceId?: string,
): { path: string; statuses: number[]; body: unknown } | null {
  if (action === "create")
    return { path: "/v1/instances", statuses: [202], body: null };
  if (!instanceId) return null;
  const base = `/v1/instances/${
    instanceId === "{instance_id}" ? instanceId : encodeURIComponent(instanceId)
  }`;
  switch (action) {
    case "start":
      return { path: `${base}/power/start`, statuses: [202], body: null };
    case "shutdown":
      return { path: `${base}/power/shutdown`, statuses: [202], body: null };
    case "reboot":
      return { path: `${base}/power/reboot`, statuses: [202], body: null };
    case "delete":
      return { path: base, statuses: [202], body: null };
    case "reconcile":
      return { path: `${base}/reconcile`, statuses: [202], body: null };
    case "provision":
      return { path: `${base}/provision`, statuses: [200], body: null };
    default:
      return null;
  }
}
