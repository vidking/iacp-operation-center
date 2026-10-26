import type { Operation, AuditEvent } from "./observation.ts";
import type { Instance } from "./crm.ts";
import { diagnosis } from "../diagnostics.ts";
export const incidentLabels = {
  attention: "Requiere atención",
  investigating: "En investigación",
  closed: "Cerrado por estado posterior",
  historical: "Histórico",
} as const;
export type IncidentState = keyof typeof incidentLabels;
export function incidentState(
  operation: Operation,
  instance: Instance | null,
  now = Date.now(),
): IncidentState | null {
  const failed =
    operation.status === "failed" || operation.normalized_status === "failed";
  const uncertain =
    operation.normalized_status === "uncertain" || operation.recovery_required;
  const stalled =
    ["queued", "running"].includes(operation.normalized_status) &&
    now - Date.parse(operation.updated_at) > 120000;
  if (!failed && !uncertain && !stalled) return null;
  if (instance?.status === "deleted") return "closed";
  if (failed && operation.normalized_status === "completed") return "closed";
  if (operation.normalized_status === "running" && failed)
    return "investigating";
  return "attention";
}
export function recoveryEligible(
  operation: Operation,
  instance: Instance | null,
) {
  return (
    !!instance &&
    !["deleted", "deleting"].includes(instance.status) &&
    operation.instance_id === instance.instance_id &&
    operation.normalized_status === "uncertain" &&
    operation.recovery_required
  );
}
// Only projected metadata is accepted. Raw task output, request bodies and stderr never enter this view.
export function safeEvidence(value: string | null | undefined): string {
  if (!value) return "Sin evidencia";
  if (
    /bearer\s|password|secret|token[=:]|-----BEGIN|https?:\/\/[^\s]*@/i.test(
      value,
    )
  )
    return "[redactado]";
  return value.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 256);
}
export function incidentDiagnosis(
  operation: Operation,
  instance: Instance | null,
) {
  const basic = diagnosis(operation);
  return {
    ...basic,
    confirmed: operation.error_code
      ? `IACP informa ${safeEvidence(operation.error_code)}; estado persistido ${operation.status}, normalizado ${operation.normalized_status}.`
      : "IACP no publica un código de error para esta evidencia.",
    hypothesis:
      operation.error_code === "POWER_ACPI_TIMEOUT"
        ? "Diagnóstico probable: el invitado no completó la transición normal dentro del plazo. Un timeout de Guest Agent no demuestra por sí solo la causa primaria dentro del invitado."
        : "Sin evidencia suficiente para acreditar una causa raíz.",
    next:
      instance?.status === "deleted"
        ? "La instancia está eliminada. Conservar el fallo como evidencia histórica; no ejecutar recuperación sobre este recurso."
        : basic.next,
  };
}
export function correlatedEvents(events: AuditEvent[], operation: Operation) {
  return [
    ...new Map(
      events
        .filter(
          (e) =>
            e.operation_id === operation.operation_id &&
            e.instance_id === operation.instance_id,
        )
        .map((e) => [e.event_id, e]),
    ).values(),
  ].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
}
