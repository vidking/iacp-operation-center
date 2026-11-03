# Integración de APIs ControlPlane

Producción (`ControlPlane`) y desarrollo (`ControlPlane dev`) son APIs
independientes. Cada una publica y mantiene su propio OpenAPI, endpoint,
credencial y estado de conexión. Sus contratos actuales tienen la misma forma
para las operaciones técnicas que usa IaCoC, así que el portal aplica el mismo
flujo de consumo al endpoint seleccionado. El OpenAPI de una API no sustituye
el contrato publicado por la otra y el adaptador no se bifurca por entorno.

El snapshot tipado local se genera desde el OpenAPI de desarrollo y facilita
el trabajo de compilación; no sustituye el contrato publicado por producción.
Antes de cambiar rutas o campos se inspeccionan los OpenAPI de ambas APIs y se
confirma que siguen siendo compatibles. El cliente no inventa endpoints
upstream. Las respuestas conservan status,
normalized_status, códigos, correlation_id, fechas de evidencia y estados
uncertain/stale/unknown. tenant_id, dependencies, worker_liveness y cualquier
capacidad ausente se representan como no publicados o desconocidos; su ausencia
no convierte una conexión sana en caída.

IaCoC mantiene una fuente local independiente por endpoint. Ambas APIs pueden
estar activas al mismo tiempo y cada lectura técnica exige el `connectionId`
explícito de la fuente seleccionada. La activación single-tenant
usa exactamente `{ action: "activate", confirmSingleTenant: true }`, persiste el
alcance confirmado y es idempotente mientras no cambien endpoint, credencial o
contrato detectado.

La pantalla de Connectors muestra una sola confirmación para la fuente
validada. Si ya existe una confirmación pendiente, otro clic en Conectar solo
enfoca esa confirmación; no vuelve a validar ni borra el checkbox.

Workers y la consola de ejecución usan los campos publicados por
`/v1/workers`, `/v1/observability`, `/v1/operations` y `/v1/events`. Los títulos
de la interfaz son etiquetas de presentación de `kind`, `command`, `action` y
`code`; no alteran el estado remoto. Incidents es una vista derivada de fallos
e incertidumbres ya publicados y no un endpoint inventado. Las respuestas del
BFF añaden evidencia (`source`, disponibilidad, cantidad y motivo) de forma
aditiva para que la UI distinga una colección vacía, una capacidad no publicada
y un error upstream.

Para la red, ambas fuentes publican una lectura separada en
`GET /v1/instances/{instance_id}/network`. `observed_ipv4` contiene únicamente
direcciones confirmadas por Guest Agent; cuando existe una reserva estática,
`network_allocation.address` se muestra solo con estado `allocated`. El BFF
normaliza ambos campos a `ip_addresses` sin convertir el CIDR configurado ni una
IP histórica en conectividad actual. No existe una bifurcación de red legacy.

El aprovisionamiento técnico usa exclusivamente `POST /v1/instances` del
OpenAPI publicado. IaCoC envía una contraseña root efímera generada en memoria,
no la persiste ni la devuelve al navegador, incluye una Idempotency-Key nueva y
devuelve el estado que IACP haya aceptado. Un timeout no crea otra instancia:
la intención existente debe consultarse mediante operaciones antes de decidir
el siguiente paso.

La eliminación exige confirmación administrativa en IaCoC. Si la versión
publicada del OpenAPI devuelve un `operation_id` y `plan_sha256` para un plan
revisado, IaCoC los reenvía; si el contrato vivo acepta el cuerpo vacío, solo
envía la intención confirmada y deja ownership, estado y locks a IACP. IaCoC
nunca inventa un digest, VMID o permiso.
