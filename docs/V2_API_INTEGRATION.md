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
capacidad ausente se representan como no publicados o desconocidos.

Cada creación técnica usa una intención nueva y una Idempotency-Key nueva. Un
timeout no crea otra instancia: consultamos la intención existente y respetamos
la decisión de IACP.
