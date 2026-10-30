import { it, expect, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";

vi.mock("../src/lib/server/connections/transport.ts", async (original) => ({
  ...(await original<
    typeof import("../src/lib/server/connections/transport.ts")
  >()),
  secureJson: vi.fn(),
}));

import { secureJson } from "../src/lib/server/connections/transport";
import {
  createConnection,
  liveSource,
  listConnections,
  mutateConnection,
  portalData,
} from "../src/lib/server/connections/service";
import {
  catalog,
  command,
  detail,
  inventory,
} from "../src/lib/server/crm/service";
import { setSetting, setting } from "../src/lib/server/security/database";
import type { Principal } from "../src/lib/types/security";

const endpoint = "https://dev-iac.cyberfuel.com";
const instanceId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-10-30T08:00:00Z";

const v2OpenApi = {
  paths: {
    "/v1/instances": {
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/InstanceCreateRequest",
              },
            },
          },
        },
        responses: { "202": {} },
      },
    },
    "/v1/instances/{instance_id}/power/start": {
      post: { responses: { "202": {} } },
    },
    "/v1/instances/{instance_id}/power/shutdown": {
      post: { responses: { "202": {} } },
    },
    "/v1/instances/{instance_id}/power/reboot": {
      post: { responses: { "202": {} } },
    },
    "/v1/instances/{instance_id}": {
      delete: { responses: { "202": {} } },
    },
    "/v1/instances/{instance_id}/reconcile": {
      post: { responses: { "202": {} } },
    },
    "/v1/instances/{instance_id}/provision": {
      post: { responses: { "200": {} } },
    },
  },
};

const v2Instance = {
  instance_id: instanceId,
  operation_id: operationId,
  name: "dev-vm",
  image: "ubuntu-2404",
  spec: {
    vcpus: 2,
    memory_mb: 2048,
    disk_gb: 50,
    network_mode: "dhcp",
  },
  status: "ready",
  power_state: "stopped",
  vmid: 30001,
  node: "mng01",
  ip_addresses: [],
  created_at: timestamp,
  updated_at: timestamp,
};

const v2Operation = {
  operation_id: operationId,
  instance_id: instanceId,
  command: "provision",
  action: "provision",
  status: "succeeded",
  created_at: timestamp,
  updated_at: timestamp,
  error: null,
};

function installV2Transport() {
  const requests: { path: string; body: unknown; method: string }[] = [];
  vi.mocked(secureJson).mockImplementation(
    async (_endpoint, path, _token, request) => {
      if (path === "/health/ready") return { status: "ready" };
      if (path === "/openapi.json") return v2OpenApi;
      if (path === "/v1/observability")
        return {
          worker_liveness: "known",
          workers: [],
          active_operations: 0,
          uncertain_operations: 0,
          recent_operations: [],
          recent_events: [],
          events_total: 1,
        };
      if (path === "/v1/plans")
        return {
          plans: [{ plan_id: "kvm-2", vcpus: 2, memory_mb: 2048, disk_gb: 50 }],
        };
      if (path === "/v1/images")
        return {
          images: [
            {
              image_id: "ubuntu-2404",
              tag: "ubuntu-2404",
              cloudinit_username: "root",
              minimum_vcpus: 1,
              minimum_memory_mb: 1024,
              minimum_disk_gb: 20,
            },
          ],
        };
      if (path === "/v1/events?after=0&limit=100")
        return {
          events: [
            {
              event_id: 1,
              operation_id: operationId,
              kind: "operation.completed",
              status: "completed",
              occurred_at: timestamp,
              detail: "public event",
            },
          ],
          next_after: 1,
          total: 1,
          limit: 100,
          offset: 0,
          sort: "desc",
        };
      if (path === "/v1/operations" || path.startsWith("/v1/operations?"))
        return {
          operations: [v2Operation],
          total: 1,
          limit: 50,
          offset: 0,
        };
      if (path.startsWith("/v1/operations/")) return v2Operation;
      if (
        !request &&
        (path.startsWith("/v1/instances?") || path === "/v1/instances")
      )
        return {
          instances: [v2Instance],
          total: 1,
          limit: 100,
          offset: 0,
        };
      if (path === `/v1/instances/${instanceId}`) return v2Instance;
      if (path === `/v1/instances/${instanceId}/power`)
        return {
          instance_id: instanceId,
          power_state: "stopped",
          observed_at: new Date().toISOString(),
          mutations_available: true,
          blocked_reason: null,
        };
      if (request) {
        requests.push({
          path,
          body: request.body,
          method: request.method,
        });
        return {
          instance_id: path === "/v1/instances" ? instanceId : instanceId,
          operation_id: operationId,
          job_id: operationId,
          status: "queued",
        };
      }
      throw new Error(`unexpected v2 fixture path: ${path}`);
    },
  );
  return requests;
}

