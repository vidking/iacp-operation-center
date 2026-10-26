// Respuestas IACP sintéticas, exclusivamente para el servidor de pruebas 4176.
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
export async function fixtureRead(endpoint, path, token, command) {
  const state = JSON.parse(
    readFileSync(
      process.env.IACOC_TEST_UPSTREAM_FILE ??
        ".artifacts/e2e-4176/upstream.json",
      "utf8",
    ),
  );
  if (
    !["https://iac.cyberfuel.com", "https://iacp-alt-fixture.invalid"].includes(
      endpoint,
    )
  )
    return { error: "ENDPOINT_NOT_ALLOWED" };
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
  if ((token !== state.token && token !== state.operatorToken) || state.revoked)
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
    if (path === "/v1/plans")
      return {
        body: [
          {
            plan_id: "contract-plan",
            name: "Contract KVM",
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
          },
        ],
      };
    if (path === "/v1/images")
      return {
        body: [
          {
            image_id: "contract-image",
            operating_system: "Contract OS",
            version: "1",
            // Real IACP catalogues may publish an image as certified before it
            // is promoted to enabled. Both states are selectable in CRM.
            status: "certificada",
            cloud_init: true,
            qemu_guest_agent: true,
            root_access: true,
            ssh_access: true,
            minimum_requirements: { vcpus: 1, memory_mb: 512, disk_gb: 8 },
            compatible_plans: ["contract-plan"],
            authorized: true,
            availability: {
              available: !state.catalogBlocked,
              capacity_verified: !state.catalogBlocked,
              reasons: [],
            },
          },
        ],
      };
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
      if (token !== state.operatorToken) return { error: "UPSTREAM_FORBIDDEN" };
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
      if (action === "create") {
        instance = {
          ...command.body,
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
    if (path.startsWith("/v1/events"))
      return { body: { events: state.events ?? [], next_after: 0 } };
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
