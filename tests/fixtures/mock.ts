import type {
  ObservationSource,
  Operation,
  AuditEvent,
} from "../../src/lib/types/observation";
// Instante fijo: nunca dar apariencia de telemetría viva a una muestra local.
const observedAt = "2026-10-25T08:00:00Z";
const states = [
  "running",
  "completed",
  "uncertain",
  "queued",
  "completed",
  "failed",
] as const;
export const mockOperations: Operation[] = states.map((s, i) => ({
  operation_id: `demo-op-${String(i + 1).padStart(3, "0")}`,
  instance_id: `demo-instance-${i + 1}`,
  kind: [
    "instance.create",
    "instance.power.start",
    "instance.create",
    "instance.network.initialize",
    "instance.power.shutdown",
    "instance.create",
  ][i],
  status: i === 2 ? "failed" : s,
  normalized_status: s,
  requested_by: "demo:reader",
  error_code:
    s === "uncertain"
      ? "PROVISIONING_UNCERTAIN"
      : s === "failed"
        ? "PROVISIONING_FAILED"
        : null,
  created_at: "2026-10-25T07:40:00Z",
  updated_at: observedAt,
  recovery_required: s === "uncertain",
}));
const events: AuditEvent[] = mockOperations.map((op, i) => ({
  event_id: i + 1,
  correlation_id: op.operation_id,
  operation_id: op.operation_id,
  instance_id: op.instance_id,
  tenant_id: "demo",
  occurred_at: observedAt,
  kind: op.kind,
  status: op.normalized_status,
  code: op.error_code ?? "DEMO_OBSERVATION",
  actor: "demo:worker",
  service: "IaC Worker",
}));
export const mockSource: ObservationSource = {
  async operations() {
    return mockOperations;
  },
  async operation(id) {
    const op = mockOperations.find((o) => o.operation_id === id);
    if (!op) throw new Error("Not found");
    return op;
  },
  async events(after = 0) {
    return { events: events.filter((e) => e.event_id > after), next_after: 6 };
  },
  async observability() {
    return {
      tenant_id: "demo",
      observed_at: observedAt,
      dependencies: { database: "unknown", redis: "unknown" },
      active_operations: 3,
      uncertain_operations: 1,
      oldest_active_age_seconds: 1200,
      worker_liveness: "unknown",
      queue_scope: "not-disclosed",
    };
  },
};
