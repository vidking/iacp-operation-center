// Respuestas IACP sintéticas, exclusivamente para servidores de pruebas.
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
let fixtureQueue = Promise.resolve();

export function fixtureRead(endpoint, path, token, command) {
  const run = fixtureQueue.then(
    () => fixtureReadSerial(endpoint, path, token, command),
    () => fixtureReadSerial(endpoint, path, token, command),
  );
  fixtureQueue = run.catch(() => {});
  return run;
}

async function fixtureReadSerial(endpoint, path, token, command) {
  const state = JSON.parse(
    readFileSync(
      process.env.IACOC_TEST_UPSTREAM_FILE ??
        ".artifacts/e2e-4176/upstream.json",
      "utf8",
    ),
  );
  const acceptance20 = state.acceptance20 === true;
  const controlplaneV2 = state.controlplaneV2 === true;
  if (
    !(
      controlplaneV2
        ? ["https://dev-iac.cyberfuel.com"]
        : ["https://iac.cyberfuel.com", "https://iacp-alt-fixture.invalid"]
    ).includes(endpoint)
  )
    return { error: "ENDPOINT_NOT_ALLOWED" };
  if (controlplaneV2) {
    if (path === "/openapi.json")
      return {
        body: {
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
                responses: { 202: {} },
              },
            },
            "/v1/instances/{instance_id}/reconcile": {
              post: { responses: { 202: {} } },
            },
            "/v1/instances/{instance_id}/provision": {
              post: { responses: { 200: {} } },
            },
          },
        },
      };
    if (path === "/health/ready") return { body: { status: "ready" } };
    if (token !== state.token || state.revoked || state.readerRevoked)
      return { error: "UPSTREAM_UNAUTHORIZED" };
    if (path === "/v1/observability")
      return {
        body: {
          active_operations: 0,
          uncertain_operations: 0,
          recent_operations: [],
          recent_events: [],
          events_total: 0,
        },
      };
    if (path.startsWith("/v1/events"))
      return { body: { events: [], next_after: 0 } };
    if (path.startsWith("/v1/operations"))
      return { body: { operations: [], total: 0, limit: 50, offset: 0 } };
    return { error: "UPSTREAM_HTTP_ERROR" };
  }
  if (path === "/openapi.json")
    return {
      body: {
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
              { post: { responses: { 202: {} } } },
            ]),
          ),
          "/v1/instances/{instance_id}/reconcile": {
            post: { responses: { 202: {} } },
          },
          "/v1/instances": {
            post: {
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      $ref: state.commercial
                        ? "#/components/schemas/CommercialInstanceCreate"
                        : "#/components/schemas/InstanceCreate",
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
  if (path === "/health/ready") return { body: { status: "ready" } };
  const isReader = token === state.token;
  if (!isReader || state.revoked || state.readerRevoked)
    return { error: "UPSTREAM_UNAUTHORIZED" };
  const operation = {
    operation_id: "live-operation-001",
    instance_id: "live-instance-001",
    kind: "provision",
    status: "failed",
    normalized_status: "uncertain",
    requested_by: "reader-fixture",
    error_code: "PROVISIONING_UNCERTAIN",
    recovery_required: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (path === "/v1/observability")
    return {
      body: {
        tenant_id: state.tenant,
        observed_at: new Date().toISOString(),
        dependencies: { orchestrator: "ready" },
        active_operations: 1,
        uncertain_operations: 1,
        oldest_active_age_seconds: 45,
        worker_liveness: "unknown",
        queue_scope: "not-disclosed",
      },
    };
  if (state.crm) {
    const filename = process.env.IACOC_TEST_UPSTREAM_FILE;
    const save = () =>
      writeFileSync(filename, JSON.stringify(state), { mode: 0o600 });
    const profile = {
      profile: "authorized-profile",
      image: "authorized-image",
      network_mode: "dhcp",
      bridge: "authorized-bridge",
      vlan_tag: null,
      nodes: ["authorized-node"],
      minimum_disk_gb: 8,
      max_vcpus_per_instance: 4,
      max_memory_mb_per_instance: 4096,
      max_disk_gb_per_instance: 80,
      self_service_enabled: true,
      root_password_bootstrap: false,
      quotas: {
        instances: 3,
        vcpus: 8,
        memory_mb: 8192,
        disk_gb: 160,
        concurrent_operations: 2,
      },
    };
    const policyId = "00000000-0000-4000-8000-000000000060";
    if (path === "/v1/plans") {
      const plan = {
        plan_id: acceptance20 ? "kvm-1" : "contract-plan",
        name: acceptance20 ? "KVM 1" : "Contract KVM",
        vcpus: 1,
        memory_mb: 2048,
        disk_gb: 50,
        availability: {
          available: !state.catalogBlocked,
          capacity_verified: !state.catalogBlocked,
          reasons: state.catalogBlocked
            ? ["COMMERCIAL_PLAN_NOT_AUTHORIZED"]
            : [],
        },
      };
      return { body: [plan] };
    }
    if (path === "/v1/images") {
      const images = acceptance20
        ? [
            ["ubuntu-2404", "Ubuntu", "24.04", "certificada"],
            ["ubuntu-2604", "Ubuntu", "26.04", "habilitada"],
            ["almalinux-9", "AlmaLinux", "9", "certificada"],
            ["almalinux-10", "AlmaLinux", "10", "habilitada"],
          ]
        : [["contract-image", "Contract OS", "1", "certificada"]];
      return {
        body: images.map(([image_id, operating_system, version, status]) => ({
          image_id,
          operating_system,
          version,
          // Real IACP catalogues may publish an image as certified before it
          // is promoted to enabled. Both states are selectable in CRM.
          status,
          cloud_init: true,
          qemu_guest_agent: true,
          root_access: true,
          ssh_access: true,
          minimum_requirements: { vcpus: 1, memory_mb: 512, disk_gb: 8 },
          compatible_plans: [acceptance20 ? "kvm-1" : "contract-plan"],
          authorized: true,
          availability: {
            available: !state.catalogBlocked,
            capacity_verified: !state.catalogBlocked,
            reasons: [],
          },
        })),
      };
    }
    if (path === "/v1/profiles") return { body: [profile] };
    if (path.startsWith("/v1/lab/policies"))
      return {
        body: [
          {
            policy_id: policyId,
            tenant_id: state.tenant,
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
          },
        ],
      };
    if (path === "/v1/lab/usage")
      return {
        body: {
          tenant_id: state.tenant,
          usage: {
            instances: state.instances.filter((i) => i.status !== "deleted")
              .length,
            vcpus: 0,
            memory_mb: 0,
            disk_gb: 0,
            concurrent_operations: 0,
          },
          description: "Disposable integration fixture",
        },
      };
    if (command) {
      // The single-connection regression uses one IACP Bearer for both reads
      // and commands. Production never reads this fixture.
      if (token !== state.token) return { error: "UPSTREAM_FORBIDDEN" };
      const previous = state.commands.find((c) => c.key === command.key);
      if (previous) return { body: previous.accepted };
      let instance = state.instances.find((i) => path.includes(i.instance_id));
      const action =
        path === "/v1/instances"
          ? "create"
          : command.method === "DELETE"
            ? "delete"
            : path.split("/").at(-1);
      const operationId = randomUUID(),
        jobId = randomUUID();
      const persistedBody = structuredClone(command.body ?? {});
      if (persistedBody.access?.root_password)
        delete persistedBody.access.root_password;
      if (action === "create") {
        instance = {
          ...persistedBody,
          ...(state.commercial
            ? {
                image: command.body.image_id,
                vcpus: 1,
                memory_mb: 2048,
                disk_gb: 50,
                network_profile: "lab-dhcp",
                self_service_policy_id: null,
              }
            : {}),
          instance_id: randomUUID(),
          tenant_id: state.tenant,
          operation_id: operationId,
          status: "provisioning",
          infrastructure_kind: "unprovisioned",
          vmid: null,
          node: null,
          ip_addresses: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          power: "stopped",
        };
        state.instances.push(instance);
      }
      const op = {
        operation_id: operationId,
        instance_id: instance.instance_id,
        kind: "instance." + action,
        status: "queued",
        normalized_status: "queued",
        requested_by: "operator-fixture",
        error_code: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        events: [],
      };
      state.operations.push(op);
      const accepted = {
        instance_id: instance.instance_id,
        operation_id: operationId,
        job_id: jobId,
        status: "queued",
      };
      state.commands.push({
        key: command.key,
        action,
        accepted,
        planId: command.body?.plan_id ?? null,
        legacyProfile: command.body?.self_service_policy_id ?? null,
      });
      if (acceptance20) {
        state.events ??= [];
        const eventId = Math.max(0, ...state.events.map((e) => e.event_id)) + 1;
        state.events.push({
          event_id: eventId,
          correlation_id: operationId,
          operation_id: operationId,
          instance_id: instance.instance_id,
          tenant_id: state.tenant,
          occurred_at: op.created_at,
          kind: "instance." + action + ".accepted",
          status: "queued",
          code: "OPERATION_ACCEPTED",
          actor: "contractual-browser-test",
          service: "IACP Orchestrator",
        });
      }
      save();
      return { body: accepted };
    }
    if (path.startsWith("/v1/operations/")) {
      const op = state.operations.find((o) => path.endsWith(o.operation_id));
      if (!op) return { error: "UPSTREAM_NOT_FOUND" };
      // Controlled test worker; no fixture code is included in runtime.
      const cmd = state.commands.find(
          (c) => c.accepted.operation_id === op.operation_id,
        ),
        instance = state.instances.find(
          (i) => i.instance_id === op.instance_id,
        );
      if (!cmd) return { body: op };
      if (cmd.action === "delete" && state.deleteFailureCode) {
        op.status = op.normalized_status = "failed";
        op.error_code = state.deleteFailureCode;
      } else {
        op.status = op.normalized_status = "completed";
        if (cmd.action === "create") {
          instance.status = "ready";
          instance.infrastructure_kind = "kvm";
          instance.vmid = 30000 + state.instances.length;
          instance.node = "authorized-node";
        }
        if (cmd.action === "start") instance.power = "running";
        if (cmd.action === "shutdown") instance.power = "stopped";
        if (cmd.action === "delete") instance.status = "deleted";
      }
      if (acceptance20) {
        state.events ??= [];
        if (
          !state.events.some(
            (e) =>
              e.operation_id === op.operation_id &&
              e.status === op.normalized_status,
          )
        ) {
          const eventId =
            Math.max(0, ...state.events.map((e) => e.event_id)) + 1;
          state.events.push({
            event_id: eventId,
            correlation_id: op.operation_id,
            operation_id: op.operation_id,
            instance_id: op.instance_id,
            tenant_id: state.tenant,
            occurred_at: op.updated_at,
            kind:
              "instance." +
              cmd.action +
              "." +
              (op.normalized_status === "failed" ? "failed" : "completed"),
            status: op.normalized_status,
            code:
              op.error_code ??
              (op.normalized_status === "failed"
                ? "OPERATION_FAILED"
                : "OPERATION_COMPLETED"),
            actor: "contractual-browser-test",
            service: "IACP Orchestrator",
          });
        }
      }
      save();
      return { body: op };
    }
    if (path.startsWith("/v1/operations?")) {
      const query = new URL("https://fixture.invalid" + path).searchParams;
      const id = query.get("instance_id"),
        status = query.get("status"),
        offset = Number(query.get("offset") ?? 0),
        limit = Number(query.get("limit") ?? 50);
      return {
        body: state.operations
          .filter(
            (o) =>
              (!id || o.instance_id === id) && (!status || o.status === status),
          )
          .slice(offset, offset + limit),
      };
    }
    if (path.startsWith("/v1/instances?")) return { body: state.instances };
    if (path.startsWith("/v1/instances/")) {
      const instance = state.instances.find((i) =>
        path.includes(i.instance_id),
      );
      if (!instance) return { error: "UPSTREAM_NOT_FOUND" };
      if (path.endsWith("/power"))
        return {
          body: {
            instance_id: instance.instance_id,
            power_state: instance.power,
            observed_at: new Date().toISOString(),
            mutations_available: instance.status === "ready",
            guest_ready: null,
          },
        };
      return { body: instance };
    }
    if (path.startsWith("/v1/events")) {
      if (!acceptance20)
        return { body: { events: state.events ?? [], next_after: 0 } };
      const query = new URL("https://fixture.invalid" + path).searchParams;
      const after = Number(query.get("after") ?? 0);
      const events = (state.events ?? [])
        .filter((event) => event.event_id > after)
        .sort((a, b) => a.event_id - b.event_id)
        .slice(0, 100);
      return {
        body: {
          events,
          next_after: events.at(-1)?.event_id ?? after,
          delivery: "replayable-polling",
        },
      };
    }
  }
  if (path.startsWith("/v1/events"))
    return {
      body: {
        events: [
          {
            event_id: 42,
            correlation_id: "live-correlation-001",
            operation_id: operation.operation_id,
            instance_id: operation.instance_id,
            tenant_id: state.tenant,
            occurred_at: operation.updated_at,
            kind: "provisioning_uncertain",
            status: "uncertain",
            code: operation.error_code,
            actor: "fixture-reader",
            service: "IACP Orchestrator",
          },
        ],
        next_after: 42,
      },
    };
  if (path.startsWith("/v1/operations/"))
    return { body: { ...operation, requested_by: "verified-detail" } };
  if (path.startsWith("/v1/operations?")) return { body: [operation] };
  return { error: "UPSTREAM_HTTP_ERROR" };
}