async function activeFixture() {
  const actor: Principal = {
    id: randomUUID(),
    username: "v2-admin",
    role: "Administrator",
    tenantId: randomUUID(),
  };
  const connection = createConnection(actor, {
    name: "ControlPlaneV2 dev",
    environment: "development",
    endpoint,
    serviceIdentity: "IACP reader v2",
    credential: randomBytes(32).toString("base64url"),
  });
  const tested = await mutateConnection(actor, connection.id, {
    action: "test",
  });
  expect(tested.lastCode).toBe("OK");
  expect(tested.apiProfile).toBe("controlplane-v2");
  expect(tested.scopeMode).toBe("single-tenant-endpoint");
  expect(tested.scopeBinding).toBe(endpoint);
  expect(tested.scopeConfirmed).toBe(false);
  await expect(
    mutateConnection(actor, connection.id, { action: "activate" }),
  ).rejects.toThrow("SINGLE_TENANT_CONFIRMATION_REQUIRED");
  const active = await mutateConnection(actor, connection.id, {
    action: "activate",
    confirmSingleTenant: true,
  });
  expect(active.active).toBe(true);
  return { actor, connection: active };
}

process.env.IACP_ALLOWED_TARGETS = JSON.stringify([
  { origin: "https://iacp-fixture.invalid", addresses: ["10.40.50.60"] },
  { origin: endpoint, addresses: ["192.168.3.110"] },
]);

it("discovers and activates ControlPlaneV2 as an explicit single-tenant endpoint", async () => {
  installV2Transport();
  const f = await activeFixture();
  const report = JSON.parse(setting("validation:" + f.connection.id)!);
  expect(report.scopeConfirmed).toBe(true);
  expect(setting("active:" + f.actor.tenantId)).toBe(f.connection.id);
  expect(setting("mode:" + f.actor.tenantId)).toBe("LIVE");
  expect(liveSource(f.actor).row.id).toBe(f.connection.id);
  const data = await portalData(f.actor);
  expect(data.status).toBe("unknown");
  expect(data.diagnostics?.tenant_id).toBeNull();
  expect(data.diagnostics?.dependencies).toEqual({});
  expect(data.diagnostics?.worker_liveness).toBe("unknown");
  expect(data.evidence?.freshness).toBe("unknown");
  expect(data.events[0].tenant_id).toBeNull();
  expect(listConnections(f.actor)[0].upstreamTenantId).toBeNull();
});

it("preserves the confirmed single-tenant scope across repeated validation and activation", async () => {
  installV2Transport();
  const f = await activeFixture();
  const revalidated = await mutateConnection(f.actor, f.connection.id, {
    action: "test",
  });
  expect(revalidated.scopeConfirmed).toBe(true);
  expect(
    JSON.parse(setting("validation:" + f.connection.id)!).scopeConfirmed,
  ).toBe(true);
  const repeated = await mutateConnection(f.actor, f.connection.id, {
    action: "activate",
  });
  expect(repeated.active).toBe(true);
  expect(repeated.selected).toBe(true);
});

it("migrates a confirmed pre-createRef report without asking again", async () => {
  installV2Transport();
  const f = await activeFixture();
  const report = JSON.parse(setting("validation:" + f.connection.id)!);
  delete report.createRef;
  setSetting("validation:" + f.connection.id, JSON.stringify(report));
  const revalidated = await mutateConnection(f.actor, f.connection.id, {
    action: "test",
  });
  expect(revalidated.scopeConfirmed).toBe(true);
  expect(JSON.parse(setting("validation:" + f.connection.id)!).createRef).toBe(
    "#/components/schemas/InstanceCreateRequest",
  );
});

