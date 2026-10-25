# Diseño y arquitectura frontend

Actualización Iteración 002: el diseño de las seis secciones se conserva, ahora detrás de login. Se añade Administration → API Connections para Administrator y una pantalla de login con el mismo lenguaje visual. MOCK conserva las interacciones descritas; LIVE reemplaza fixtures de diagnóstico por evidencia autorizada y estados unknown/stale. Ver ARCHITECTURE.md y SECURITY.md para los límites vigentes.

La dirección visual usa grafito, superficies de contraste moderado y un acento naranja propio de Cyberfuel. Tipografía de sistema sin fuentes remotas; Lucide aporta una iconografía consistente. Tailwind 4 ofrece utilidades de composición y el plugin Vite; `styles/console.css` contiene tokens y componentes visuales propios. No se usó una plantilla de dashboard.

## Secciones e interacciones

- Overview: presentación del entorno y topología conceptual, contadores de muestra, serie sintética con ventanas 6/12/24 h y valores accesibles por teclado, distribución calculada desde fixtures, operaciones y eventos enlazados, alertas y colas DEMO.
- Operations: pestañas, búsqueda, estado normalizado, tipo, orden por ID y drawer nativo `dialog` con metadatos, estados, timeline y evidencia. La correlación navega a Events. El código de error se presenta sin inferir una causa raíz.
- Events: búsqueda y estado, filtro por operación/correlación y detalles nativos `details` con actor, tenant, timestamp y event_id.
- Workers & Queues: escenarios sintéticos de actividad, duración y carga; filtros por worker/servicio/estado y ocupación ilustrativa de colas. Las métricas reales siguen unknown/no divulgadas.
- Incidents & Recovery: selección, severidad, historial y enlaces a evidencia. Las recomendaciones son editoriales. El asistente muestra texto fijo identificado como concepto; no usa un modelo ni tiene acciones de recuperación.
- CRM: dashboard, clientes .example, catálogo KVM, selección y validación básica de campos, resumen de solicitud y vista previa local. No implementa lógica comercial, cuotas, pedidos mutables o solicitudes de infraestructura.

El layout aporta navegación agrupada, entorno Sandbox/MOCK, búsqueda global, atajo Ctrl/Cmd+K, notificaciones y ayuda local. Los controles de demostración muestran estados ready/loading/error/empty sin red. Actualizar restaura la muestra tras una transición visual y conserva su fecha original. La clasificación stale se calcula al cargar una vista; no implica telemetría viva.

## Separación de responsabilidades

| Área                     | Responsabilidad                                                       |
| ------------------------ | --------------------------------------------------------------------- |
| `routes/`                | Enrutamiento de las seis secciones y carga local MOCK; health propio  |
| `components/sections/`   | Experiencias Overview, Operations, Events, Workers, Incidents y CRM   |
| `components/ui/`         | Estados semánticos, métricas y estados vacíos/carga/error             |
| `components/charts/`     | SVG de actividad y distribución de estados sin servicios externos     |
| `components/operations/` | Drawer, metadatos y timeline de operación                             |
| `types/`                 | Proyecciones del contrato y modelos de presentación                   |
| `stores/`                | Selección, notificaciones y estado de demostración; sin persistencia  |
| `mocks/`                 | Escenarios visuales de workers, colas, incidentes y CRM               |
| `server/data/mock.ts`    | Fixtures de operaciones/eventos del contrato, sin conectividad        |
| `api/`                   | Puerto de integración futura, sin cliente HTTP conectado              |
| `server/data/iacp.ts`    | Adaptador previo desconectado, solo bajo pruebas unitarias            |
| `styles/`                | Apariencia y comportamiento responsive, además de utilidades Tailwind |

Se usa HTML semántico, nombres accesibles, foco visible, `dialog` modal con Escape y retorno de foco, `details` accesible, controles de gráfico con teclado, `role=status` y movimiento reducido. El menú móvil tiene backdrop y cierre con Escape. No se afirma conformidad WCAG certificada; queda pendiente auditoría formal.

## Docker y reproducibilidad

`Dockerfile` incluye targets `dependencies`, `development`, `test`, `build` y `production`. Node 22 está fijado por digest; `npm ci` usa el lockfile. Los directorios de build se escriben en `.artifacts/build`, un subdirectorio del volumen, porque adapter-node elimina y regenera su salida: montar directamente `build/` impediría eliminar su raíz.

