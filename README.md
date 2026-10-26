# IaCoC 0.6.0

Operations Center de Cyberfuel: SvelteKit, TypeScript, Tailwind y Lucide. Conserva la GUI oscura aprobada y el CRUD de conexiones de 0.4.1. Consulta exclusivamente IACP mediante un adaptador del servidor. Sin conexión válida muestra **IACP desconectado**. CRM Simulator consume perfiles, inventario y lifecycle reales de IACP; no hay fuentes sintéticas ni selector de modos en producción.

Todas las dependencias, servidores, pruebas, formateo y builds se ejecutan dentro de Docker. Omarchy solo requiere Git, Docker y Compose. No ejecutar Node/npm/npx/Vite en el host.

## Desarrollo

```sh
cp .env.example .env
# Ajustar LOCAL_UID/LOCAL_GID si no son 1000:1000.
docker compose up -d --build
# Solo con el almacén de usuarios vacío; contraseña introducida sin eco.
docker compose exec iacoc-web node --experimental-strip-types scripts/bootstrap-admin.mjs
# Inicializar claves solo para un entorno NUEVO; nunca reemplazar el keyring empresarial.
docker compose exec -T iacoc-web node --experimental-strip-types scripts/security-admin.mjs init-key
```

Abrir http://localhost:5173/login. No hay credenciales predeterminadas. El bootstrap solicita usuario, espacio local y contraseña de al menos 14 caracteres. El espacio local no es el tenant remoto de IACP. Gestión de usuarios existente: [seguridad](docs/SECURITY.md).

Código en bind mount; node_modules, cachés, SQLite y keyring en volúmenes separados. HMR mediante polling. Las cookies son Secure, HttpOnly y SameSite; la excepción HTTP de desarrollo admite solamente localhost/127.0.0.1, nunca un dominio empresarial.

```sh
docker compose logs -f iacoc-web
docker compose stop
docker compose start
docker compose down  # conserva los volúmenes; no añadir --volumes para datos propios
```

Si cambia package-lock.json, detener el servicio, reconstruir la imagen y ejecutar `docker compose run --rm --no-deps iacoc-web npm ci --ignore-scripts` antes de arrancar. El volumen de dependencias existente no se reemplaza al reconstruir. Para actualizar el lockfile usar `docker compose run --rm --no-deps iacoc-web npm install --package-lock-only --ignore-scripts`. No instalar mientras otro proceso use ese volumen.

## Validación local

```sh
./scripts/validate.sh
./scripts/validate-persistence.sh
./scripts/check-hmr.sh  # comprobación opcional de desarrollo
```

`validate.sh` comprueba Docker/Compose, formato Prettier, tipos Svelte/TypeScript, unitarias, build, ausencia de fuentes sintéticas en artefactos y Chromium. Persistencia utiliza exclusivamente un proyecto desechable `iacoc-security-validation`, puerto local 3000 y secretos aleatorios de prueba. No utilizar ese nombre para datos propios. Los fixtures están aislados en tests y scripts de prueba y no se copian al runtime final.

## Operación y publicación

Pantallas: Overview, Operations, Events, Workers & Queues, Incidents & Recovery CRM Simulator y Administration → API Connections. Solo datos autenticados: observabilidad, operaciones, eventos, perfiles, inventario, detalles y readiness. Las métricas sin contrato aparecen como No disponible o Sin instrumentación. CRM añade creación, energía, eliminación autorizada y reconciliación por observación; IACP autoriza y ejecuta cada operación.

Un Administrator registra una clave de acceso de lectura una vez, o reutiliza una conexión existente. **Conectar** valida autenticación, alcance y contratos antes de seleccionar la conexión. La misma pantalla permite probar, editar, rotar, desconectar, eliminar e inspeccionar historial. Lifecycle utiliza otra credencial operator del mismo tenant, registrada desde esa GUI; no se reutiliza automáticamente el reader. Viewer y Operator locales observan; el servidor aplica RBAC independientemente de los botones.

La allowlist se administra fuera de la aplicación. El servidor cifra claves AES-GCM con keyring separado, verifica TLS y DNS contra IP exactas, rechaza redirects y solo permite rutas y métodos IACP explícitos. Ante 401/403 o cambio de alcance suspende lecturas y elimina snapshots; ante cortes temporales solo puede mostrar evidencia auténtica anterior, marcada explícitamente.

Guía vigente: [release 0.6.0, variables, migración, actualización y rollback](docs/PRODUCTION_060.md). [Compose empresarial completo](deploy/portainer/docker-compose.yml). [Publicación OCI desde Docker](docs/OCI_RELEASE.md). Los documentos de iteraciones anteriores son históricos y no describen selección de fuentes vigente.

La Stack empresarial consume una imagen por digest, conserva SQLite y keyring y se comunica con Traefik por proxy_network/websecure/puerto interno 3000. No publica puertos ni crea un Traefik. Este repositorio no contiene pipelines y esta entrega no modifica Portainer, IACP ni su infraestructura.
