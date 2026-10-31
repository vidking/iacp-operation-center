# Integración API V2

El OpenAPI actual publicado por ControlPlaneV2 es la única autoridad para la
integración técnica. La especificación publica health, eventos, imágenes,
instancias, acceso de instancia, red, energía, jobs, observabilidad,
operaciones y planes técnicos. V2 no conserva el adaptador CRM ni contratos
comerciales del ControlPlane anterior.

El generador monta ese OpenAPI en modo lectura y produce una vista tipada
técnica. Mientras ControlPlaneV2 termina de retirar metadata histórica del
documento publicado, el límite de IaCoC elimina esos campos antes de generar
tipos; no modifica el repositorio ni el servicio ControlPlaneV2.

El cliente no inventa endpoints upstream. Las respuestas conservan status,
normalized_status, códigos, correlation_id, fechas de evidencia y estados
uncertain/stale/unknown. tenant_id, dependencies, worker_liveness y cualquier
capacidad ausente se representan como no publicados o desconocidos; su ausencia
no convierte una conexión sana en caída.

IaCoC mantiene una fuente local por endpoint. Varias fuentes ControlPlaneV2
pueden estar activas al mismo tiempo y cada lectura técnica exige el
`connectionId` explícito de la fuente seleccionada. La activación single-tenant
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
