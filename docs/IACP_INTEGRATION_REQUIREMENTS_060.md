# Requisitos de integración IaCoC 0.6.0 para el frente IACP

La decisión definitiva del usuario da por resueltas las cuotas comerciales históricas. No son una dependencia pendiente y no se investigan ni replican en IaCoC. Este documento distingue contratos, código y comprobaciones; no autoriza cambios desde este repositorio.

## Prioridad 1: CRM y trazabilidad

| Capacidad                 | Contrato usado                                                        | Estado y evidencia                                                                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Catálogo                  | GET /v1/plans, /v1/images                                             | Disponible y comprobado por HTTPS y GUI con IACP real; todas las filas se presentan. Availability/authorization son datos del backend, sin whitelist local                                                   |
| Perfiles técnicos         | GET /v1/profiles                                                      | Disponible y comprobado; informativo en contrato comercial, nunca genera cuotas locales                                                                                                                      |
| Crear KVM                 | POST /v1/instances, CommercialInstanceCreate                          | Contrato desplegado comprobado; solicitudes nuevas con clave nueva, sin cálculos de cuota ni preflight comercial restrictivo en IaCoC. IACP conserva admisión/capacidad/autorización                         |
| Inventario y detalle      | GET /v1/instances?limit=100&offset=N y /{id}                          | Disponible y comprobado con IACP real; paginación navegable sin límite total local; no inferir producto/IP/nodo ausentes                                                                                     |
| Energía y DELETE          | GET /{id}/power; POST /{id}/power/start,shutdown,reboot; DELETE /{id} | Contrato disponible; UI/BFF validado localmente, resultado real solo se acredita con IDs/evidencia del recorrido autorizado. Mutations_available y estados observados; IACP decide propiedad, locks y fences |
| Operaciones               | GET /v1/operations?limit=50&offset=N y /{id}                          | Disponible y comprobado en lecturas reales. Paginación, estado normalizado/persistido, eventos propios de cada operación y duración como intervalo de evidencia                                              |
| Eventos                   | GET /v1/events?after=N&limit=100                                      | Disponible y comprobado. Solapamiento y deduplicación por event_id, exploración desde inicio; no garantía de outbox. La historia de cada operación complementa el feed                                       |
| Producto de una instancia | InstanceResponse no publica plan_id en el snapshot comprobado         | Pendiente de contrato IACP: publicar plan_id/image_id como identidad comercial estable, sin inferir plan por recursos o commercial_context opaco                                                             |
| Identidad y scopes        | Observability acredita tenant, no subject/roles/administration        | Pendiente de contrato IACP: introspección autenticada de identidad, purposes/roles/administration/actions del propio principal. No crear una credencial administrativa para suplirlo                         |

## Diferencias entre fuentes

El checkout hermano auditado estaba en 2b0c065 y exponía InstanceCreate de perfiles/políticas. El runtime comprobado publicó CommercialInstanceCreate, /v1/plans e /v1/images manteniendo info.version=0.10.1. Se guardan ambos snapshots de auditoría en docs/contracts. IaCoC descubre el $ref efectivo del contrato y rechaza esquemas desconocidos; no convierte una solicitud comercial en el contrato histórico. La disponibilidad en una rama/código no acredita despliegue. El frente IACP debe publicar una versión/digest de contrato que distinga cambios materiales.

## Prioridad 2: workers y colas — contrato aún no publicado

El contrato comprobado de /v1/observability devuelve worker_liveness=unknown y queue_scope=not-disclosed. No contiene heartbeats, registro de workers, asignación worker/operation ni profundidad real del broker. Los snapshots OpenAPI no publican una ruta de workers/colas ni SSE; IaCoC no llama rutas inventadas. Mientras falte, muestra **Sin instrumentación**. Actor/service de un evento acredita actividad histórica, nunca que un proceso siga vivo.

Propuesta para el frente IACP, con ruta **por acordar y publicar en OpenAPI**:

- Envelope: schema_version, tenant_id implícito del token, observed_at UTC, source, freshness, partial, telemetry_errors y next_cursor.
- Worker: worker_id opaco estable por proceso, service/kind, build/version opcionales, process_started_at, last_heartbeat_at, heartbeat_age_seconds, state (available/busy/no-signal/unknown), current_operation_id opcional, work_started_at y last_activity_at. No utilizar Docker running como heartbeat. Una asignación debe ser explícita y tenant-scoped; trabajadores compartidos no deben revelar operaciones de otros tenants.
- Cola: queue_id/kind autorizado, source exacta del broker/colector, observed_at, pending/running/retried/failed y oldest_pending_age_seconds con null si no existe una medición real. Precisar si contadores son gauges actuales o acumulados. IDs de operación visibles paginados; ningún conteo derivado de una página PostgreSQL se denomina profundidad del broker.
- Autenticación/RBAC: reader del tenant para vista de ese tenant; telemetría global solo con ámbito administrativo formal separado. No ampliar permisos de los tokens CRM. No socket Docker, acceso root Docker ni acceso directo de IaCoC a Redis/PostgreSQL/Portainer.
- Frescura propuesta: heartbeat cada 10 s; evidencia fresh <=30 s, sin señal >45 s, unknown si la fuente no mide o el reloj no es coherente. Publicar observed_at y last_heartbeat_at sin reescribir UTC; umbrales deben confirmarse mediante pruebas reales y documentarse en el contrato.
- Paginación: cursor opaco estable por snapshot, límite técnico documentado y capacidad de recorrer todas las filas. Respuestas de otro tenant: 404/403 sin datos; 401 revocado; 429 con Retry-After; 503 fuente no disponible. Una respuesta parcial conserva null/unknown por métrica y motivos; no convierte un fallo en cero.
- Verificación: probar tenants distintos, reinicio de proceso, heartbeat atrasado/futuro, asignación/desasignación y broker caído. Si se publica un stream futuro, describir retención/replay/deduplicación y su garantía de entrega; no prometerla por un cursor SQL.

## Prioridad 3: diagnóstico y recuperación

POST /v1/instances/{id}/reconcile está publicado e implementado como observación de una mutación consumida. IaCoC lo ofrece manualmente para una operación incierta, con sesión/RBAC/tenant, y deja la autorización final en IACP. No ejecuta Apply ni altera state, fences o locks. Su certificación real debe registrar IDs, método, estado antes/después y ausencia de nueva mutación.

Solicitar diagnóstico enriquecido con fase, retryability, expected_state/observed_state explícitos, IDs de operación/instancia/correlación/worker si existen, último progreso observado, recovery_available/reason y acción segura documentada. ErrorResponse debería publicar error_code neutral estable, categoría, request_id y Retry-After; nunca stderr, cuerpos sensibles o secretos. La falta de esas señales no se rellena con indicadores sintéticos.

## Evidencia para certificar el MVP completo

El cierre real registra una KVM nueva descartable, plan e imagen publicados, tenant autenticado, clave por intención, instance_id/operation_id, evidencia de provisión/arranque/inicialización/acceso separada, start/shutdown/reboot/DELETE autorizados, eventos y estado final. Probar una segunda creación intencional del mismo plan y otra de un plan elegible sin techos de IaCoC. No tocar 104, 106, 29000 ni máquinas anteriores. La publicación OCI de IaCoC no acredita este recorrido ni la instrumentación de workers.

## Evidencia real de cierre y siguiente diagnóstico del frente IACP

La instancia nueva a5318da2-79bd-485f-b334-79ba739f3666 llegó a KVM 30028/mng01 y acceso completed después de reconciliar una observación inicialmente incierta (operación 4c510abe-cda4-4cb7-a0df-6361ab9372b4). Shutdown y start completaron; reboot 1869769b-cfed-4101-97a5-7a6ecd77256c terminó con POWER_ACPI_TIMEOUT. La evidencia del usuario muestra QEMU Guest Agent sin respuesta y quit/powerdown timeout durante ese task. Revisar readiness del invitado tras start y el contrato de diagnóstico; no convertir power=running en guest readiness ni añadir force automático.

IaCoC completó después un apagado normal y DELETE autorizado de esa misma KVM nueva; la instancia quedó deleted. No hay cuotas históricas pendientes ni recursos preexistentes alterados. El caso de reboot es un resultado real verificable del backend y necesita certificación del frente IACP antes de declarar el ciclo completo exitoso. IDs completos y fases están en VALIDATION_060.md y evidence/060.