it("keeps multiple ControlPlaneV2 records switchable with one active connection", async () => {
  installV2Transport();
  const f = await activeFixture();
  const second = createConnection(f.actor, {
    name: "ControlPlaneV2 secondary",
    environment: "staging",
    endpoint,
    serviceIdentity: "IACP reader v2 secondary",
    credential: randomBytes(32).toString("base64url"),
  });
  const tested = await mutateConnection(f.actor, second.id, { action: "test" });
  expect(tested.scopeConfirmed).toBe(false);
  const activated = await mutateConnection(f.actor, second.id, {
    action: "activate",
    confirmSingleTenant: true,
  });
  expect(activated.active).toBe(true);
  expect(activated.selected).toBe(true);
  const records = listConnections(f.actor);
  expect(records.find((record) => record.id === f.connection.id)).toMatchObject(
    {
      active: false,
      selected: false,
      scopeConfirmed: true,
    },
  );
  expect(records.find((record) => record.id === second.id)).toMatchObject({
    active: true,
    selected: true,
    scopeConfirmed: true,
  });
});

it("requires a new single-tenant confirmation after rotating a credential", async () => {
  installV2Transport();
  const f = await activeFixture();
  await mutateConnection(f.actor, f.connection.id, {
    action: "rotate",
    credential: randomBytes(32).toString("base64url"),
  });
  const revalidated = await mutateConnection(f.actor, f.connection.id, {
    action: "test",
  });
  expect(revalidated.scopeConfirmed).toBe(false);
  await expect(
    mutateConnection(f.actor, f.connection.id, { action: "activate" }),
  ).rejects.toThrow("SINGLE_TENANT_CONFIRMATION_REQUIRED");
  const activated = await mutateConnection(f.actor, f.connection.id, {
    action: "activate",
    confirmSingleTenant: true,
  });
  expect(activated.active).toBe(true);
});

it("normalizes the v2 catalog and inventory without local capacity or tenant assumptions", async () => {
  installV2Transport();
  const f = await activeFixture();
  const [products, page] = await Promise.all([
    catalog(f.actor),
    inventory(f.actor),
  ]);
  expect(products.creationContract).toBe("commercial");
  expect(products.plans[0]).toMatchObject({
    plan_id: "kvm-2",
    availability: {
      available: true,
      capacity_verified: false,
    },
  });
  expect(products.images[0].compatible_plans).toEqual(["kvm-2"]);
  expect(page.instances[0]).toMatchObject({
    instance_id: instanceId,
    tenant_id: null,
    infrastructure_kind: "kvm",
    network_mode: "dhcp",
  });
});

it("sends the v2 create command through the allowlisted endpoint and keeps idempotency local", async () => {
  const requests = installV2Transport();
  const f = await activeFixture();
  const key = randomUUID();
  const result = await command(f.actor, {
    key,
    action: "create",
    payload: {
      name: "dev-vm",
      plan_id: "kvm-2",
      image_id: "ubuntu-2404",
      access: { root_password: "temporary-test-password" },
      start_on_create: false,
    },
  });
  expect(result).toMatchObject({
    intentId: key,
    admission: "accepted",
    instance_id: instanceId,
    operation_id: operationId,
  });
  expect(
    requests.find((request) => request.path === "/v1/instances"),
  ).toMatchObject({
    method: "POST",
    body: {
      name: "dev-vm",
      plan_id: "kvm-2",
      image_id: "ubuntu-2404",
      start_on_create: false,
    },
  });
  const replay = await command(f.actor, {
    key,
    action: "create",
    payload: {
      name: "dev-vm",
      plan_id: "kvm-2",
      image_id: "ubuntu-2404",
      access: { root_password: "temporary-test-password" },
      start_on_create: false,
    },
  });
  expect(replay.intentId).toBe(key);
  expect(
    requests.filter((request) => request.path === "/v1/instances"),
  ).toHaveLength(1);
});

it("keeps v2 lifecycle actions on their published paths and statuses", async () => {
  const requests = installV2Transport();
  const f = await activeFixture();
  const result = await command(f.actor, {
    key: randomUUID(),
    action: "start",
    instanceId,
  });
  expect((result as { admission?: string }).admission).toBe("accepted");
  expect(requests).toContainEqual({
    path: `/v1/instances/${instanceId}/power/start`,
    body: null,
    method: "POST",
  });
  const selected = await detail(f.actor, instanceId);
  expect(selected.instance.tenant_id).toBeNull();
  expect(selected.capabilities).toEqual(
    expect.arrayContaining([
      "start",
      "shutdown",
      "reboot",
      "delete",
      "reconcile",
      "provision",
    ]),
  );
});
