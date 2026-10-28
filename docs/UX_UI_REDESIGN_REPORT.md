# Informe de rediseño UX/UI de IaCoC

Fecha: 2026-10-28  
Rama: `feature/iacoc-ux-ui-overhaul`  
Base: `release/0.6.3-rc.10`, con `origin/main` consultado antes de iniciar

## Resultado

IaCoC conserva el runtime real, el alcance tenant-scoped y las guardas de
seguridad, pero ahora presenta un workspace de operaciones orientado a
evidencia: Overview prioriza actividad reciente, Operations tiene una búsqueda
universal, Events distingue feed vacío de cursor inválido, Workers separa
arquitectura conceptual de telemetría publicada e Incidents usa filtros
avanzados y detalle contextual. CRM y Usuarios mantienen sus contratos y
acciones existentes, con una jerarquía visual más clara.

La dirección implementada es la propuesta de
[`UX_UI_WIREFRAMES.md`](UX_UI_WIREFRAMES.md). La auditoría trazable, incluidos
los defectos originales y su corrección comprobable, está en
[`UX_UI_AUDIT.md`](UX_UI_AUDIT.md).

## Auditoría y metodología

La auditoría inicial se hizo sobre Chromium en 390, 768, 1024, 1366, 1440 y
1920 px, antes de modificar la aplicación. Midió overflow del documento,
`DOMContentLoaded`, tipografía visible, filas/paneles y geometría de las
superficies anchas. La evidencia inicial está en
[`docs/evidence/ux-ui/before/`](evidence/ux-ui/before/); la evidencia final,
incluyendo CRM y Usuarios, en [`docs/evidence/ux-ui/after/`](evidence/ux-ui/after/).

Se utilizaron realmente:

- `visualize` local para tokens, wireframes, semántica, foco, teclado,
  responsive y movimiento reducido.
- La metodología `anthropics/skills/frontend-design`, cuya licencia Apache-2.0
  e instrucciones fueron revisadas; no se copiaron archivos ni se instaló la
  skill en el host.
- `vercel-labs/agent-skills/web-design-guidelines` y su guía remota para
  accesibilidad práctica, formularios, tablas, overflow, URL state y estados de
  carga. No se incorporó código externo.
- WCAG 2.2 AA como lista de comprobación y Playwright/Chromium para interacción
  real, no solo presencia de elementos en el DOM.

## Decisiones visuales

Se mantuvieron el nombre Infrastructure as Code / Operation Center, el isotipo
hexagonal y la paleta graphite, azul eléctrico y naranja tecnológico. Se
consolidaron tokens de superficie, borde, texto, estado, tipografía y densidad
en `console.css`.

La interfaz usa jerarquía abierta: conectividad y resumen arriba, actividad o
timeline en el centro, y detalle en drawer/panel. Las tarjetas quedan para
comparar métricas; tablas, listas y arquitectura ya no se envuelven en capas
repetidas. La ilustración completa del orquestador queda reservada para Login;
Overview es data-first y conserva la marca con una firma compacta.

La escala activa deja 12 px como mínimo medido para texto visible en el
workspace, 14 px para información funcional/tablas y 28–32 px para títulos de
página. Los identificadores conservan monospace, `title`, lector de pantalla y
detalle completo para copiar/inspeccionar.

## Arquitectura de componentes y navegación

- `+layout.svelte` concentra shell, skip link, foco, sidebar scrollable, topbar,
  paleta y menú de perfil; el contenido principal tiene `main#main-content`.
- `ConsolePage.svelte` conserva la actualización activa y muestra una sola
  señal de conectividad con evidencia.
- `LiveEvidence.svelte` compone Overview, Workers y superficies de inventario
  sin inventar métricas. Overview lee una ventana reciente y el índice de
  instancias publicado; Workers muestra Control Plane → Queues → Workers →
  Operations → KVM/LXC como arquitectura conceptual.
- `Operations.svelte` y `OperationsTable.svelte` separan filtros, vista
  cronológica/por instancia, paginación y detalle. El historial sigue siendo
  global y paginado.
- `Events.svelte` y los grupos de eventos priorizan acción, recurso, VMID,
  estado y hora; el detalle expande IDs, actor, servicio y diagnóstico.
- `Incidents.svelte` concentra resumen, búsqueda, filtros avanzados,
  agrupación y drawer sin convertir fallos históricos en tickets activos.