`docker-compose.yml` usa bind mount para código y volúmenes para dependencias, caché, build y resultados. El perfil test contiene Chromium y sus librerías, aislado del runtime. La instalación de navegador se almacena en una capa previa al código fuente. `docker-compose.production.yml` es solo para validación local; no monta código ni presupone redes empresariales.

Para acreditar HMR de forma reproducible, después de construir el target test: `./scripts/check-hmr.sh`. El script abre Chromium dentro del contenedor, añade temporalmente una variable CSS desde el host y verifica su llegada sin recarga. Restaura el archivo al terminar. No editar ese CSS durante la comprobación.

Para extraer capturas de las pruebas sin instalar nada en el host:

```sh
docker compose --profile test run --rm --no-deps --entrypoint sh iacoc-tests -c 'ls -l test-results/*.png'
# Copiar desde un contenedor temporal detenido o desde el volumen Docker mediante docker cp.
```

## Inventario completo de archivos versionables

```text
.dockerignore
.env.example
.gitignore
.prettierignore
.prettierrc.json
AGENTS.md
Dockerfile
README.md
deploy/portainer/docker-compose.yml
docker-compose.production.yml
docker-compose.yml
docs/ARCHITECTURE.md
docs/CRM_INTEGRATION.md
docs/FRONTEND.md
docs/PUBLISHING.md
docs/SECURITY.md
docs/VALIDATION.md
docs/contracts/readonly-openapi-excerpt.json
docs/previews/overview-desktop.png
docs/previews/overview-mobile.png
package-lock.json
package.json
playwright.config.ts
scripts/bootstrap-admin.mjs
scripts/check-hmr.mjs
scripts/check-hmr.sh
scripts/security-admin.mjs
scripts/start-server.mjs
scripts/test-proxy.mjs
scripts/test-server.mjs
scripts/validate-persistence.sh
scripts/validate-portainer.sh
scripts/validate.sh
scripts/verify-persistence.mjs
src/app.css
src/app.d.ts
src/app.html
src/env.ts
src/hooks.server.ts
src/lib/api/observation.ts
src/lib/components/Badge.svelte
src/lib/components/ConsolePage.svelte
src/lib/components/OperationsTable.svelte
src/lib/components/charts/ActivityChart.svelte
src/lib/components/charts/StatusDistribution.svelte
src/lib/components/operations/OperationDetail.svelte
src/lib/components/sections/Crm.svelte
src/lib/components/sections/Events.svelte
src/lib/components/sections/Incidents.svelte
src/lib/components/sections/LiveEvidence.svelte
src/lib/components/sections/Operations.svelte
src/lib/components/sections/Overview.svelte
src/lib/components/sections/Workers.svelte
src/lib/components/ui/Badge.svelte
src/lib/components/ui/EmptyState.svelte
src/lib/components/ui/StatCard.svelte
src/lib/mocks/experience.ts
src/lib/server/connections/service.ts
src/lib/server/connections/source.ts
src/lib/server/connections/transport.ts
src/lib/server/data/contracts.ts
src/lib/server/data/iacp.ts
src/lib/server/data/mock.ts
src/lib/server/security/auth.ts
src/lib/server/security/config.ts
src/lib/server/security/crypto.ts
src/lib/server/security/database.ts
src/lib/server/security/http.ts
src/lib/stores/portal.ts
src/lib/styles/console.css
src/lib/types/observation.ts
src/lib/types/portal.ts
src/lib/types/security.ts
src/routes/+layout.server.ts
src/routes/+layout.svelte
src/routes/+page.svelte
src/routes/[section]/+page.svelte
src/routes/[section]/+page.ts
src/routes/administration/connections/+page.server.ts
src/routes/administration/connections/+page.svelte
src/routes/api/admin/connections/+server.ts
src/routes/api/admin/connections/[id]/+server.ts
src/routes/api/admin/connections/[id]/history/+server.ts
src/routes/api/admin/mode/+server.ts
src/routes/api/observations/[resource]/+server.ts
src/routes/api/observations/operations/[id]/+server.ts
src/routes/health/+server.ts
src/routes/login/+page.server.ts
src/routes/login/+page.svelte
src/routes/logout/+server.ts
tests/browser/fixtures.ts
tests/browser/navigation.spec.ts
tests/browser/security.spec.ts
tests/cli.test.ts
tests/data.test.ts
tests/security.test.ts
tests/setup.ts
tests/transport.test.ts
tsconfig.json
vite.config.ts
```
