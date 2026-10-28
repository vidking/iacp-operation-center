# IaCoC 0.6.3-rc.11 — publicación del rediseño UX/UI

## Estado de la entrega

La versión `0.6.3-rc.11` queda publicada en Forgejo Container Registry y la
rama de release queda lista para revisión. Portainer no fue actualizado. La
aceptación empresarial completa permanece pendiente de que el operador pruebe
esta imagen por digest en la Stack empresarial.

- Merge de origen confirmado en `origin/main`:
  `90bcae23282e9a29dcc2f3975384f5064a5dfdc6` (PR #9).
- Rama: `release/0.6.3-rc.11`.
- Tag Git: `v0.6.3-rc.11`.
- Revisión fuente usada para construir OCI:
  `230db40690c8c875d9fc1e3a4c1210f2f61d9384`.
- Versión en `package.json`, `package-lock.json`, Docker y Compose local:
  `0.6.3-rc.11`.
- Plataforma: `linux/amd64`.
- Imagen: `scm.cyberfuel.com/cyberfuel/iacp-operation-center:0.6.3-rc.11`.
- Digest OCI del índice publicado:
  `sha256:d953e8d4ef1c65518d6fa575ccd94166684c571c14a4861014d30f0d0cfc66f8`.
- Manifiesto de imagen `linux/amd64`:
  `sha256:971deecbc8c63fcbdd4da4b4f317a3c9e810aca9e1e334a25d9ea299dae0708a`.
- Valor para la Stack empresarial:
  `IACOC_IMAGE_DIGEST=d953e8d4ef1c65518d6fa575ccd94166684c571c14a4861014d30f0d0cfc66f8`.

El cambio de aplicación es el rediseño UX/UI ya integrado en PR #9, más la
alineación de la versión visible y una corrección exclusiva del fixture de
aceptación UUID. No se introdujeron funciones nuevas, cambios de arquitectura,
contratos IACP, fuentes sintéticas ni mutaciones empresariales.

## QA ejecutado

Todos los comandos de Node, Svelte, Playwright, formatters y builds se
ejecutaron dentro de Docker.

- `./scripts/validate.sh`: PASS.
  - Compose/manifiesto Portainer: imagen inmutable, labels Traefik,
    `proxy_network`, sin puertos publicados, persistencia y secreto externo.
  - Prettier: PASS.
  - Svelte check: 0 errores, 0 warnings.
  - Vitest: 17 archivos, 208 tests passed.
  - Build de producción y `verify-production`: PASS, 138 archivos compilados.
  - Chromium/Playwright: 36/36 passed en 11.3 minutos; incluye 20 ciclos
    contractuales CRM, creación y login independiente de usuario, RBAC,
    búsqueda universal, paginación, Events, Incidents, Workers, seguridad y
    responsive.
- `./scripts/validate-persistence.sh`: PASS.
  - SQLite schema v1, WAL/SHM y recreación del contenedor.
  - Sesiones, usuarios, auditoría, conexión cifrada y diagnósticos.
  - Intención CRM incierta y credencial cifrada legada sobrevivieron la
    recreación.
- Auditoría visual final Playwright sobre el artefacto de producción servido
  desde Docker: PASS. Se midieron `390`, `768`, `1024`, `1366`, `1440` y
  `1920` px; `documentScrollWidth` coincidió con el viewport en las rutas
  auditadas y no se regeneraron automáticamente los snapshots de referencia.
- Evidencia versionada:
  [`docs/evidence/ux-ui/after/`](evidence/ux-ui/after/), incluyendo Login,
  Conectores, Overview, Operations, Events, Workers, Incidents, CRM y Usuarios,
  `metrics.json` y `trace.zip`. Las capturas principales fueron revisadas en
  390 y 1440 px; las seis anchuras quedan verificadas en las métricas y la
  traza.
- Smoke test del OCI local aislado: `GET /health` devolvió HTTP 200 con
  `{"status":"ok","application":"iacoc"}`.
- Publicación OCI: `push`, `imagetools inspect` y `pull --platform
linux/amd64` por digest: PASS. Se verificaron arquitectura, OS, versión y
  revisión OCI.

Los ciclos CRM y la auditoría UX usan el fixture aislado de `tests/browser/`.
No se ejecutaron lecturas contra IACP real en esta entrega por no existir una
sesión empresarial autorizada disponible en la ejecución; no se usaron
secretos empresariales ni se habilitó LIVE. Los tiempos `DOMContentLoaded` de
`metrics.json` son del contenedor de pruebas, no un SLA de producción.

## Resultado funcional observado

- Operations acepta `30060`, nombre parcial, UUID, operación, nodo y código en
  el buscador universal; no produce `INVALID_REQUEST` por usar un VMID.
- Overview muestra actividad reciente limitada y enlaza a Operations sin
  descargar el historial completo.
- Events permite localizar una instancia, expandir evidencia y navegar a la
  operación; un feed válido sin novedades no se presenta como pérdida de
  sincronización.
- Incidents conserva filtros, agrupación, código IACP y diagnóstico lateral sin
  convertir todo fallo histórico en incidente activo.
- Workers distingue arquitectura conceptual de telemetría no publicada y no
  infiere heartbeat, queue depth o workers vivos.
- Usuarios diferencia `falvarez` como identificador de `Freddy Alvarez` como
  nombre visible; los flujos de GUI, sesiones independientes y roles pasaron.
- CRM conserva el lifecycle, las guardas destructivas, la conexión Bearer única
  y la regla de mostrar IP únicamente cuando IACP la publica.

## Procedimiento de actualización

La actualización debe ejecutarla el operador de la Stack, sin cambiar la
configuración empresarial:

1. Registrar el digest realmente desplegado antes del cambio; no asumir que es
   rc.10 ni usar el tag como rollback.
2. Tomar un respaldo coherente de SQLite, incluyendo WAL/SHM cuando existan.
3. Mantener el keyring externo, conexiones Bearer cifradas, sesiones,
   auditoría, volúmenes, `proxy_network`, `websecure`, TLS y labels Traefik.
4. Cambiar únicamente `IACOC_IMAGE_DIGEST` al valor publicado arriba, sin el
   prefijo `sha256:`. No ejecutar `init-key`, `bootstrap-admin`, rotación de
   claves ni eliminar volúmenes.
5. Recrear la Stack según el procedimiento autorizado y verificar health,
   login en dos contextos, Viewer/Operator/Administrator, persistencia,
   navegación y lecturas autorizadas.
6. Probar el pull por digest desde el host de Portainer y revisar logs sin
   secretos. Esta entrega no actualiza Portainer automáticamente.

## Rollback

Si la verificación empresarial falla, detener nuevas acciones desde la GUI,
conservar auditoría e intenciones inciertas y restaurar el digest que se
registró en el paso 1. Mantener los mismos volúmenes, keyring, variables, red y
políticas. El rollback de la imagen no revierte comandos ya enviados a IACP.

La imagen publicada de rc.10 (`sha256:9a150e87e143676d6059f3612bb2f6e228e58033e197494dc41f934e87660297`)
es solo una referencia histórica del repositorio; el digest vivo debe
confirmarse en Portainer antes de actualizar y usarse como rollback real.

## Límites y aceptación

No se modificaron IACP, Proxmox, Terraform, Traefik, Portainer ni máquinas
empresariales. La publicación OCI y las pruebas locales no acreditan una
conexión empresarial. No declarar aceptación final hasta ejecutar en Portainer
el pull por digest y el smoke test de solo lectura documentado por el operador.
