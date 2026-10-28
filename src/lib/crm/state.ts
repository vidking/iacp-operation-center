import type { Instance } from "#lib/types/crm.ts";
import type { Operation } from "#lib/types/observation.ts";

const ACTIVE_STATUSES = new Set(["queued", "running", "uncertain"]);
type OperationActivity = Pick<
  Operation,
  "normalized_status" | "fulfillment" | "initialization" | "deletion"
>;

export type NetworkEvidence = {
  addresses: string[];
  source:
    | "instance.ip_addresses"
    | "instance.network_observation.ip_addresses"
    | "not_published";
  observedAt: string | null;
  status: string | null;
  reason: string | null;
};

function addressList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (address): address is string =>
          typeof address === "string" && address.trim().length > 0,
      ),
    ),
  ];
}

/**
 * IACP publishes `ip_addresses` as the authoritative instance field.  The
 * network observation object is open-ended in the contract, so only a nested
 * field with that same published name is recognized; arbitrary Proxmox-like
 * keys are intentionally not guessed or promoted to an IP.
 */
export function networkEvidence(
  instance: Pick<
    Instance,
    "ip_addresses" | "network_observation" | "updated_at"
  >,
): NetworkEvidence {
  const observation = instance.network_observation;
  const status =
    typeof observation?.status === "string" ? observation.status : null;
  const reason =
    typeof observation?.reason === "string" ? observation.reason : null;
  const direct = addressList(instance.ip_addresses);
  if (direct.length)
    return {
      addresses: direct,
      source: "instance.ip_addresses",
      observedAt:
        typeof instance.network_observation?.observed_at === "string"
          ? instance.network_observation.observed_at
          : instance.updated_at,
      status,
      reason,
    };
  const observed = addressList(instance.network_observation?.ip_addresses);
  if (observed.length)
    return {
      addresses: observed,
      source: "instance.network_observation.ip_addresses",
      observedAt:
        typeof instance.network_observation?.observed_at === "string"
          ? instance.network_observation.observed_at
          : instance.updated_at,
      status,
      reason,
    };
  return {
    addresses: [],
    source: "not_published",
    observedAt: null,
    status,
    reason,
  };
}

/**
 * A fulfillment can keep an instance unavailable after its root operation has
 * completed.  This is deliberately a conservative predicate: unknown or
 * uncertain work blocks a mutation until IACP publishes a terminal result.
 */
export function operationIsActive(operation: OperationActivity) {
  const nested = [
    operation.fulfillment,
    operation.initialization,
    operation.deletion,
  ];
  return (
    ACTIVE_STATUSES.has(operation.normalized_status) ||
    nested.some(
      (part) =>
        !!part &&
        typeof part.status === "string" &&
        ACTIVE_STATUSES.has(part.status),
    )
  );
}

export function hasActiveOperation(operations: OperationActivity[]) {
  return operations.some(operationIsActive);
}

export function isTransientReadFailure(
  code: string,
  upstreamStatus?: number | null,
) {
  return (
    [502, 503, 504].includes(upstreamStatus ?? 0) ||
    [
      "UPSTREAM_HTTP_ERROR",
      "UPSTREAM_READ_ERROR",
      "UPSTREAM_SERVICE_UNAVAILABLE",
      "UPSTREAM_TIMEOUT",
      "UPSTREAM_UNAVAILABLE",
    ].includes(code)
  );
}

export function isTemporaryPowerFailure(code: string) {
  return isTransientReadFailure(code) || code === "POWER_PROXMOX_UNAVAILABLE";
}

export function powerStatusMessage(
  code: string,
  blockedReason: string | null | undefined,
  stale: boolean,
) {
  if (stale || isTemporaryPowerFailure(code))
    return "La última observación de energía está desactualizada por una falla temporal. Las mutaciones permanecen bloqueadas hasta recuperar una lectura válida.";
  if (code === "POWER_INSTANCE_NOT_AUTHORIZED")
    return "IACP no autorizó la consulta o la operación de energía para esta instancia.";
  if (code === "COMMERCIAL_OWNERSHIP_BINDING_CHANGED")
    return "IACP detectó que la vinculación comercial de esta instancia cambió. Las acciones permanecen bloqueadas hasta que IACP confirme la pertenencia y autorización actuales.";
  if (blockedReason === "COMMERCIAL_OWNERSHIP_BINDING_CHANGED")
    return "IACP detectó que la vinculación comercial de esta instancia cambió. Las acciones permanecen bloqueadas hasta que IACP confirme la pertenencia y autorización actuales.";
  if (code === "POWER_STATE_BLOCKED")
    return "IACP bloqueó la acción porque el estado o la precondición de energía no coincide.";
  return blockedReason
    ? `IACP informó una precondición de energía: ${blockedReason}.`
    : "No hay evidencia actual suficiente para habilitar acciones de energía.";
}
