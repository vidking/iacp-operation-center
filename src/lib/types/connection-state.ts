export type ConnectionState =
  | "connected"
  | "unknown"
  | "stale"
  | "disconnected"
  | "degraded"
  | "unauthorized"
  | "empty"
  // Kept as compatibility aliases for persisted/UI callers from 0.6.x.
  | "authentication-required"
  | "forbidden";
export const stateLabels: Record<ConnectionState, string> = {
  connected: "Conectado",
  unknown: "Estado no acreditado",
  stale: "Evidencia obsoleta",
  disconnected: "IACP desconectado",
  degraded: "Degradado",
  unauthorized: "Autenticación requerida",
  "authentication-required": "Autenticación requerida",
  forbidden: "Sin permisos",
  empty: "Sin datos disponibles",
};
export function stateForError(code?: string): ConnectionState {
  if (
    [
      "UPSTREAM_UNAUTHORIZED",
      "UPSTREAM_FORBIDDEN",
      "UPSTREAM_TENANT_MISMATCH",
    ].includes(code ?? "")
  )
    return "unauthorized";
  if (
    [
      "UPSTREAM_NOT_READY",
      "UPSTREAM_SERVICE_UNAVAILABLE",
      "UPSTREAM_CONTRACT_ERROR",
      "UPSTREAM_INVALID_RESPONSE",
    ].includes(code ?? "")
  )
    return "degraded";
  return "disconnected";
}
