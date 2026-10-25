import { z } from "zod";
// Proyección explícita del OpenAPI 0.10.1; strip evita reenviar campos privados nuevos.
export const status = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "uncertain",
]);
export const operationSchema = z.object({
  operation_id: z.string(),
  instance_id: z.string(),
  kind: z.string(),
  status,
  normalized_status: status,
  requested_by: z.string(),
  error_code: z.string().nullable(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  recovery_required: z.boolean().default(false),
});
export const eventSchema = z.object({
  event_id: z.number().int(),
  correlation_id: z.string(),
  operation_id: z.string(),
  instance_id: z.string(),
  tenant_id: z.string(),
  occurred_at: z.iso.datetime({ offset: true }),
  kind: z.string(),
  status: z.string(),
  code: z.string(),
  actor: z.string(),
  service: z.enum(["IaC Worker", "Lifecycle Worker", "IACP Orchestrator"]),
});
export const eventPageSchema = z.object({
  events: z.array(eventSchema),
  next_after: z.number().int(),
});
export const diagnosticsSchema = z.object({
  tenant_id: z.string(),
  observed_at: z.iso.datetime({ offset: true }),
  dependencies: z.record(z.string(), z.string()),
  active_operations: z.number().int().nonnegative(),
  uncertain_operations: z.number().int().nonnegative(),
  oldest_active_age_seconds: z.number().nonnegative(),
  worker_liveness: z.literal("unknown").default("unknown"),
  queue_scope: z.literal("not-disclosed").default("not-disclosed"),
});
export type Operation = z.infer<typeof operationSchema>;
export type AuditEvent = z.infer<typeof eventSchema>;
export type Diagnostics = z.infer<typeof diagnosticsSchema>;
export interface ObservationSource {
  operations(): Promise<Operation[]>;
  operation(id: string): Promise<Operation>;
  events(after?: number): Promise<z.infer<typeof eventPageSchema>>;
  observability(): Promise<Diagnostics>;
}
export function freshness(
  at: string | null,
  now = Date.now(),
): "unknown" | "stale" | "fresh" {
  if (!at || !Number.isFinite(Date.parse(at))) return "unknown";
  if (Date.parse(at) - now > 30_000) return "unknown";
  return now - Date.parse(at) > 120_000 ? "stale" : "fresh";
}

export function uniqueEvents(events: AuditEvent[]): AuditEvent[] {
  return [...new Map(events.map((event) => [event.event_id, event])).values()];
}
