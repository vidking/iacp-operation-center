export type ConnectionState =
  | "connected"
  | "disconnected"
  | "degraded"
  | "authentication-required"
  | "forbidden"
  | "empty";
export const stateLabels: Record<ConnectionState, string> = {
  connected: "Conectado",
  disconnected: "IACP desconectado",
  degraded: "Degradado",
  "authentication-required": "Autenticación requerida",
  forbidden: "Sin permisos",
  empty: "Sin datos disponibles",
};
export function stateForError(code?: string): ConnectionState {
  if (code === "UPSTREAM_UNAUTHORIZED") return "authentication-required";
  if (["UPSTREAM_FORBIDDEN", "UPSTREAM_TENANT_MISMATCH"].includes(code ?? ""))
    return "forbidden";
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
