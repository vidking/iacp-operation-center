import { z } from "zod";
import { authorizedRead, connectionContext } from "../connections/service.ts";
import { read, recoveryContract, command } from "../crm/service.ts";
import { requireRole } from "../security/auth.ts";
import { SecurityError } from "../security/config.ts";
import { instanceSchema, powerSchema } from "../../types/crm.ts";
import type { Principal } from "../../types/security.ts";
import type { Operation } from "../../types/observation.ts";
import {
  correlatedEvents,
  incidentState,
  incidentDiagnosis,
  recoveryEligible,
  safeEvidence,
} from "../../types/incidents.ts";
import { singleFlight } from "../../refresh.ts";

async function currentInstance(user: Principal | undefined, id: string) {
  z.uuid().parse(id);
  try {
    const value = await read(user, `/v1/instances/${id}`, instanceSchema);
    if (value.instance_id !== id)
      throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
    if (value.infrastructure_kind === "simulated")
      throw new SecurityError("NON_REAL_INFRASTRUCTURE_REJECTED", 502);
    return { instance: value, instanceError: null };
  } catch (e) {
    // Never retain an earlier snapshot on auth/tenant failures.
    if (
      !(e instanceof SecurityError) ||
      ![
        "UPSTREAM_NOT_FOUND",
        "UPSTREAM_SERVICE_UNAVAILABLE",
        "UPSTREAM_TIMEOUT",
        "UPSTREAM_UNAVAILABLE",
      ].includes(e.code)
    )
      throw e;
    return { instance: null, instanceError: e.code };
  }
}
function projected(
  operation: Operation,
  current: Awaited<ReturnType<typeof currentInstance>>,
) {
  // No arbitrary upstream messages, bodies or stderr are forwarded.
  const op = {
    ...operation,
    kind: safeEvidence(operation.kind),
    requested_by: safeEvidence(operation.requested_by),
    error_code: operation.error_code
      ? safeEvidence(operation.error_code)
      : null,
    events: operation.events?.map((e) => ({
      ...e,
      code: safeEvidence(e.code),
      actor: safeEvidence(e.actor),
      status: safeEvidence(e.status),
    })),
    power: operation.power
      ? { ...operation.power, phase: safeEvidence(operation.power.phase) }
      : operation.power,
    fulfillment: operation.fulfillment
      ? {
          ...operation.fulfillment,
          phase: safeEvidence(operation.fulfillment.phase),
        }
      : operation.fulfillment,
  };
  const instance = current.instance
    ? {
        ...current.instance,
        name: safeEvidence(current.instance.name),
        image: safeEvidence(current.instance.image),
        node: current.instance.node
          ? safeEvidence(current.instance.node)
          : null,
      }
    : null;
  const state = incidentState(op, instance);
  return {
    operation: op,
    instance,
    instanceError: current.instanceError,
    state,
    severity:
      state === "closed" || state === "historical"
        ? "informativa"
        : op.normalized_status === "uncertain"
          ? "alta"
          : "advertencia",
    diagnosis: incidentDiagnosis(op, instance),
  };
}
export async function incidentList(user: Principal | undefined, offset = 0) {
  const actor = requireRole(user),
    c = connectionContext(actor);
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new SecurityError("INVALID_OFFSET");
  return singleFlight(
    `incidents:${actor.tenantId}:${c.id}:${c.version}:${offset}`,
    async () => {
      const operations = await authorizedRead(actor, (source) =>
        source.operations(offset),
      );
      const candidates = operations.filter((o) => incidentState(o, null));
      const ids = [...new Set(candidates.map((o) => o.instance_id))];
      const instances = new Map<
        string,
        Awaited<ReturnType<typeof currentInstance>>
      >();
      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(4, ids.length) }, async () => {
          while (cursor < ids.length) {
            const id = ids[cursor++];
            instances.set(id, await currentInstance(actor, id));
          }
        }),
      );
      // Detect tenant/connection switch even if all individual reads completed successfully.
      const now = connectionContext(actor);
      if (
        now.id !== c.id ||
        now.version !== c.version ||
        now.tenant !== c.tenant
      )
        throw new SecurityError("CONNECTION_CHANGED", 409);
      const queriedAt = new Date().toISOString();
      const observedAt = operations.reduce<string | null>(
        (latest, operation) =>
          !latest || Date.parse(operation.updated_at) > Date.parse(latest)
            ? operation.updated_at
            : latest,
        null,
      );
      return {
        incidents: candidates.map((o) =>
          projected(o, instances.get(o.instance_id)!),
        ),
        offset,
        hasMore: operations.length === 50,
        operationsQueried: operations.length,
        queriedAt,
        observedAt,
        evidence: {
          source: "IACP /v1/operations + instance detail",
          queriedAt,
          observedAt,
          freshness: observedAt ? "fresh" : "unknown",
          status: "observed",
        },
        scope:
          "Página de operaciones consultada; filtros locales a esta página",
      };
    },
  );
}
export async function incidentDetail(user: Principal | undefined, id: string) {
  const actor = requireRole(user),
    c = connectionContext(actor);
  z.uuid().parse(id);
  return singleFlight(
    `incident:${actor.tenantId}:${c.id}:${c.version}:${id}`,
    async () => {
      const operation = await authorizedRead(actor, (source) =>
        source.operation(id),
      );
      if (operation.operation_id !== id)
        throw new SecurityError("UPSTREAM_CONTRACT_ERROR", 502);
      const current = await currentInstance(actor, operation.instance_id);
      const eventPage = await authorizedRead(actor, (source) =>
        source.events(),
      );
      let power = null,
        powerError: string | null = null;
      if (
        current.instance &&
        !["deleted", "deleting"].includes(current.instance.status)
      ) {
        try {
          power = await read(
            actor,
            `/v1/instances/${operation.instance_id}/power`,
            powerSchema,
          );
          if (power.instance_id !== operation.instance_id)
            throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
        } catch (e) {
          if (
            !(e instanceof SecurityError) ||
            ![
              "UPSTREAM_NOT_FOUND",
              "UPSTREAM_CONFLICT",
              "UPSTREAM_SERVICE_UNAVAILABLE",
              "UPSTREAM_TIMEOUT",
              "UPSTREAM_UNAVAILABLE",
            ].includes(e.code)
          )
            throw e;
          powerError = e.code;
        }
      }
      const eligible = recoveryEligible(operation, current.instance);
      const supported = eligible ? await recoveryContract(actor) : false;
      const allowed = actor.role === "Administrator" && eligible && supported;
      const now = connectionContext(actor);
      if (
        now.id !== c.id ||
        now.version !== c.version ||
        now.tenant !== c.tenant
      )
        throw new SecurityError("CONNECTION_CHANGED", 409);
      const queriedAt = new Date().toISOString();
      return {
        ...projected(operation, current),
        power,
        powerError,
        events: correlatedEvents(eventPage.events, operation).map((e) => ({
          ...e,
          code: safeEvidence(e.code),
          actor: safeEvidence(e.actor),
          correlation_id: safeEvidence(e.correlation_id),
          kind: safeEvidence(e.kind),
          status: safeEvidence(e.status),
        })),
        eventScope:
          "Ventana de eventos consultada (máximo 100); el historial de operación complementa la evidencia, sin garantía de entrega sin pérdidas.",
        queriedAt,
        observedAt: operation.updated_at,
        evidence: {
          source: "IACP operation and event detail",
          queriedAt,
          observedAt: operation.updated_at,
          freshness: "fresh",
          status: operation.normalized_status,
          correlationId:
            eventPage.events.find((event) => event.operation_id === id)
              ?.correlation_id ?? null,
        },
        recovery: {
          allowed,
          supported,
          reason: allowed
            ? "Elegible para solicitar observación; IACP decide la admisión."
            : current.instance?.status === "deleted"
              ? "Recurso eliminado. Fallo histórico sin recuperación."
              : !eligible
                ? "IACP no declara resultado incierto con recovery_required para este recurso activo."
                : !supported
                  ? "Contrato de reconciliación no publicado por IACP."
                  : "Se requiere Administrator local y una conexión IACP validada.",
        },
      };
    },
  );
}
export async function reconcileIncident(
  user: Principal | undefined,
  id: string,
  input: unknown,
) {
  requireRole(user, ["Administrator"]);
  z.uuid().parse(id);
  const value = z
    .object({
      key: z.uuid(),
      confirmInstanceId: z.uuid(),
      expectedOperationUpdatedAt: z.iso.datetime({ offset: true }),
      expectedInstanceUpdatedAt: z.iso.datetime({ offset: true }),
    })
    .strict()
    .parse(input);
  const current = await incidentDetail(user, id);
  if (
    !current.recovery.allowed ||
    current.operation.instance_id !== value.confirmInstanceId
  )
    throw new SecurityError("RECOVERY_NOT_ELIGIBLE", 409);
  return command(user, {
    key: value.key,
    action: "reconcile",
    instanceId: value.confirmInstanceId,
    recoveryOperationId: id,
    expectedOperationUpdatedAt: value.expectedOperationUpdatedAt,
    expectedInstanceUpdatedAt: value.expectedInstanceUpdatedAt,
  });
}
export type IncidentPage = Awaited<ReturnType<typeof incidentList>>;
export type IncidentDetail = Awaited<ReturnType<typeof incidentDetail>>;