- `crm/+page.svelte` y `CommercialCatalog.svelte` agrupan catálogo, inventario,
  energía, red, lifecycle y diagnóstico sin alterar las guardas destructivas.
- `administration/users/+page.svelte` aclara `falvarez` como identificador y
  `Freddy Alvarez` como nombre visible, con validación inmediata.

La navegación mantiene URLs y contexto: Operations acepta `q`, estado, acción,
agrupación, paginación y filtros exactos; Events e Incidents conservan búsqueda,
orden y agrupación; Overview enlaza a Operations; Events enlaza a la operación.

## Correcciones funcionales

1. La búsqueda principal de Operations acepta VMID (`30060`), nombre parcial,
   UUID, operación, nodo y código publicado. Un VMID ya no se envía a un
   campo/parámetro de UUID, por lo que no genera `INVALID_REQUEST` como flujo
   normal. Los identificadores exactos permanecen en “Más filtros”.
2. La tabla muestra recurso/VMID, acción humana con código original, resultado,
   última evidencia, duración humana y detalle. `status`, `normalized_status`,
   timestamps y códigos de IACP se preservan.
3. Events solo muestra advertencia cuando hay cursor inválido, retroceso o
   respuesta que evidencia estancamiento. Un feed válido sin eventos nuevos es
   un estado normal y discreto; la deduplicación permanece.
4. Workers no infiere liveness, heartbeat, profundidad de cola ni workers vivos
   desde operaciones persistidas. La edad activa se expresa como duración
   humana y conserva su significado: edad desde admisión.
5. Incidents mantiene la diferencia entre fallo histórico, señal activa,
   incierto y terminal; no agrega un sistema de tickets.
6. Los formularios reales de administración siguen pasando por servidor,
   Argon2id, sesiones y RBAC; solo se mejoraron etiquetas, ejemplos,
   validación y mensajes.
7. CRM conserva el lifecycle, la conexión Bearer única y las confirmaciones;
   la IP aparece solo cuando IACP la publica.

## Rendimiento percibido y responsive

La medición usa el upstream fixture determinista de `tests/browser/` dentro de
Docker; no es un SLA de IACP. “Filas” significa filas HTML de tabla: Overview
usa una lista semántica de 8 actividades, Events una timeline de 48 eventos y
Workers una composición arquitectónica, por eso sus valores son cero en esa
métrica.

| Ruta                 | Antes: overflow / min texto / mediana DCL | Después: overflow / min texto / mediana DCL |
| -------------------- | ----------------------------------------- | ------------------------------------------- |
| Overview             | 0/6 · 7 px · 110.9 ms                     | 0/6 · 12 px · 65.2 ms                       |
| Operations           | 0/6 · 7 px · 120.3 ms                     | 0/6 · 12 px · 91.0 ms                       |
| Events               | 0/6 · 7 px · 59.6 ms                      | 0/6 · 12 px · 62.1 ms                       |
| Workers & Queues     | 0/6 · 7 px · 58.1 ms                      | 0/6 · 12 px · 59.0 ms                       |
| Incidents & Recovery | 0/6 · 7 px · 68.8 ms                      | 0/6 · 12 px · 57.5 ms                       |
| CRM Simulator        | —                                         | 0/6 · 12 px · 34.8 ms                       |
| Usuarios y permisos  | —                                         | 0/6 · 12 px · 35.6 ms                       |

La última corrida que acompaña a `docs/evidence/ux-ui/after/metrics.json`
registró 65.2 ms para Overview, 91.0 ms para Operations, 62.1 ms para Events,
59.0 ms para Workers, 57.5 ms para Incidents, 34.8 ms para CRM y 35.6 ms para
Usuarios. Las diferencias entre corridas son variación normal del contenedor;
el dato de referencia es siempre el JSON junto a la evidencia.

El auditor no encontró overflow horizontal del documento en ninguna de las
seis anchuras. En escritorio, una tabla puede desplazarse dentro de su
superficie; en móvil Operations e Incidents cambian a filas tipo tarjeta. El
auditor también verificó foco y navegación existentes, `prefers-reduced-motion`,
labels y un skip link. No se ocultó carga lenta mediante animación.

