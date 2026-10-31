# Arquitectura V2

Usamos una SPA React en apps/web, un BFF Fastify en apps/bff y paquetes
compartidos para contratos, cliente API, configuración y UI. La SPA nunca
recibe Bearer ni credenciales remotas.

TanStack Router mantiene un shell persistente. TanStack Query administra una
consulta por recurso, conexión y versión de credencial; las consultas lentas no
bloquean rutas. SQLite local conserva usuarios, sesiones, conexiones,
asignaciones de conectores, preferencias y auditoría. Las credenciales ControlPlaneV2 se cifran con AES-GCM usando un
keyring externo; solo el BFF descifra en memoria durante la validación.

Los adaptadores upstream consumen únicamente paths presentes en el OpenAPI real
de IACP. El BFF decide sesión, RBAC, CSRF, origen, allowlist, DNS, TLS, límites
y correlación antes de llamar al servidor remoto. El módulo técnico recibe una
fuente seleccionada de forma explícita y no confunde el tenant local con el
alcance remoto.

Overview agrega todas las fuentes activas sin elegir una como sustituto de las
demás. Instances, Provisioning, Operations y Events tienen consultas de
TanStack Query separadas por conexión; una fuente lenta no bloquea la
navegación ni permite que una respuesta antigua sobrescriba otra selección.

Users & Access persiste los tres roles (`Lector`, `Operador` y
`Administrador`) y sus permisos por conector. El BFF filtra fuentes y bloquea
lecturas o mutaciones no asignadas aunque la UI sea manipulada. Settings
persiste tema y escala tipográfica por identidad, sin permitir editar variables
de Docker ni configuración empresarial arbitraria.

Workers consulta `/v1/workers` cuando el contrato lo publica y, si una fuente
no lo expone, puede mostrar únicamente `worker_id` observado en operaciones
reales como historial. En ese caso heartbeat, liveness y cola permanecen
`Desconocido`; nunca derivamos workers vivos. Incidents se construye solo de
operaciones y eventos publicados con estado `failed`, `uncertain` o `stale`.

Provisioning envía intenciones técnicas directamente al BFF. El BFF genera el
secreto de acceso efímero en memoria, agrega la clave de idempotencia y no
guarda credenciales remotas en SQLite. La eliminación exige la evidencia
`operation_id` y `plan_sha256` que publica IACP; IaCoC nunca inventa una prueba
de autorización.
