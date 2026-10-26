// Read-only, fixed resources; no infrastructure mutation and no raw upstream bodies in evidence.
import { secureJson } from "../src/lib/server/connections/transport.ts";
import { writeFileSync } from "node:fs";
let token = "";
try {
  for await (const c of process.stdin) {
    token += c;
    if (token.length > 4096) throw new Error();
  }
  token = token.trim();
  const read = (path) => secureJson("https://iac.cyberfuel.com", path, token);
  const scope = await read("/v1/observability");
  const ids = [
    {
      vmid: 30028,
      id: "a5318da2-79bd-485f-b334-79ba739f3666",
      op: "99291c2e-736b-4c79-b30c-8d52bf2de47e",
    },
    {
      vmid: 30029,
      id: "6cd6649f-71ce-4950-b2fa-16bb5cad66e3",
      op: "4b87c197-7fbd-4b77-9057-c25d26f69f84",
    },
    {
      vmid: 30030,
      id: "9a48e673-14c5-4ae0-9bbf-bb2e2c9aece2",
      op: "f07d8d68-7896-45fe-a81f-365b7530327c",
    },
  ];
  const rows = [];
  for (const x of ids) {
    const i = await read("/v1/instances/" + x.id),
      o = await read("/v1/operations/" + x.op);
    if (
      i.tenant_id !== scope.tenant_id ||
      i.instance_id !== x.id ||
      i.vmid !== x.vmid ||
      o.instance_id !== x.id ||
      o.operation_id !== x.op
    )
      throw new Error();
    const deletion = o.deletion
      ? Object.fromEntries(
          [
            "status",
            "phase",
            "recovery_required",
            "started_at",
            "finished_at",
          ].map((k) => [k, o.deletion[k] ?? null]),
        )
      : null;
    rows.push({
      vmid: x.vmid,
      instance_id: i.instance_id,
      name: i.name,
      node: i.node,
      status: i.status,
      image: i.image,
      resources: { vcpus: i.vcpus, memory_mb: i.memory_mb, disk_gb: i.disk_gb },
      operation: {
        operation_id: o.operation_id,
        status: o.status,
        normalized_status: o.normalized_status,
        error_code: o.error_code,
        deletion,
        events: (o.events ?? []).map((e) => ({
          code: e.code,
          status: e.status,
          actor: e.actor,
          created_at: e.created_at,
        })),
      },
      hardware_fields_exposed: Object.fromEntries(
        [
          "cpu_type",
          "cpu_model",
          "numa",
          "bios",
          "machine",
          "scsihw",
          "template_id",
        ].map((k) => [k, Object.hasOwn(i, k) ? i[k] : null]),
      ),
    });
  }
  const result = {
    observed_at: new Date().toISOString(),
    source: "Authenticated IACP API only; no direct Proxmox query",
    mutations_sent: 0,
    rows,
  };
  writeFileSync(
    "/evidence/cleanup-final-readonly.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (e) {
  console.log(
    JSON.stringify({ error: e?.code ?? "AUDIT_FAILED", mutations_sent: 0 }),
  );
  process.exitCode = 1;
} finally {
  token = "";
}
