# IaCoC · Foundation 001

Infrastructure as Code Operations Center de Cyberfuel. Portal visual en SvelteKit 3, Svelte 5, TypeScript, Tailwind CSS 4 y Lucide. Apariencia oscura, navegación responsive y experiencias interactivas con fixtures **DEMO**.

Esta iteración es exclusivamente visual: las rutas siempre cargan MOCK. No se consulta IACP, no se envían pedidos, no hay recuperación, IA conectada, CI/CD ni despliegue empresarial.

## Omarchy: solo Docker

Requisitos del host: Git, Docker Engine y Docker Compose. **No instalar ni ejecutar Node, npm, npx, Vite ni herramientas del proyecto en Omarchy.** Los siguientes comandos ejecutan esas herramientas dentro de contenedores.

```sh
cp .env.example .env
# Revisar LOCAL_UID / LOCAL_GID con id -u e id -g (por defecto 1000:1000).
docker compose up -d --build
```

Abrir **http://localhost:5173**. El puerto solo se publica en loopback. El código permanece editable desde el host; Vite usa polling a 250 ms y HMR. `node_modules`, caché Svelte, build y resultados se montan en volúmenes Docker independientes: no se instalan dependencias en el host.

```sh
docker compose logs -f iacoc-web
docker compose ps
docker compose stop       # parada controlada, conserva datos de desarrollo
docker compose start
docker compose down       # elimina contenedor/red de este proyecto, conserva volúmenes
```

La aplicación no necesita persistencia de negocio: los datos son fixtures y los formularios solo preparan una vista previa en memoria.

## Cambiar dependencias

Editar `package.json` en el host y actualizar el lockfile **en Docker**:

```sh
docker compose stop iacoc-web
docker compose run --rm --no-deps iacoc-web npm install --package-lock-only --ignore-scripts
docker compose build iacoc-web
docker compose run --rm --no-deps iacoc-web npm ci --ignore-scripts
docker compose up -d iacoc-web
```

Si cambia solo `package-lock.json`, omitir el comando de actualización del lockfile. Reconstruir la imagen no reemplaza un volumen `node_modules` existente: ejecutar siempre `npm ci` dentro del servicio después de cambiar dependencias. No ejecutar instalaciones mientras Vite o las pruebas estén usando ese volumen.

La imagen crea los directorios de volúmenes con propietario 1000:1000. Para otro UID/GID, ajustar `.env` y ejecutar una vez, con el servicio detenido, `docker compose run --rm --no-deps --user 0 iacoc-web sh -c 'chown -R 1234:1234 /app/node_modules /app/.svelte-kit /app/.artifacts /app/test-results'`, sustituyendo ambos números por los reales. Solo se modifican volúmenes de artefactos. El servicio normal permanece sin privilegios.

## Validación desde contenedores

```sh
docker compose exec -T iacoc-web npm run check
docker compose exec -T iacoc-web npm run lint
docker compose exec -T iacoc-web npm test
docker compose exec -T iacoc-web npm run format
./scripts/validate.sh
```

`lint` comprueba formato con Prettier; `check` hace análisis de Svelte/TypeScript. El script construye el target `test` con Chromium y sus bibliotecas, y ejecuta lint, tipos, pruebas de datos, build y Playwright enteramente en Docker. Los resultados y capturas se conservan en el volumen `test_results`. La primera construcción descarga el navegador y requiere Internet; no instala herramientas en Omarchy.

## Producción local, sin bind mounts

```sh
docker compose -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.production.yml ps
curl http://localhost:3000/health
docker compose -f docker-compose.production.yml logs -f
docker compose -f docker-compose.production.yml down
```

La imagen `iacoc:0.1.0-local` usa `adapter-node`, usuario `node`, dependencias de producción y healthcheck `/health`. Dev, test y producción usan una base Node 22 fijada por digest. El proceso Node envía logs a stdout/stderr. Compose de producción limita CPU, memoria, PIDs y rotación de logs; filesystem readonly, tmpfs y parada de 20 s. No incluye volúmenes de código, secretos ni credenciales. El origen se deriva de la petición: el reverse proxy futuro debe validar Host y el esquema; no se confía automáticamente en cabeceras reenviadas.

No se asumen dominios, redes, certificados ni labels Traefik. No hay manifiestos empresariales ni workflows Forgejo. El target `production` es reutilizable cuando se acuerde esa integración.

## Experiencia del portal

| Sección                           | Interacción                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| Overview `/`                      | Indicadores DEMO, gráfico con ventanas 6/12/24 h, distribución enlazada, actividad y alertas |
| Operations `/operations`          | Búsqueda, filtros, orden, drawer accesible con timeline, estados y correlación               |
| Events `/events`                  | Timeline filtrable, detalle expandible y navegación por correlación                          |
| Workers & Queues `/workers`       | Workers y colas sintéticos, carga ilustrativa, filtros y actividad                           |
| Incidents & Recovery `/incidents` | Severidad, historial, diagnóstico editorial y asistente conceptual sin IA conectada          |
| CRM Simulator `/crm`              | Dashboard, clientes ficticios, catálogo KVM, vista previa de VM e historial estático         |

Cada sección permite simular carga, error y vacío. La búsqueda global navega a Operations; `Ctrl/Cmd+K` enfoca el campo en escritorio. Notificaciones y actualización manual son locales. El drawer soporta cierre con Escape y retorno de foco. Las animaciones respetan movimiento reducido.

Los workers y colas son escenarios visuales separados de los contratos reales: liveness real `unknown`, profundidad real `not-disclosed`. La fecha de evidencia permanece fija y se indica `stale`; no se renueva artificialmente al actualizar.

Ver [arquitectura y estructura](docs/FRONTEND.md), [seguridad](docs/SECURITY.md), [integración CRM](docs/CRM_INTEGRATION.md) y [evidencias de validación](docs/VALIDATION.md).
