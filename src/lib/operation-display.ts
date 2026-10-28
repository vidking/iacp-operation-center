import type { Operation } from "./types/observation.ts";

const actionLabels: Record<string, string> = {
  create: "Creación",
  delete: "Eliminación",
  start: "Encendido",
  shutdown: "Apagado ordenado",
  reboot: "Reinicio",
  initialize: "Inicialización",
  network: "Configuración de red",
  power: "Cambio de energía",
};

/** Human text is a presentation layer; the original IACP kind remains visible as metadata. */
export function humanizeKind(kind: string) {
  const normalized = kind.trim().toLowerCase();
  if (normalized.includes("delete")) return "Eliminación de KVM";
  if (normalized.includes("network")) return "Inicialización de red";
  if (normalized.includes("power.shutdown")) return "Apagado ordenado";
  if (normalized.includes("power.reboot")) return "Reinicio de KVM";
  if (normalized.includes("power.start") || normalized.endsWith(".start"))
    return "Encendido de KVM";
  const action = normalized.split(/[._-]/).find((part) => actionLabels[part]);
  return action ? actionLabels[action] : kind;
}

export function operationSummary(
  operation: Pick<Operation, "kind" | "error_code">,
) {
  return operation.error_code
    ? `${humanizeKind(operation.kind)} · ${operation.error_code}`
    : humanizeKind(operation.kind);
}

export function humanDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds))
    return "No disponible";
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    const rest = total % 60;
    return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest
    ? `${days} día${days === 1 ? "" : "s"} ${rest} h`
    : `${days} día${days === 1 ? "" : "s"}`;
}
