# IaCoC 0.6.0 — MVP operativo

## Funcionalidad

Conserva el diseño aprobado de 0.5.0. Añade CRM Simulator con catálogo comercial real, configuración/revisión de KVM, creación directa y repetida, inventario navegable/buscable, detalle, energía observada, start/shutdown/reboot, DELETE con confirmación, nuevas creaciones, historial y reconciliación manual de resultados inciertos.

IaCoC **no calcula cuotas ni impone máximos de instancias, consumo, planes o pruebas**. Cada nueva intención genera una clave nueva y se envía a POST /v1/instances. Un reenvío de la misma clave/cuerpo devuelve el journal existente para evitar duplicados incluso tras timeout/reinicio. IACP autoriza tenant, parámetros, plan, estado, recursos y admisión. Sus rechazos actuales se presentan con código neutral original cuando el ErrorResponse lo entrega; no se usan reglas comerciales históricas ni se sustituye un rechazo por el flujo antiguo.

La aplicación descubre el $ref real del OpenAPI desplegado. CommercialInstanceCreate usa plan_id/image_id, red autorizada, contraseña root transitoria y claves públicas SSH opcionales, sin inventar pedidos comerciales. Si IACP publica el contrato histórico InstanceCreate, se usan los parámetros de ese contrato, sin presupuestos de consumo locales. Los productos disponibles proceden exclusivamente del catálogo actual y sus recursos no se alteran arbitrariamente. CT no se ofrece porque no está publicado.

El journal SQLite guarda clave, hash canónico, actor, acción, IDs, admisión/error y fechas, antes del envío. No guarda contraseña ni cuerpo de creación. `accepted` acredita admisión, nunca infraestructura terminada. Ante una creación incierta sin UUID no se inventa identidad ni se reenvía automáticamente. Reconcile opera sobre el mismo UUID, solo por el contrato seguro de IACP, sin Apply, force ni cambios de state/fences.

## Observación y auditoría

Operations admite paginación, filtros y vínculos a instancias. Actualización de activas cada 4 s con scheduler compartido, single flight, pausa en pestaña oculta, backoff y suspensión tras revocación. El detalle consulta con backoff de lectura acotado, muestra estados persistido/normalizado, eventos propios, fases y códigos, correlaciones conocidas y diagnóstico; nunca inventa worker asignado o etapas no acreditadas.

Events usa ventanas técnicas de 100 con solapamiento por ID y deduplicación, exploración desde inicio y vínculos operación/instancia. La ventana reciente no acredita un outbox sin pérdidas; la historia de operación complementa el feed. Inventario e historial permiten recorrer todas las páginas autorizadas, sin máximo total local. El reporte JSON autenticado incluye instancia, operaciones y eventos proyectados, UTC original y Costa Rica, sin secretos. La duración es el intervalo de evidencia y no se presenta como tiempo real de worker; finalización/worker no publicados se exportan null.

Overview enlaza estados a sus operaciones y muestra inventario/distribución persistida con alcance explícito. Dependencias degradadas, failed/uncertain y falta de evidencia reciente generan diagnóstico; un rechazo de admisión no se denomina fallo de Terraform. Workers & Queues conserva Sin instrumentación: no se derivan heartbeat ni colas de contenedores o filas de operaciones. El contrato pendiente está en IACP_INTEGRATION_REQUIREMENTS_060.md.

Todas las fechas de presentación usan America/Costa_Rica; almacenamiento/comunicaciones conservan UTC. Fechas sin zona se presentan como desconocidas/inválidas, nunca se reinterpretan como Costa Rica.

## Seguridad y conexiones

API Connections conserva su CRUD 0.5.0. Las credenciales de observación y lifecycle son distintas y se registran únicamente desde la GUI. AES-GCM/keyring externo, AAD histórico, SQLite propia, sesión local, RBAC, CSRF/Origin, TLS, allowlist exacta, DNS pinning, timeout, tamaño y redirects rechazados permanecen activos. No se devuelven valores ni cifrados al navegador. El token operator dedicado pertenece al tenant asociado, sin administración global. No existe introspección formal de scopes: no se afirma verificar lo que IACP no publica.

Viewer/Operator locales observan según RBAC existente; Administrator solicita las acciones de la integración y el servidor IACP conserva la decisión por recurso. Desconectar/deshabilitar impide uso; cambiar autorización/origen o eliminar conexión retira el acceso lifecycle. No se alteró el AAD de conexiones existentes. El reporte no incluye cuerpos, secretos ni stderr.

## Actualización preparada y rollback

[Compose empresarial completo](../deploy/portainer/docker-compose.yml), sin cambios: imagen por digest, una réplica, sin puertos publicados, SQLite local persistente, keyring readonly separado, proxy_network/websecure/TLS. [Compose local completo](../docker-compose.production.yml), actualizado a versión 0.6.0; no usarlo como Stack empresarial.

El operador conserva variables, SQLite, usuarios, sesiones, conexiones y keyring existentes. Antes de actualizar: backup coherente SQLite (incluido WAL mediante procedimiento consistente), respaldo separado del keyring, digest anterior y configuración. Verificar en destino red proxy_network, entrypoint websecure, certificado de iacoc.cyberfuel.com, almacenamiento y pull del registry. No ejecutar bootstrap/init-key sobre la instalación existente.

Cambiar únicamente IACOC_IMAGE_DIGEST por el digest publicado y actualizar la Stack manualmente en una ventana del operador. Este frente no modifica Portainer, Traefik, IACP ni Forgejo workflows. Validar HTTPS/login, persistencia, conexión, catálogo, inventario, RBAC, revocación y diagnósticos; probar infraestructura solo en MNG mediante IACP con KVM nuevas descartables.

SQLite conserva user_version=1 y añade crm_intents de forma aditiva. Rollback: digest 0.5.0 conocido `sha256:531f75b54d2729739e708044f5d23e0c773b7b2161cf626162c1e37c47f76daa`, conservando DB/keyring compatibles o restaurando ambos desde backups coherentes si fuera necesario. 0.5.0 ignora la tabla/settings adicionales. No borrar volúmenes ni regenerar claves. Antes de rollback, detener nuevas solicitudes y revisar intenciones inciertas: volver la GUI a una versión anterior no revierte infraestructura.

## Certificación

VALIDATION_060.md distingue pruebas locales, API/GUI real y ejecución de infraestructura. La creación real inicialmente incierta se completó mediante observación sobre el mismo UUID. Se verificaron inventario, invitado, apagado, encendido y DELETE. Reboot devolvió POWER_ACPI_TIMEOUT y se muestra como fallo, no como éxito. Las cuotas históricas están cerradas y no son una dependencia de IaCoC. La publicación de una imagen no acredita ni activa LIVE en la Stack empresarial ni certifica worker heartbeat o el ciclo real completo.
