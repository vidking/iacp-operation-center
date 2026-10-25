# IaCoC · Iteración 002

Operations Center de Cyberfuel en SvelteKit 3, TypeScript, Tailwind y Lucide. Conserva el diseño aprobado y añade autenticación local real, Administration → API Connections y observación LIVE de solo lectura por tenant. Dominio previsto: **https://iacoc.cyberfuel.com**.

Todas las instalaciones, servidores, formateo, pruebas y builds se ejecutan en Docker. El host Omarchy solo necesita Git, Docker y Compose. No ejecutar Node/npm/npx/Vite en el host.

## Desarrollo y primer administrador

```sh
cp .env.example .env
# Ajustar LOCAL_UID/LOCAL_GID si no son 1000:1000.
docker compose up -d --build
# Solo si el almacén de usuarios está vacío; contraseña introducida sin eco.
docker compose exec iacoc-web node --experimental-strip-types scripts/bootstrap-admin.mjs
# Clave de conexiones: volumen separado, sin imprimir material criptográfico.
docker compose exec -T iacoc-web node --experimental-strip-types scripts/security-admin.mjs init-key
```

Abrir **http://localhost:5173/login**. No existen usuarios ni contraseñas predeterminados, tampoco en MOCK. El bootstrap pide un nombre de usuario y tenant reales elegidos por el operador; requiere contraseña de al menos 14 caracteres. Solo se permite con una tabla de usuarios vacía. Otros usuarios/roles se gestionan con la CLI autorizada descrita en [SECURITY.md](docs/SECURITY.md).

Las cookies siempre son Secure, HttpOnly y SameSite. Para desarrollo se admite HTTP exclusivamente con `LOCAL_HTTP=true` y origen canónico localhost/127.0.0.1. Chromium acepta las cookies Secure en este contexto de loopback; publicación exige HTTPS. No usar esta excepción en un hostname empresarial.

Código editable en bind mount; dependencias, caché, build y resultados en volúmenes Docker. HMR usa polling a 250 ms. Configuración/sesiones propias en el volumen `configuration`; claves en `local_keys`, separado de SQLite y de Git.

```sh
docker compose logs -f iacoc-web
docker compose stop
docker compose start
docker compose down  # conserva volúmenes; no usar --volumes para un almacén que quieras conservar
```

Al cambiar package-lock.json: detener el servicio, reconstruir y ejecutar `docker compose run --rm --no-deps iacoc-web npm ci --ignore-scripts` antes de arrancar. Un volumen node_modules existente no se reemplaza al reconstruir. Para actualizar el lockfile desde package.json, usar `docker compose run --rm --no-deps iacoc-web npm install --package-lock-only --ignore-scripts`. No instalar mientras otro proceso use ese volumen.

La imagen usa UID/GID 1000. Para otros IDs, ajustar `.env` y darles propiedad de los volúmenes de artefactos, configuración y claves desde un contenedor de mantenimiento. No cambiar permisos de secretos para hacerlos legibles por todo el mundo. Ver [SECURITY.md](docs/SECURITY.md).

## Validación enteramente en Docker

```sh
./scripts/validate.sh               # Docker check, Compose, lint, tipos, Vitest, build y Playwright
./scripts/check-hmr.sh              # HMR sobre la página pública de login
./scripts/validate-persistence.sh   # runtime propio desechable; requiere puerto 3000 libre
```

El perfil test incluye Chromium y OpenSSL para el certificado sintético del proxy de laboratorio. Sus usuarios, claves, sesiones y certificados son aleatorios y se almacenan en volúmenes de prueba ignorados por Git. No usa credenciales empresariales. El script de persistencia elimina solo su proyecto `iacoc-security-validation` y sus volúmenes al finalizar; no usar ese nombre para datos propios.

Comprobaciones individuales: `docker compose exec -T iacoc-web npm run lint`, `npm run check` o `npm test`, siempre con el prefijo Docker. `lint` es verificación de formato Prettier; Svelte/TypeScript aporta el análisis estático. El informe inicial está en [VALIDATION.md](docs/VALIDATION.md) y la revalidación actual en [REVALIDATION_002.md](docs/REVALIDATION_002.md).

## MOCK y LIVE

MOCK es el valor inicial y conserva las seis pantallas: Overview, Operations, Events, Workers & Queues, Incidents & Recovery y CRM Simulator. Los formularios CRM y el asistente conceptual siguen siendo DEMO, sin ejecución, IA conectada ni lógica comercial.

LIVE requiere que un operador de plataforma configure destinos permitidos y habilite `LIVE_ENABLED=true`. Después, un Administrator de ese tenant crea la conexión en `/administration/connections`, introduce una credencial reader, ejecuta Test Connection y activa LIVE dentro de los cinco minutos posteriores a una validación correcta. La activación es por tenant. Viewer y Operator solo leen evidencia; no administran conexiones ni ejecutan infraestructura.

La política externa tiene esta forma **ilustrativa**, no es un destino empresarial confirmado:

```json
[{ "origin": "https://iacp-approved.example", "addresses": ["10.40.50.60"] }]
```

`IACP_ALLOWED_TARGETS` es un JSON administrado fuera de SQLite. Deben confirmarse origen e IP exactas con el responsable de IACP. No admite comodines, rutas, redirecciones, metadata, loopback ni cambios DNS fuera de las IP autorizadas. Por defecto es `[]` y no permite conexiones.

Las credenciales se cifran con AES-256-GCM y no se devuelven al navegador. Rotarlas o editar una conexión invalida la validación y las evidencias cacheadas. LIVE falla cerrado sin configuración, clave o validación; no cambia automáticamente a MOCK. Ante un fallo de lectura puede presentar la última evidencia del mismo tenant/conexión/versión como stale. Workers/heartbeat permanecen unknown y las profundidades de colas no se infieren. CRM sigue separado y rotulado DEMO.

## Producción y Traefik

`docker-compose.production.yml` permite comprobar producción **local** en loopback, con volúmenes propios y sin código montado. `deploy/portainer/docker-compose.yml` es la Stack empresarial independiente: imagen preconstruida por digest, sin build, sin ports, red externa `proxy_network`, router Host(`iacoc.cyberfuel.com`), entrypoint `websecure`, TLS y servicio interno 3000. No crea Traefik ni configura certresolver.

El arranque `scripts/start-server.mjs` usa el handler de adapter-node, fija el esquema desde PUBLIC_ORIGIN, ignora cabeceras de host/IP reenviadas y exige `x-forwarded-proto: https` con `TRUST_PROXY=true` en el modo HTTPS. El proxy debe preservar Host y sobrescribir la cabecera de protocolo. La frontera de confianza también requiere aislamiento de red; una cabecera sola no autentica a un proxy.

Publicación, variables, bootstrap, secretos, backup/rollback y requisitos pendientes: [PUBLISHING.md](docs/PUBLISHING.md). **No se desplegó ni se probó Traefik/Portainer empresarial; no se publicó imagen OCI ni se creó CI/CD.** El commit/push de esta iteración está autorizado únicamente después de pasar las comprobaciones.

Más detalles: [arquitectura](docs/ARCHITECTURE.md), [seguridad](docs/SECURITY.md), [frontend](docs/FRONTEND.md), [CRM](docs/CRM_INTEGRATION.md).
