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
  requested_by: z.string().nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable().optional(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  recovery_required: z.boolean().default(false),
  provisioning: z
    .object({
      service: z.string(),
      phase: z.string(),
      attempt: z.number().int().positive(),
      started_at: z.iso.datetime({ offset: true }).nullable(),
      finished_at: z.iso.datetime({ offset: true }).nullable(),
    })
    .nullable()
    .optional(),
  deletion: z
    .object({
      status: z.string(),
      phase: z.string(),
      plan_sha256: z.string().nullable().optional(),
      approved_by: z.string().nullable().optional(),
      expires_at: z.iso.datetime({ offset: true }).nullable().optional(),
      recovery_required: z.boolean().default(false),
      started_at: z.iso.datetime({ offset: true }).nullable().optional(),
      finished_at: z.iso.datetime({ offset: true }).nullable().optional(),
    })
    .nullable()
    .optional(),
  network: z.record(z.string(), z.unknown()).nullable().optional(),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  events: z
    .array(
      z.object({
        id: z.number().int(),
        status: z.string(),
        code: z.string(),
        actor: z.string(),
        created_at: z.iso.datetime({ offset: true }),
      }),
    )
    .optional(),
  power: z
    .object({
      action: z.enum(["start", "shutdown", "reboot"]),
      status,
      phase: z.string(),
      power_state: z.enum(["running", "stopped"]).nullable(),
      os_boot: z.literal("unknown").optional(),
      guest_agent: z.literal("unknown").optional(),
      cloud_init: z.literal("unknown").optional(),
      accessible: z.literal("unknown").optional(),
      guest_ready: z.null().optional(),
      started_at: z.iso.datetime({ offset: true }).nullable().optional(),
      submitted_at: z.iso.datetime({ offset: true }).nullable().optional(),
      finished_at: z.iso.datetime({ offset: true }).nullable().optional(),
    })
    .nullable()
    .optional(),
  fulfillment: z
    .object({
      status: z.string(),
      phase: z.string(),
      start_operation_id: z.string().nullable().optional(),
      initialization_operation_id: z.string().nullable().optional(),
      guest_ready: z.null().optional(),
    })
    .nullable()
    .optional(),
  initialization: z
    .object({
      status: z.string(),
      mode: z.string(),
      started_at: z.iso.datetime({ offset: true }).nullable(),
      finished_at: z.iso.datetime({ offset: true }).nullable(),
    })
    .nullable()
    .optional(),
});
export const eventSchema = z.object({
  event_id: z.number().int(),
  correlation_id: z.string().nullable(),
  operation_id: z.string(),
  instance_id: z.string().nullable(),
  tenant_id: z.string().nullable(),
  occurred_at: z.iso.datetime({ offset: true }),
  kind: z.string(),
  status: z.string(),
  code: z.string().nullable(),
  actor: z.string().nullable(),
  service: z
    .enum(["IaC Worker", "Lifecycle Worker", "IACP Orchestrator"])
    .nullable(),
});
export const eventPageSchema = z.object({
  events: z.array(eventSchema),
  next_after: z.number().int(),
  delivery: z.literal("replayable-polling").optional(),
});
export const diagnosticsSchema = z.object({
  tenant_id: z.string().nullable(),
  observed_at: z.iso.datetime({ offset: true }).nullable(),
  dependencies: z.record(z.string(), z.string()).default({}),
  active_operations: z.number().int().nonnegative(),
  uncertain_operations: z.number().int().nonnegative(),
  oldest_active_age_seconds: z.number().nonnegative().nullable(),
  worker_liveness: z.literal("unknown").default("unknown"),
  queue_depth: z
    .record(z.string(), z.number().int().nonnegative())
    .nullable()
    .optional(),
  queue_scope: z.literal("not-disclosed").default("not-disclosed"),
});
export type Operation = z.infer<typeof operationSchema>;
export type AuditEvent = z.infer<typeof eventSchema>;
export type Diagnostics = z.infer<typeof diagnosticsSchema>;
export type EvidenceStatus = "fresh" | "stale" | "unknown";
export interface EvidenceEnvelope {
  source: string;
  queriedAt: string;
  observedAt: string | null;
  freshness: EvidenceStatus;
  status: string;
  errorCode?: string;
  correlationId?: string | null;
}
export interface ObservationSource {
  operations(offset?: number): Promise<Operation[]>;
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
