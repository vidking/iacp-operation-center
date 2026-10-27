# IaCoC 0.6.3-rc.3 — publicación controlada

## Artefactos

- Commits funcionales incluidos: `b5f0736` y `e5151b4`.
- Commit de versión publicado: `16bfa7d1df922ae832a4304241bba9d52e7f9aec`.
- Tag Git: `v0.6.3-rc.3`.
- Plataforma OCI: `linux/amd64`.
- Tag de versión:
  `scm.cyberfuel.com/cyberfuel/iacp-operation-center:0.6.3-rc.3`.
- Tag por revisión:
  `scm.cyberfuel.com/cyberfuel/iacp-operation-center:sha-16bfa7d1df922ae832a4304241bba9d52e7f9aec`.
- Digest de manifiesto:
  `sha256:6dabdc97c34920a6641dc63840622956455224a57ead3659269586974ca5f376`.
- Referencia inmutable:
  `scm.cyberfuel.com/cyberfuel/iacp-operation-center@sha256:6dabdc97c34920a6641dc63840622956455224a57ead3659269586974ca5f376`.
- `IACOC_IMAGE_DIGEST` para Compose/Portainer:
  `6dabdc97c34920a6641dc63840622956455224a57ead3659269586974ca5f376`.

El tag de versión y el tag de revisión devolvieron el mismo digest. El
manifiesto contiene `linux/amd64`. El pull por digest fue verificado y sus
labels devolvieron `org.opencontainers.image.version=0.6.3-rc.3` y la revisión
completa `16bfa7d1df922ae832a4304241bba9d52e7f9aec`.

## Validación ejecutada

Todo Node/npm, build y Chromium se ejecutó dentro de Docker:

- `./scripts/validate.sh`: PASS.
- Buildx check, Compose local/producción y manifiesto empresarial: PASS.
- Prettier: PASS.
- Svelte check: 0 errores y 0 advertencias.
- 176 pruebas unitarias/integración: PASS.
- Build de producción y verificación de artefactos: PASS.
- 21 pruebas Chromium: PASS.
- `./scripts/validate-persistence.sh`: PASS.
- SQLite, sesión, conexiones cifradas, keyring, auditoría e intenciones CRM
  inciertas sobrevivieron la recreación del contenedor.
- `git diff --check`: PASS.
- Push OCI de ambos tags y pull por digest `linux/amd64`: PASS.

Las pruebas locales no ejecutaron creaciones ni acciones de lifecycle reales y
no acreditan la aceptación empresarial. Portainer no fue actualizado.

## Comprobación de telemetría IACP

Se hizo una lectura HTTPS autenticada, sin mutaciones y sin registrar el token,
contra el runtime de IACP. `GET /health/ready`, `/openapi.json`,
`/v1/observability`, `/v1/operations`, `/v1/events`, `/v1/instances`,
`/v1/plans`, `/v1/images` y `/v1/profiles` respondieron `200`.

La evidencia actual sigue siendo:

- `worker_liveness=unknown`.
- `queue_depth=null`.
- `queue_scope=not-disclosed`.
- `active_operations=2` y `uncertain_operations=2` en la observación consultada.
- El OpenAPI publicado solo expone `/v1/observability` como ruta relacionada;
  no publica un registro de workers, heartbeats, colas ni streaming.

IaCoC no infiere workers vivos, asignaciones ni profundidad de broker a partir de
operaciones, actores históricos o contenedores. El requerimiento técnico para
IACP está documentado en
[`IACP_INTEGRATION_REQUIREMENTS_060.md`](IACP_INTEGRATION_REQUIREMENTS_060.md):
worker ID estable, estado y heartbeat con `last_heartbeat_at`, operación
asignada explícita, `observed_at`, contadores de cola respaldados por una fuente
real, antigüedad de trabajo, paginación tenant-scoped, frescura, RBAC y errores
parciales sin convertir `null` en cero.

## Actualización desde 0.6.1/0.6.2 o rc.2 en Portainer

Portainer no fue modificado. En una ventana autorizada, el operador debe:

1. Identificar el digest actualmente desplegado, variables de la Stack, volumen
   `configuration` y ruta absoluta del keyring externo. Pausar nuevas solicitudes
   durante la recreación.
2. Obtener un backup coherente de SQLite, incluyendo `-wal`/`-shm` si existen,
   y respaldar el keyring externo por separado. Conservar ambos respaldos como
   una pareja; no imprimir su contenido.
3. Confirmar que Docker Standalone, `proxy_network`, `websecure`, DNS y TLS de
   `iacoc.cyberfuel.com` están sanos. No crear redes, Traefik, certificados ni
   puertos nuevos.
4. En la Stack existente cambiar únicamente `IACOC_IMAGE_DIGEST` por:

   ```text
   6dabdc97c34920a6641dc63840622956455224a57ead3659269586974ca5f376
   ```

   Mantener la imagen por digest, Compose, labels, variables, límites, volumen
   SQLite `configuration`, montaje readonly del keyring, red externa y una sola
   réplica.
5. Recrear solamente el servicio `iacoc-web`. No ejecutar `down --volumes`, no
   borrar volúmenes, no ejecutar `init-key` ni `bootstrap-admin` en una Stack
   existente y no regenerar el keyring.
6. Verificar health, HTTPS, login, RBAC, persistencia de usuarios/sesiones según
   política, conexiones cifradas, auditoría y ausencia de secretos en logs. La
   actualización no incluye una mutación de IACP.

## Rollback

Si falla una comprobación, detener solicitudes nuevas, conservar evidencia y
restaurar el digest anterior confirmado en el destino. Para rc.2, el digest
publicado de referencia es:

```text
b09e424c62c8940eefb0eee1682948d42f32aef3d683a5a22adb3dcc034f83e7
```

Mantener exactamente los mismos volúmenes, keyring, variables, red y labels; no
restaurar SQLite automáticamente ni borrar datos. Un rollback de IaCoC no
revierte operaciones IACP ya admitidas: las intenciones inciertas deben
revisarse antes de volver a habilitar solicitudes.

## Aceptación empresarial pendiente

La aceptación requiere un Administrator del tenant, conexión IACP válida,
identidad autorizada para las acciones que IACP permita, una única KVM nueva y
desechable de MNG y autorización explícita para mutar infraestructura. El
recorrido se ejecutará exclusivamente desde la GUI:

1. Vincular IACP y verificar reader, tenant y permisos efectivos publicados.
2. Abrir CRM, elegir KVM 1 e imagen certificada Ubuntu 24.04.
3. Crear una KVM desechable y registrar operation ID, instance ID, VMID, estados,
   timestamps y evidencia sin secretos.
4. Esperar la admisión y el resultado real; luego comprobar inventario.
5. Comprobar el estado antes de cada transición: encender, verificar running,
   reiniciar, verificar resultado, apagar, verificar stopped, encender,
   verificar running, apagar y eliminar.
6. Auditar Operations, Events y el estado final eliminado.

Si una operación falla, queda incierta o falta evidencia de hardware efectiva,
detener las mutaciones posteriores. No forzar recuperación, no eliminar un
recurso de estado incierto y no tocar VM 30029 ni recursos anteriores. Esta
publicación no ejecutó ese recorrido.
