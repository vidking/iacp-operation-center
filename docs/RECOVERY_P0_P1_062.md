# IaCoC 0.6.2 — recuperación funcional P0/P1

## Alcance

Esta iteración conserva SvelteKit, el BFF, SQLite, el keyring externo, las
sesiones, RBAC, el transporte seguro y el contrato OpenAPI existente. No se
modifican IACP, Proxmox, Golden Images, Terraform, Portainer, Jira ni recursos
de infraestructura.

## Correcciones P0

- `/crm` ya no ejecuta `portalData` desde el layout común. El catálogo se carga
  por su propio BFF y no queda bloqueado por Events, Operations u observabilidad.
- API Connections distingue `connected`, `degraded`, `unknown`, `stale`,
  `disconnected` y `unauthorized`.
- Un estado `unknown` de una dependencia no se presenta como caída confirmada.
- La recarga posterior a guardar una conexión tiene un límite de diez segundos
  y deja un error recuperable si SSR no finaliza.
- CRM comunica si falta la conexión reader/operator y muestra que la capability
  efectiva continúa siendo decisión de IACP cuando el contrato no permite
  introspección previa.
- Las imágenes comerciales solo pueden seleccionarse si IACP las publica como
  `certificada` o `habilitada`, están autorizadas, disponibles y son compatibles
  con el plan.

## Correcciones P1

- Overview consulta la ventana reciente de operaciones mediante la paginación
  técnica existente, en lugar de presentar la primera página histórica.
- Operations conserva `queriedAt` y `observedAt` separados.
- Events realiza polling incremental con `next_after`, deduplicación por
  `event_id`, timeout, backoff y pausa cuando el usuario explora el historial.
- El detalle de una operación deja de consultar después de la ventana máxima y
  muestra que el seguimiento se agotó; no interpreta ese estado como finalizado.
- La evidencia común conserva fuente, consulta, observación, frescura, estado,
  error y cursor de Events.
- Los campos OpenAPI publicados `queue_depth`, `network`, `result`, `job_id` y
  `network_observation` ya no se descartan por las validaciones runtime cuando
  llegan con la semántica del contrato.
- Inventario inicia en instancias no eliminadas; el historial requiere un filtro
  explícito.
- Se elevó la legibilidad de tablas, formularios, botones, metadata y estados
  sin cambiar la marca oscura/naranja ni incorporar animaciones pesadas.

## Instrumentación de workers

IaCoC muestra `queue_depth` únicamente si IACP lo publica en una respuesta real.
Worker liveness, heartbeat, asignación y profundidad global continúan sin
acreditarse mientras IACP no publique esos campos. No se consulta Docker socket,
Redis ni Proxmox.

## Validación

La validación local se ejecuta dentro de Docker. Las pruebas Chromium usan el
upstream sintético aislado de Playwright y no acreditan una sesión empresarial ni
una mutación real. La aceptación empresarial autenticada y el E2E de lifecycle
siguen requiriendo una ventana autorizada separada.

## Reversión

La iteración debe revertirse mediante el commit específico de recuperación,
después de revisar el diff. No se debe restaurar una imagen OCI ni actualizar la
Stack empresarial sin autorización de publicación.