La instrumentación actual mide navegación, no pretende medir el upstream real.
Long Tasks, hydration detallada y una atribución de renderizados de Svelte no
se pueden declarar con rigor a partir de esta fixture; quedan como trabajo de
observabilidad del entorno de ejecución, no como una métrica inventada.

## Evidencia visual y regresiones

- Baseline: [`overview-1440.png`](evidence/ux-ui/before/overview-1440.png),
  [`operations-1440.png`](evidence/ux-ui/before/operations-1440.png),
  [`events-1440.png`](evidence/ux-ui/before/events-1440.png),
  [`workers-1440.png`](evidence/ux-ui/before/workers-1440.png),
  [`incidents-1440.png`](evidence/ux-ui/before/incidents-1440.png).
- After: [`overview-1440.png`](evidence/ux-ui/after/overview-1440.png),
  [`operations-1440.png`](evidence/ux-ui/after/operations-1440.png),
  [`events-1440.png`](evidence/ux-ui/after/events-1440.png),
  [`workers-1440.png`](evidence/ux-ui/after/workers-1440.png),
  [`incidents-1440.png`](evidence/ux-ui/after/incidents-1440.png),
  [`crm-1440.png`](evidence/ux-ui/after/crm-1440.png) y
  [`users-1440.png`](evidence/ux-ui/after/users-1440.png).
- Cada fase conserva `metrics.json` y `trace.zip`.
- `tests/browser/ux-audit.spec.ts` usa `expect(page).toHaveScreenshot()` para
  las cinco rutas operativas a 1440 px. Los snapshots versionados están en
  [`tests/browser/ux-audit.spec.ts-snapshots/`](../tests/browser/ux-audit.spec.ts-snapshots/).
  Se ejecutó una generación controlada y una corrida posterior sin
  `--update-snapshots` que volvió a pasar.

## Verificaciones realizadas

| Verificación                            | Resultado                                                   |
| --------------------------------------- | ----------------------------------------------------------- |
| Vitest                                  | 17 archivos, 208 tests passed                               |
| Svelte check                            | 0 errores / 0 warnings                                      |
| Prettier lint                           | Passed dentro de Docker                                     |
| Producción build                        | Passed dentro de Docker                                     |
| RBAC/usuarios GUI                       | 6/6 passed                                                  |
| Auditoría responsive after              | 1/1 passed; 0/6 overflow en cada ruta y ancho               |
| Regresión visual `toHaveScreenshot`     | 5 snapshots, corrida sin update passed                      |
| Acceptance UX universal search          | Passed para VMID, nombre, UUID y código                     |
| Contrato CRM                            | 20/20 lifecycles en upstream fixture, sin mutaciones reales |
| Flujos API consumer y live actualizados | Passed tras ajustar selectores a la UI nueva                |

La corrida integral final de `./scripts/validate.sh` quedó en 36/36, incluidos
los 20 lifecycles y los flujos restantes. Dos aserciones heredadas del texto de
la UI anterior se corrigieron (`Buscar en todo IACP`, `Agrupar eventos`, detalle
de operación y estado de Workers) antes de ese pase definitivo.

## Límites reales de IACP y seguridad

- No se probaron mutaciones reales de KVM ni se tocó IACP, Proxmox, Terraform,
  Traefik, Portainer o infraestructura empresarial.
- Los datos de trabajadores, heartbeat, queue depth e IP solo se muestran si
  están publicados por IACP. La arquitectura conceptual no acredita procesos.
- Los tests usan fixtures únicamente en `tests/browser/`; el runtime no tiene
  selección MOCK/DEMO ni fallback sintético.
- No se usaron credenciales empresariales ni se activó LIVE fuera del upstream
  de pruebas. Una imagen o validación local no certifica conexión empresarial.
- La persistencia, keyring, RBAC, allowlist, CSRF, origen y contratos existentes
  no se cambiaron para maquillar resultados.

## Problemas residuales documentados

El tiempo de `DOMContentLoaded` es una medición local del harness; para una
decisión de SLO todavía hace falta una corrida autorizada con latencia real del
upstream y métricas de red/Long Tasks del destino. La visualización de Workers
seguirá mostrando límites cuando IACP no publique telemetría; eso es una
restricción de evidencia, no un fallo que la UI deba rellenar. La publicación de
la rama tampoco actualiza la Stack empresarial ni habilita LIVE.
