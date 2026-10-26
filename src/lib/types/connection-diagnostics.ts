export type ConnectionCheckId =
  "ready" | "observability" | "events" | "operations" | "operation";
export interface ConnectionCheck {
  id: ConnectionCheckId;
  status: "passed" | "failed" | "skipped";
  code: string;
}
export const checkLabels: Record<ConnectionCheckId, string> = {
  ready: "GET /health/ready",
  observability: "GET /v1/observability · autenticación y tenant",
  events: "GET /v1/events · auditoría del tenant",
  operations: "GET /v1/operations · operaciones",
  operation: "GET /v1/operations/{operation_id} · detalle si existe",
};
const messages: Record<string, string> = {
  OK: "Comprobación correcta.",
  ENDPOINT_NOT_ALLOWED:
    "Destino no autorizado. Usa un origen HTTPS sin rutas. El operador debe autorizar su origen e IP exactas en IACP_ALLOWED_TARGETS desde Portainer.",
  DESTINATION_POLICY_INVALID:
    "La allowlist externa tiene un formato inválido. Debe corregirla el operador en Portainer; este asistente no puede modificarla.",
  UPSTREAM_UNAUTHORIZED:
    "IACP rechazó la autenticación (HTTP 401). Sustituye el token por una credencial Bearer reader vigente; no uses credenciales de Swagger ni el prefijo Bearer.",
  UPSTREAM_FORBIDDEN:
    "Acceso denegado (HTTP 403). Revisa con el operador el permiso reader del tenant y la política de acceso del gateway. El código HTTP no permite distinguir ambas causas.",
  UPSTREAM_TENANT_MISMATCH:
    "La evidencia de IACP pertenece a otro tenant. Usa un reader del tenant de tu sesión; no se activará LIVE.",
  LIVE_DISABLED:
    "LIVE está deshabilitado por el operador. Debe configurar LIVE_ENABLED=true en Portainer. Puedes guardar y probar la conexión sin activarlo.",
  VALIDATION_REQUIRED:
    "Vuelve a probar la conexión. La activación exige una validación completa de la versión actual realizada hace menos de cinco minutos.",
  UPSTREAM_DNS_DENIED:
    "No se pudo resolver el destino o alguna IP resuelta no está autorizada. El operador debe comprobar el DNS del contenedor y las IP exactas de la allowlist.",
  UPSTREAM_TLS_ERROR:
    "No se pudo validar TLS. Revisa nombre del certificado, vigencia y CA del servidor. No desactives la validación TLS.",
  UPSTREAM_TIMEOUT:
    "IACP no respondió dentro del tiempo límite. Revisa conectividad y disponibilidad; no se reintentará automáticamente.",
  UPSTREAM_NOT_READY:
    "IACP indica que todavía no está listo (HTTP 503 en readiness). Revisar el Control Plane con su operador.",
  UPSTREAM_SERVICE_UNAVAILABLE:
    "IACP o su gateway no está disponible (HTTP 503). No se activará LIVE.",
  UPSTREAM_UNAVAILABLE:
    "No fue posible conectar con IACP. Revisa la ruta privada, firewall y disponibilidad del destino.",
  UPSTREAM_REDIRECT_DENIED:
    "El destino devolvió una redirección, bloqueada por seguridad. Usa el origen HTTPS final autorizado; revisa si un gateway exige otro mecanismo de acceso.",
  UPSTREAM_CONTRACT_ERROR:
    "La respuesta no coincide con el contrato IACP compatible. Confirma la versión de API desplegada; no se activará LIVE.",
  UPSTREAM_INVALID_RESPONSE:
    "El destino no devolvió JSON válido. Revisa que sea la API y no una página de login del gateway.",
  UPSTREAM_HTTP_ERROR:
    "La API devolvió un estado HTTP inesperado. Revisa publicación y rutas con el operador.",
  UPSTREAM_RESPONSE_TOO_LARGE:
    "La respuesta excede el límite seguro permitido.",
  UPSTREAM_READ_ERROR: "La lectura de la respuesta se interrumpió.",
  CONNECTION_CHANGED:
    "La conexión cambió durante la prueba. Vuelve a validarla.",
  CONNECTION_DISABLED:
    "La conexión está deshabilitada. Edítala o rota su credencial para habilitarla y vuelve a probar.",
  CREDENTIAL_UNAVAILABLE:
    "No se pudo descifrar la credencial. El operador debe revisar el keyring externo.",
  KEYRING_UNAVAILABLE:
    "El keyring externo no está disponible. El operador debe revisar su montaje y permisos.",
  INVALID_REQUEST: "Revisa los campos del formulario.",
  TOO_MANY_ATTEMPTS:
    "Se alcanzó el límite de intentos. Espera antes de volver a probar.",
  REQUEST_FAILED:
    "No se pudo completar la solicitud. Comprueba tu sesión y vuelve a intentarlo manualmente.",
};
export function connectionMessage(code: string | null) {
  return code
    ? (messages[code] ??
        "La solicitud fue rechazada. Revisa la sesión y contacta al operador si persiste.")
    : "Sin validar.";
}
