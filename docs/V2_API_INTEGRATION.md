# Integración API V2

Consultamos en modo lectura IACOC_CONTRACT.md, CRM_INTEGRATION.md y openapi.json
del repositorio IACP. La especificación OpenAPI 3.1.0 de IACP Orchestrator
0.10.1 publica health, eventos, imágenes, instancias, observabilidad,
operaciones y planes.

El cliente no inventa endpoints upstream. Las respuestas conservan status,
normalized_status, códigos, correlation_id, fechas de evidencia y estados
uncertain/stale/unknown. tenant_id, dependencies, worker_liveness y cualquier
capacidad ausente se representan como no publicados o desconocidos.

Cada creación técnica usa una intención nueva y una Idempotency-Key nueva. Un
timeout no crea otra instancia: consultamos la intención existente y respetamos
la decisión de IACP.
