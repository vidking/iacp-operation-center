import { formatTime, utcTime } from "./time.ts";
import { evidenceSeconds, diagnosis } from "./diagnostics.ts";
import type { Operation, AuditEvent } from "./types/observation.ts";
import type { Instance } from "./types/crm.ts";
const stamp = (value: string) => ({
  utc: utcTime(value),
  costa_rica: formatTime(value),
});
export function operationalReport(input: {
  instance?: Instance;
  operations: Operation[];
  events: AuditEvent[];
  observedAt: string;
}) {
  return {
    schema: "iacoc.operational-report.v1",
    generated: stamp(input.observedAt),
    time_zone: "America/Costa_Rica",
    instance: input.instance
      ? {
          ...input.instance,
          created_time: stamp(input.instance.created_at),
          updated_time: stamp(input.instance.updated_at),
          product: null,
        }
      : null,
    limits: {
      operations_in_report: input.operations.length,
      feed_events_in_report: input.events.length,
      scope:
        "Páginas consultadas; los eventos de cada operación se exportan por separado. Sin garantía de outbox sin pérdida.",
    },
    operations: input.operations.map((o) => ({
      operation_id: o.operation_id,
      instance_id: o.instance_id,
      kind: o.kind,
      actor: o.requested_by,
      status: o.status,
      normalized_status: o.normalized_status,
      error_code: o.error_code,
      admitted: stamp(o.created_at),
      last_evidence: stamp(o.updated_at),
      finished_at: o.power?.finished_at ? stamp(o.power.finished_at) : null,
      execution_duration_seconds:
        o.power?.started_at && o.power.finished_at
          ? evidenceSeconds(o.power.started_at, o.power.finished_at)
          : null,
      evidence_interval_seconds: evidenceSeconds(o.created_at, o.updated_at),
      duration_basis: "last_evidence_minus_admitted; no es tiempo de worker",
      worker_id: null,
      correlations: [
        ...new Set(
          input.events
            .filter((e) => e.operation_id === o.operation_id)
            .map((e) => e.correlation_id),
        ),
      ],
      diagnosis: diagnosis(o),
      power: o.power ?? null,
      fulfillment: o.fulfillment ?? null,
      initialization: o.initialization ?? null,
      operation_events:
        o.events?.map((e) => ({ ...e, time: stamp(e.created_at) })) ?? [],
    })),
    feed_events: input.events.map((e) => ({
      ...e,
      time: stamp(e.occurred_at),
    })),
  };
}
