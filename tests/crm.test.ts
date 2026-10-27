import { it, expect, vi } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
vi.mock("../src/lib/server/connections/transport.ts", async (original) => ({
  ...(await original<
    typeof import("../src/lib/server/connections/transport.ts")
  >()),
  secureJson: vi.fn(),
}));
import { secureJson } from "../src/lib/server/connections/transport";
import {
  createConnection,
  mutateConnection,
  listConnections,
} from "../src/lib/server/connections/service";
import {
  command,
  inventory,
  catalog,
  detail,
  validateRecovery,
  reference,
} from "../src/lib/server/crm/service";
import { db } from "../src/lib/server/security/database";
import { SecurityError } from "../src/lib/server/security/config";
import {
  incidentDetail,
  incidentList,
  reconcileIncident,
} from "../src/lib/server/incidents/service";
import { operationPage } from "../src/lib/server/incidents/operations";
import { activePolicy } from "../src/lib/types/crm";
import type { Principal } from "../src/lib/types/security";
async function fixture() {
  const actor: Principal = {
    id: randomUUID(),
    username: "fixture",
    role: "Administrator",
    tenantId: randomUUID(),
  };
  const tenant = randomUUID(),
    instanceId = randomUUID(),
    policyId = randomUUID(),
    operationId = randomUUID(),
    reader = randomBytes(32).toString("base64url");
  const profile = {
    profile: "fixture-profile",
    image: "fixture-image",
    network_mode: "dhcp",
    bridge: "fixture-bridge",
    vlan_tag: null,
    nodes: ["fixture-node"],
    minimum_disk_gb: 8,
    max_vcpus_per_instance: 4,
    max_memory_mb_per_instance: 4096,
    max_disk_gb_per_instance: 80,
    self_service_enabled: true,
    root_password_bootstrap: true,
    quotas: { instances: 3, vcpus: 8, memory_mb: 8192, disk_gb: 160 },
  };
  const policy = {
    policy_id: policyId,
    tenant_id: tenant,
    status: "approved",
    revoked_at: null,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    specification: {
      profiles: [profile.profile],
      actions: ["create", "start", "shutdown", "reboot", "delete"],
      max_instances: 3,
      max_vcpus: 8,
      max_memory_mb: 8192,
      max_disk_gb: 160,
      max_concurrent_operations: 2,
    },
  };
  const instance = {
    instance_id: instanceId,
    operation_id: operationId,
    tenant_id: tenant,
    name: "fixture-vm",
    image: profile.image,
    vcpus: 1,
    memory_mb: 512,
    disk_gb: 8,
    status: "ready",
    infrastructure_kind: "kvm",
    vmid: 30001,
    node: null,
    ip_addresses: [],
    network_profile: profile.profile,
    self_service_policy_id: policyId as string | null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const recovery = {
    operation_id: operationId,
    instance_id: instanceId,
    kind: "instance.create",
    status: "failed",
    normalized_status: "uncertain",
    requested_by: "fixture-operator",
    error_code: "PROVISIONING_UNCERTAIN",
    recovery_required: true,
    created_at: instance.created_at,
    updated_at: instance.updated_at,
  };
  let exposeRecovery = false,
    recoverySupported = true,
    beforeSubmit: (() => void) | undefined,
    beforeSubmitTriggered = false,
    commandToken = "";
  let commercial = false,
    available = true;
  let failure = "",
    power = "stopped",
    commands = 0;
  vi.mocked(secureJson).mockImplementation(
    async (_endpoint, path, token, request) => {
      if (failure === "revoked")
        throw new SecurityError("UPSTREAM_UNAUTHORIZED", 502);
      if (path === "/openapi.json")
        return {
          paths: {
            ...Object.fromEntries(
              [
                "network/discover",
                "network/initialize",
                "access/verify",
                "provision",
                "retry-provision",
              ].map((suffix) => [
                "/v1/instances/{instance_id}/" + suffix,
                { post: { responses: { "202": {} } } },
              ]),
            ),
            ...(recoverySupported
              ? {
                  "/v1/instances/{instance_id}/reconcile": {
                    post: { responses: { "202": {} } },
                  },
                }
              : {}),
            "/v1/instances": {
              post: {
                requestBody: {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: commercial
                          ? "#/components/schemas/CommercialInstanceCreate"
                          : "#/components/schemas/InstanceCreate",
                      },
                    },
                  },
                },
              },
            },
          },
        };
      if (path === "/health/ready") return { status: "ready" };
      if (path === "/v1/observability") {
        if (
          !beforeSubmitTriggered &&
          beforeSubmit &&
          db()
            .prepare(
              "SELECT 1 FROM crm_intents WHERE action='reconcile' AND status='uncertain' LIMIT 1",
            )
            .get()
        ) {
          beforeSubmitTriggered = true;
          beforeSubmit();
        }
        return {
          tenant_id: tenant,
          observed_at: new Date().toISOString(),
          dependencies: { orchestrator: "ready" },
          active_operations: 0,
          uncertain_operations: 0,
          oldest_active_age_seconds: 0,
        };
      }
      if (request) {
        commands++;
        commandToken = token;
        if (failure) throw new SecurityError(failure, 502);
        return {
          instance_id: instanceId,
          operation_id: operationId,
          job_id: randomUUID(),
          status: "queued",
        };
      }
      if (path === "/v1/plans")
        return [
          {
            plan_id: "fixture-plan",
            name: "Fixture plan",
            vcpus: 1,
            memory_mb: 2048,
            disk_gb: 50,
            availability: {
              available,
              capacity_verified: available,
              reasons: available ? [] : ["COMMERCIAL_PLAN_NOT_AUTHORIZED"],
            },
          },
          {
            plan_id: "fixture-other-plan",
            name: "Other published fixture plan",
            vcpus: 2,
            memory_mb: 4096,
            disk_gb: 100,
            availability: {
              available,
              capacity_verified: available,
              reasons: available ? [] : ["COMMERCIAL_PLAN_NOT_AUTHORIZED"],
            },
          },
        ];
      if (path === "/v1/images")
        return [
          {
            image_id: profile.image,
            operating_system: "Fixture OS",
            version: "1",
            status: "habilitada",
            cloud_init: true,
            qemu_guest_agent: true,
            root_access: true,
            ssh_access: true,
            minimum_requirements: { vcpus: 1, memory_mb: 512, disk_gb: 8 },
            compatible_plans: ["fixture-plan", "fixture-other-plan"],
            authorized: true,
            availability: {
              available,
              capacity_verified: available,
              reasons: [],
            },
          },
        ];
      if (path.startsWith("/v1/operations/")) return recovery;
      if (path.startsWith("/v1/operations?"))
        return exposeRecovery ? [recovery] : [];
      if (path === "/v1/profiles") return [profile];
      if (path.startsWith("/v1/jobs/"))
        return {
          job_id: path.split("/").at(-1),
          operation: "fixture",
          status: "completed",
          message: "never forward arbitrary job text",
          created_at: instance.created_at,
          updated_at: instance.updated_at,
        };
      if (path.startsWith("/v1/lab/policies"))
        return path.includes("?") ? [policy] : policy;
      if (path === "/v1/lab/usage")
        return {
          tenant_id: tenant,
          usage: {
            instances: 1,
            vcpus: 1,
            memory_mb: 512,
            disk_gb: 8,
            concurrent_operations: 0,
          },
          description: "Reserved",
        };
      if (path.endsWith("/power"))
        return {
          instance_id: instanceId,
          power_state: power,
          observed_at: new Date().toISOString(),
          mutations_available: true,
          guest_ready: null,
        };
      if (path.startsWith("/v1/instances?")) return [instance];
      if (path.startsWith("/v1/instances/")) return instance;
      if (path.startsWith("/v1/events")) return { events: [], next_after: 0 };
      return [];
    },
  );
  const connection = createConnection(actor, {
    name: "Fixture",
    environment: "development",
    endpoint: "https://iacp-fixture.invalid",
    serviceIdentity: "reader",
    credential: reader,
  });
  await mutateConnection(actor, connection.id, { action: "test" });
  await mutateConnection(actor, connection.id, { action: "activate" });
  return {
    recovery: recovery as typeof recovery & {
      provisioning?: {
        service: string;
        phase: string;
        attempt: number;
        started_at: string | null;
        finished_at: string | null;
      };
    },
    recoverable: () => (exposeRecovery = true),
    noRecoveryContract: () => (recoverySupported = false),
    beforeSubmit: (fn: () => void) => (beforeSubmit = fn),
    commercial: () => (commercial = true),
    unavailable: () => (available = false),
    actor,
    tenant,
    instanceId,
    policy,
    profile,
    instance,
    connection,
    reader,
    get commandToken() {
      return commandToken;
    },
    get commands() {
      return commands;
    },
    fail: (code: string) => (failure = code),
    power: (s: string) => (power = s),
  };
}
it("uses the active connection Bearer for operations without a second credential", async () => {
  const f = await fixture();
  const result = await command(f.actor, {
    key: randomUUID(),
    action: "create",
    payload: {
      name: "single-bearer-vm",
      image: f.profile.image,
      network_profile: f.profile.profile,
      self_service_policy_id: f.policy.policy_id,
      vcpus: 1,
      memory_mb: 512,
      disk_gb: 8,
    },
  });
  expect(result).toMatchObject({ admission: "accepted" });
  expect(f.commandToken).toBe(f.reader);
  expect(
    db().prepare("SELECT key FROM settings WHERE key LIKE 'lifecycle:%'").all(),
  ).toEqual([]);
});
it("reports an IACP mutation rejection without invalidating the connection", async () => {
  const f = await fixture();
  f.fail("UPSTREAM_FORBIDDEN");
  const result = await command(f.actor, {
    key: randomUUID(),
    action: "create",
    payload: {
      name: "forbidden-vm",
      image: f.profile.image,
      network_profile: f.profile.profile,
      self_service_policy_id: f.policy.policy_id,
      vcpus: 1,
      memory_mb: 512,
      disk_gb: 8,
    },
  });
  expect(result).toMatchObject({
    status: "rejected",
    error: "UPSTREAM_FORBIDDEN",
  });
  expect(
    listConnections(f.actor).find((item) => item.id === f.connection.id),
  ).toMatchObject({
    active: true,
    lastCode: "OK",
  });
});
it("creates once per stable intention and rejects a changed request; secrets never enter the journal", async () => {
  const f = await fixture(),
    key = randomUUID(),
    payload = {
      name: "new-vm",
      image: f.profile.image,
      network_profile: f.profile.profile,
      self_service_policy_id: f.policy.policy_id,
      vcpus: 1,
      memory_mb: 512,
      disk_gb: 8,
      access: {
        username: "root",
        password: randomBytes(24).toString("base64url"),
      },
    };
  const result = await command(f.actor, { key, action: "create", payload });
  expect(result).toMatchObject({
    admission: "accepted",
    instance_id: f.instanceId,
  });
  await command(f.actor, { key, action: "create", payload });
  expect(f.commands).toBe(1);
  expect(
    JSON.stringify(
      db().prepare("SELECT * FROM crm_intents WHERE id=?").get(key),
    ),
  ).not.toContain(payload.access.password);
  await expect(
    command(f.actor, {
      key,
      action: "create",
      payload: { ...payload, vcpus: 2 },
    }),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
});
it.each([
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_SERVICE_UNAVAILABLE",
  "UPSTREAM_UNAVAILABLE",
])(
  "never resubmits an ambiguous %s, even across repeated requests",
  async (code) => {
    const f = await fixture(),
      key = randomUUID();
    f.fail(code);
    expect(
      await command(f.actor, {
        key,
        action: "start",
        instanceId: f.instanceId,
      }),
    ).toMatchObject({ status: "uncertain" });
    await command(f.actor, { key, action: "start", instanceId: f.instanceId });
    expect(f.commands).toBe(1);
  },
);
it("persists safe upstream diagnostics with an uncertain intent", async () => {
  const f = await fixture();
  const original = vi.mocked(secureJson).getMockImplementation()!;
  vi.mocked(secureJson).mockImplementation(async (...args) => {
    if (args[3]) {
      const error = new SecurityError("UPSTREAM_SERVICE_UNAVAILABLE", 502);
      error.requestId = "11111111-1111-4111-8111-111111111111";
      error.upstreamStatus = 503;
      error.upstreamDetail =
        "Queue unavailable; repeat with the same Idempotency-Key";
      error.upstreamDurationMs = 17;
      throw error;
    }
    return original(...args);
  });
  const key = randomUUID();
  const result = await command(f.actor, {
    key,
    action: "start",
    instanceId: f.instanceId,
  });
  expect(result).toMatchObject({
    status: "uncertain",
    error: "UPSTREAM_SERVICE_UNAVAILABLE",
    diagnostic: {
      status: 503,
      requestId: "11111111-1111-4111-8111-111111111111",
      durationMs: 17,
    },
  });
  const row = db()
    .prepare("SELECT status,error_code,diagnostic FROM crm_intents WHERE id=?")
    .get(key) as { status: string; error_code: string; diagnostic: string };
  expect(row.status).toBe("uncertain");
  expect(JSON.parse(row.diagnostic)).toMatchObject({ status: 503 });
  expect(JSON.stringify(row)).not.toContain("Bearer");
  vi.mocked(secureJson).mockImplementation(original);
});
it.each([
  "UPSTREAM_UNAUTHORIZED",
  "UPSTREAM_FORBIDDEN",
  "UPSTREAM_CONFLICT",
  "UPSTREAM_RATE_LIMITED",
  "UPSTREAM_VALIDATION_ERROR",
])("records a definitive %s without leaking upstream bodies", async (code) => {
  const f = await fixture();
  f.fail(code);
  expect(
    await command(f.actor, {
      key: randomUUID(),
      action: "start",
      instanceId: f.instanceId,
    }),
  ).toMatchObject({ status: "rejected", error: code });
});
it("preserves local RBAC on all mutation paths", async () => {
  const f = await fixture();
  for (const role of ["Viewer", "Operator"] as const)
    await expect(
      command(
        { ...f.actor, role },
        { key: randomUUID(), action: "start", instanceId: f.instanceId },
      ),
    ).rejects.toThrow("FORBIDDEN");
  expect(f.commands).toBe(0);
});
it("supports lifecycle, delete confirmation and observation-only reconciliation", async () => {
  const f = await fixture();
  await command(f.actor, {
    key: randomUUID(),
    action: "start",
    instanceId: f.instanceId,
  });
  f.power("running");
  for (const action of ["shutdown", "reboot"])
    await command(f.actor, {
      key: randomUUID(),
      action,
      instanceId: f.instanceId,
    });
  await expect(
    command(f.actor, {
      key: randomUUID(),
      action: "delete",
      instanceId: f.instanceId,
      confirmName: f.instance.name,
    }),
  ).rejects.toThrow("POWER_STATE_BLOCKED");
  f.power("stopped");
  await expect(
    command(f.actor, {
      key: randomUUID(),
      action: "delete",
      instanceId: f.instanceId,
      confirmName: "wrong",
    }),
  ).rejects.toThrow("DELETE_CONFIRMATION_REQUIRED");
  await command(f.actor, {
    key: randomUUID(),
    action: "delete",
    instanceId: f.instanceId,
    confirmName: f.instance.name,
  });
  f.policy.status = "revoked";
  f.recoverable();
  await command(f.actor, {
    key: randomUUID(),
    action: "reconcile",
    instanceId: f.instanceId,
  });
  expect(f.commands).toBe(5);
});
it("loads real catalog and inventory and rejects synthetic or cross-tenant inventory", async () => {
  const f = await fixture();
  expect((await catalog(f.actor)).profiles[0].profile).toBe(f.profile.profile);
  expect((await inventory(f.actor)).instances[0].vmid).toBe(30001);
  f.instance.tenant_id = randomUUID();
  await expect(inventory(f.actor, 100)).rejects.toThrow(
    "UPSTREAM_TENANT_MISMATCH",
  );
  const g = await fixture();
  g.instance.infrastructure_kind = "simulated";
  await expect(inventory(g.actor)).rejects.toThrow(
    "NON_REAL_INFRASTRUCTURE_REJECTED",
  );
});
it("never serves prior inventory after credential revocation", async () => {
  const f = await fixture();
  await inventory(f.actor);
  f.fail("revoked");
  await expect(inventory(f.actor, 100)).rejects.toThrow(
    "UPSTREAM_UNAUTHORIZED",
  );
  expect(
    db()
      .prepare("SELECT * FROM snapshots WHERE connection_id=?")
      .get(f.connection.id),
  ).toBeUndefined();
});
it("checks observed power and never assigns unknown IP/node/guest readiness", async () => {
  const f = await fixture(),
    d = await detail(f.actor, f.instanceId);
  expect(d.instance.ip_addresses).toEqual([]);
  expect(d.instance.node).toBeNull();
  expect(d.power?.guest_ready).toBeNull();
});
it("does not treat expired policies as available", async () => {
  const f = await fixture();
  f.policy.expires_at = "2020-01-01T00:00:00Z";
  expect(activePolicy(f.policy, f.profile.profile, "create")).toBe(false);
});

it("does not impose consumption or profile-wide quotas before sending a new creation to IACP", async () => {
  const f = await fixture();
  f.profile.quotas.instances = 0;
  expect(
    await command(f.actor, {
      key: randomUUID(),
      action: "create",
      payload: {
        name: "new-intent",
        image: f.profile.image,
        network_profile: f.profile.profile,
        self_service_policy_id: f.policy.policy_id,
        vcpus: 1,
        memory_mb: 512,
        disk_gb: 8,
      },
    }),
  ).toMatchObject({ admission: "accepted" });
  expect(f.commands).toBe(1);
});

it("fences concurrent duplicate submissions", async () => {
  const f = await fixture(),
    key = randomUUID();
  const results = await Promise.allSettled([
    command(f.actor, { key, action: "start", instanceId: f.instanceId }),
    command(f.actor, { key, action: "start", instanceId: f.instanceId }),
  ]);
  expect(results.some((r) => r.status === "fulfilled")).toBe(true);
  expect(f.commands).toBe(1);
});

it("uses the deployed commercial schema and authoritative plan availability instead of historical profile quotas", async () => {
  const f = await fixture();
  f.commercial();
  f.profile.quotas.instances = 0;
  const c = await catalog(f.actor);
  expect(c.creationContract).toBe("commercial");
  expect(c.plans[0].plan_id).toBe("fixture-plan");
  const payload = {
    name: "new-commercial-vm",
    plan_id: "fixture-plan",
    image_id: f.profile.image,
    network: { profile_id: "lab-dhcp" },
    access: {
      root_password: randomBytes(24).toString("base64url"),
      ssh_public_keys: [],
    },
    start_on_create: true,
  };
  expect(
    await command(f.actor, { key: randomUUID(), action: "create", payload }),
  ).toMatchObject({ admission: "accepted" });
  expect(f.commands).toBe(1);
  const request = vi.mocked(secureJson).mock.calls.find((call) => call[3]);
  expect(request?.[3]?.body).toMatchObject({ plan_id: "fixture-plan" });
  expect(request?.[3]?.body).not.toHaveProperty("self_service_policy_id");
});
it("forwards a creation to IACP and presents its actual rejection without local admission gates", async () => {
  const f = await fixture();
  f.commercial();
  f.unavailable();
  f.fail("UPSTREAM_CONFLICT");
  expect(
    await command(f.actor, {
      key: randomUUID(),
      action: "create",
      payload: {
        name: "new-intent",
        plan_id: "fixture-plan",
        image_id: f.profile.image,
        network: { profile_id: "lab-dhcp" },
        access: {
          root_password: randomBytes(24).toString("base64url"),
          ssh_public_keys: [],
        },
        start_on_create: true,
      },
    }),
  ).toMatchObject({ status: "rejected", error: "UPSTREAM_CONFLICT" });
  expect(f.commands).toBe(1);
});

it("allows commercial lifecycle only with current power authorization even without a legacy lab policy", async () => {
  const f = await fixture();
  f.commercial();
  f.instance.self_service_policy_id = null;
  expect((await detail(f.actor, f.instanceId)).creationContract).toBe(
    "commercial",
  );
  f.policy.status = "revoked";
  expect(
    await command(f.actor, {
      key: randomUUID(),
      action: "start",
      instanceId: f.instanceId,
    }),
  ).toMatchObject({ admission: "accepted" });
});

it("sends independent consecutive commercial creations with fresh keys and no local quantity ceiling", async () => {
  const f = await fixture();
  f.commercial();
  f.profile.quotas.instances = 0;
  const keys = new Set<string>();
  for (const name of [
    "successive-one",
    "successive-two",
    "successive-three",
    "successive-other-plan",
  ]) {
    const key = randomUUID();
    keys.add(key);
    expect(
      await command(f.actor, {
        key,
        action: "create",
        payload: {
          name,
          plan_id:
            name === "successive-other-plan"
              ? "fixture-other-plan"
              : "fixture-plan",
          image_id: f.profile.image,
          network: { profile_id: "lab-dhcp" },
          access: {
            root_password: randomBytes(24).toString("base64url"),
            ssh_public_keys: [],
          },
          start_on_create: true,
        },
      }),
    ).toMatchObject({ admission: "accepted" });
  }
  expect(keys.size).toBe(4);
  expect(f.commands).toBe(4);
});

it("classifies VM 30028 reboot as historical after deleted and skips power discovery", async () => {
  const f = await fixture();
  f.recoverable();
  f.instance.status = "deleted";
  f.instance.vmid = 30028;
  f.instance.node = "mng01" as unknown as null;
  f.recovery.kind = "instance.power.reboot";
  f.recovery.normalized_status = "failed";
  f.recovery.error_code = "POWER_ACPI_TIMEOUT";
  f.recovery.recovery_required = false;
  const d = await incidentDetail(f.actor, f.recovery.operation_id);
  expect(d).toMatchObject({
    state: "closed",
    recovery: { allowed: false },
    power: null,
    operation: { status: "failed", error_code: "POWER_ACPI_TIMEOUT" },
  });
  expect(d.diagnosis.hypothesis).toContain("no demuestra");
  expect((await incidentList(f.actor)).incidents[0].state).toBe("closed");
  await expect(
    command(f.actor, {
      key: randomUUID(),
      action: "reconcile",
      instanceId: f.instanceId,
    }),
  ).rejects.toThrow("RESOURCE_NO_LONGER_ACTIVE");
  await expect(
    reconcileIncident(f.actor, f.recovery.operation_id, {
      key: randomUUID(),
      confirmInstanceId: f.instanceId,
      expectedInstanceUpdatedAt: f.instance.updated_at,
      expectedOperationUpdatedAt: f.recovery.updated_at,
    }),
  ).rejects.toThrow("RECOVERY_NOT_ELIGIBLE");
  expect(f.commands).toBe(0);
});
it("requires a published recovery contract, explicit uncertainty and matching operation instance", async () => {
  const f = await fixture();
  f.recoverable();
  expect(
    (await incidentDetail(f.actor, f.recovery.operation_id)).recovery.allowed,
  ).toBe(true);
  f.noRecoveryContract();
  await expect(validateRecovery(f.actor, f.instanceId)).rejects.toThrow(
    "RECONCILIATION_NOT_AVAILABLE",
  );
  const g = await fixture();
  await expect(validateRecovery(g.actor, g.instanceId)).rejects.toThrow(
    "RECOVERY_NOT_ELIGIBLE",
  );
  g.recovery.instance_id = randomUUID();
  await expect(
    validateRecovery(g.actor, g.instanceId, {
      recoveryOperationId: g.recovery.operation_id,
    }),
  ).rejects.toThrow("UPSTREAM_TENANT_MISMATCH");
});
it("revalidates recovery evidence, local permissions and resource identity", async () => {
  const f = await fixture();
  f.recoverable();
  const input = {
    key: randomUUID(),
    confirmInstanceId: f.instanceId,
    expectedInstanceUpdatedAt: f.instance.updated_at,
    expectedOperationUpdatedAt: f.recovery.updated_at,
  };
  await expect(
    reconcileIncident(
      { ...f.actor, role: "Viewer" },
      f.recovery.operation_id,
      input,
    ),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    reconcileIncident(f.actor, f.recovery.operation_id, {
      ...input,
      confirmInstanceId: randomUUID(),
    }),
  ).rejects.toThrow("RECOVERY_NOT_ELIGIBLE");
  await expect(
    reconcileIncident(f.actor, f.recovery.operation_id, {
      ...input,
      expectedOperationUpdatedAt: "2000-01-01T00:00:00Z",
    }),
  ).rejects.toThrow("EVIDENCE_CHANGED_REFRESH_REQUIRED");
  const result = await reconcileIncident(
    f.actor,
    f.recovery.operation_id,
    input,
  );
  expect(result).toMatchObject({ admission: "accepted" });
  await reconcileIncident(f.actor, f.recovery.operation_id, input);
  expect(f.commands).toBe(1);
  expect(
    db()
      .prepare(
        "SELECT action FROM audit WHERE object_id=? AND action='crm.request_accepted'",
      )
      .get(input.key),
  ).toBeDefined();
});
it("catches a deleted-state race before upstream submission and journals a rejection", async () => {
  const f = await fixture();
  f.recoverable();
  f.beforeSubmit(() => {
    f.instance.status = "deleted";
  });
  expect(
    await command(f.actor, {
      key: randomUUID(),
      action: "reconcile",
      instanceId: f.instanceId,
    }),
  ).toMatchObject({ status: "rejected", error: "RESOURCE_NO_LONGER_ACTIVE" });
  expect(f.commands).toBe(0);
});
it.each([
  "UPSTREAM_UNAUTHORIZED",
  "UPSTREAM_FORBIDDEN",
  "UPSTREAM_CONFLICT",
  "UPSTREAM_RATE_LIMITED",
  "UPSTREAM_NOT_FOUND",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_SERVICE_UNAVAILABLE",
])("preserves recovery %s and never resends the same key", async (code) => {
  const f = await fixture();
  f.recoverable();
  f.fail(code);
  const key = randomUUID();
  const result = await command(f.actor, {
    key,
    action: "reconcile",
    instanceId: f.instanceId,
  });
  expect(result).toMatchObject({
    status: ["UPSTREAM_TIMEOUT", "UPSTREAM_SERVICE_UNAVAILABLE"].includes(code)
      ? "uncertain"
      : "rejected",
    error: code,
  });
  if (!["UPSTREAM_UNAUTHORIZED", "UPSTREAM_FORBIDDEN"].includes(code))
    await command(f.actor, {
      key,
      action: "reconcile",
      instanceId: f.instanceId,
    });
  expect(f.commands).toBe(1);
});
it("pages recent operation history and server-side filters without fetching all history", async () => {
  const f = await fixture();
  f.recoverable();
  const original = vi.mocked(secureJson).getMockImplementation()!;
  const offsets: number[] = [];
  vi.mocked(secureJson).mockImplementation(async (...args) => {
    const path = args[1];
    if (path.startsWith("/v1/operations?limit=")) {
      const u = new URL(path, "https://fixture.invalid");
      const offset = Number(u.searchParams.get("offset"));
      offsets.push(offset);
      expect(u.searchParams.get("instance_id")).toBe(f.instanceId);
      expect(u.searchParams.get("status")).toBe("failed");
      return offset > 200
        ? []
        : Array.from({ length: offset === 200 ? 3 : 50 }, (_, n) => ({
            ...f.recovery,
            operation_id: randomUUID(),
          }));
    }
    return original(...args);
  });
  const page = await operationPage(f.actor, {
    recent: true,
    instance: f.instanceId,
    status: "failed",
  });
  expect(page.offset).toBe(200);
  expect(page.operations.length).toBe(3);
  expect(offsets.length).toBeLessThan(10);
});
it("searches operations across every IACP page and returns only matching results", async () => {
  const f = await fixture();
  const original = vi.mocked(secureJson).getMockImplementation()!;
  vi.mocked(secureJson).mockImplementation(async (...args) => {
    const path = args[1];
    if (path.startsWith("/v1/operations?limit=")) {
      const u = new URL(path, "https://fixture.invalid");
      const offset = Number(u.searchParams.get("offset"));
      if (offset === 0)
        return [{ ...f.recovery, operation_id: "target-operation" }];
      return [];
    }
    return original(...args);
  });
  const page = await operationPage(f.actor, { query: "target-operation" });
  expect(page.operations).toHaveLength(1);
  expect(page.operations[0].operation_id).toBe("target-operation");
});

it.each(["discover", "initialize", "verifyAccess"])(
  "submits only the contract's empty body for %s and preserves idempotency",
  async (action) => {
    const f = await fixture(),
      key = randomUUID();
    expect(
      await command(f.actor, { key, action, instanceId: f.instanceId }),
    ).toMatchObject({ admission: "accepted" });
    await command(f.actor, { key, action, instanceId: f.instanceId });
    expect(f.commands).toBe(1);
    const call = vi
      .mocked(secureJson)
      .mock.calls.filter((c) => c[3])
      .at(-1);
    expect(call?.[3]?.body).toEqual({});
    f.instance.status = "deleted";
    await expect(
      command(f.actor, { key: randomUUID(), action, instanceId: f.instanceId }),
    ).rejects.toThrow("RESOURCE_NO_LONGER_ACTIVE");
  },
);
it("uses a published planning attempt for retry and preserves the same instance instead of creating", async () => {
  const f = await fixture();
  f.recoverable();
  f.recovery.normalized_status = "failed";
  f.recovery.recovery_required = false;
  f.recovery.provisioning = {
    service: "provisioning",
    phase: "failed",
    attempt: 2,
    started_at: null,
    finished_at: null,
  };
  const input = {
    key: randomUUID(),
    action: "retryProvision",
    instanceId: f.instanceId,
    confirmName: f.instance.name,
    recoveryOperationId: f.recovery.operation_id,
    payload: { expected_attempt: 2 },
  };
  expect(await command(f.actor, input)).toMatchObject({
    admission: "accepted",
    instance_id: f.instanceId,
  });
  expect(f.commands).toBe(1);
  await expect(
    command(f.actor, {
      ...input,
      key: randomUUID(),
      payload: { expected_attempt: 1 },
    }),
  ).rejects.toThrow("RECOVERY_NOT_ELIGIBLE");
  f.recovery.provisioning.started_at = new Date().toISOString();
  await expect(
    command(f.actor, { ...input, key: randomUUID() }),
  ).rejects.toThrow("RECOVERY_NOT_ELIGIBLE");
});
it("continues a published plan only after matching resource confirmation", async () => {
  const f = await fixture();
  f.recoverable();
  f.recovery.normalized_status = "queued";
  f.recovery.recovery_required = false;
  f.recovery.provisioning = {
    service: "provisioning",
    phase: "queued",
    attempt: 1,
    started_at: null,
    finished_at: null,
  };
  const input = {
    key: randomUUID(),
    action: "provision",
    instanceId: f.instanceId,
    recoveryOperationId: f.recovery.operation_id,
  };
  await expect(command(f.actor, input)).rejects.toThrow(
    "RESOURCE_CONFIRMATION_REQUIRED",
  );
  expect(
    await command(f.actor, { ...input, confirmName: f.instance.name }),
  ).toMatchObject({ admission: "accepted" });
});

it("reads tenant-owned policy/job references and never returns arbitrary job messages", async () => {
  const f = await fixture();
  const policy = await reference(f.actor, "policy", f.policy.policy_id);
  expect(policy).toMatchObject({ tenant_id: f.tenant });
  const job = await reference(f.actor, "job", randomUUID());
  expect(job).not.toHaveProperty("message");
  await expect(reference(f.actor, "job", "../admin")).rejects.toThrow();
});
