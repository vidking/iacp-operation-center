import type { Operation } from "./types/observation.ts";
import { instant } from "./time.ts";
export function evidenceSeconds(created: string, updated: string) {
  const a = instant(created),
    b = instant(updated);
  return a === null || b === null || b < a ? null : Math.round((b - a) / 1000);
}
export function diagnosis(operation: Operation, now = Date.now()) {
  const code = operation.error_code ?? "";
  if (
    /QUOTA|PLAN_NOT_AUTHORIZED|POLICY|PROFILE.*REQUIRED|FORBIDDEN|AUTH/.test(
      code,
    )
  )
    return {
      category: "Solicitud rechazada",
      next: "Revisar permisos, producto y límites con IACP. Un rechazo no acredita fallo del motor.",
    };
  if (operation.normalized_status === "uncertain")
    return {
      category: "Resultado incierto",
      next: "Conservar UUID y clave. Consultar evidencia y reconciliación autorizada; no repetir la mutación.",
    };
  if (code === "POWER_ACPI_TIMEOUT")
    return {
      category: "Transición normal agotó el plazo",
      next: "IACP no confirmó la transición ACPI. Revisar el arranque y Guest Agent con el frente IACP; no sustituir por force-stop.",
    };
  const at = instant(operation.updated_at);
  if (
    ["queued", "running"].includes(operation.normalized_status) &&
    at !== null &&
    now - at > 120000
  )
    return {
      category: "Sin evidencia reciente",
      next: "Consultar la misma operación y dependencias. La antigüedad no acredita un worker detenido.",
    };
  if (operation.normalized_status === "failed")
    return {
      category: "Operación fallida",
      next: "Consultar código, fase y eventos; no ejecutar comandos directos ni desbloqueos.",
    };
  return {
    category: "Seguimiento",
    next: "Consultar la siguiente evidencia de IACP; admisión y finalización son estados distintos.",
  };
}
