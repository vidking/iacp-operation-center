# IaCoC 0.6.1 — publicación controlada

## Artefactos publicados

- Rama: `main`.
- Commits publicados: `a4e2c19` y `097e07d`.
- Revisión incluida en la imagen: `097e07d9b5d4df5e1daae6eead7382b8e437b2bc`.
- Versión: `0.6.1`.
- Plataforma: `linux/amd64`.
- Tags: `scm.cyberfuel.com/cyberfuel/iacp-operation-center:0.6.1` y `sha-097e07d9b5d4df5e1daae6eead7382b8e437b2bc`.
- Digest del manifiesto OCI: `sha256:c9eeefe0773a9c90c8d098c0046af5bf8f0fd4ef9ab3c4865307d9a46b97829c`.
- Referencia inmutable: `scm.cyberfuel.com/cyberfuel/iacp-operation-center@sha256:c9eeefe0773a9c90c8d098c0046af5bf8f0fd4ef9ab3c4865307d9a46b97829c`.

El pull por digest desde el registro fue verificado para `linux/amd64`. Los labels recuperados fueron `org.opencontainers.image.version=0.6.1` y `org.opencontainers.image.revision=097e07d9b5d4df5e1daae6eead7382b8e437b2bc`.

## Validación ejecutada

Todo el trabajo de Node/npm, build y pruebas se ejecutó dentro de Docker:

- `./scripts/validate.sh`: PASS.
- Prettier, Svelte check y TypeScript: PASS.
- 169 pruebas unitarias/integración: PASS.
- Build de producción y revisión de 115 artefactos: PASS.
- 18 pruebas Chromium: PASS.
- Validación de Compose y manifiesto Portainer: PASS.
- `git diff --check`: PASS.
- La validación de persistencia 0.6.0→0.6.1 sobre volúmenes desechables conserva usuarios, sesiones, conexiones, AAD/ciphertexts, auditoría, keyring, intención incierta y secreto de lifecycle; no toca volúmenes empresariales.

No se ejecutaron creaciones, lifecycle, eliminaciones ni ninguna otra mutación real. No se modificaron IACP, Proxmox, Golden Images, Terraform, Portainer, Jira ni la VM 30029.

## Procedimiento de actualización de la Stack empresarial

Este procedimiento es una preparación operativa; no fue ejecutado en esta entrega.

1. Abrir una ventana autorizada y detener nuevas solicitudes desde el portal. Registrar el digest de 0.6.0 actualmente desplegado, las variables de la Stack, el nombre exacto del volumen `configuration` y la ruta del keyring externo.
2. Obtener un backup coherente de SQLite usando el mecanismo de backup de SQLite o una parada breve y una copia consistente de `iacoc.sqlite` junto con cualquier `iacoc.sqlite-wal`/`iacoc.sqlite-shm`. Respaldar el keyring externo por separado y mantener ambos respaldos como una pareja lógica. No copiar un SQLite activo solo desde el archivo principal.
3. Confirmar en el host destino que existe la red externa `proxy_network`, que `websecure`, el certificado de `iacoc.cyberfuel.com`, DNS y el router existente son correctos. Confirmar que el host puede hacer pull por la referencia inmutable con la identidad de lectura del registro.
4. En Portainer, conservar el mismo Stack, volumen `configuration`, bind readonly del keyring, variables, límites, labels y red. Sustituir únicamente `IACOC_IMAGE_DIGEST` por `c9eeefe0773a9c90c8d098c0046af5bf8f0fd4ef9ab3c4865307d9a46b97829c`. No usar `latest`, tags mutables ni una imagen local.
5. Aplicar/recrear únicamente el servicio `iacoc-web` desde Portainer. No usar `down --volumes`, no borrar el volumen, no ejecutar `init-key` ni `bootstrap-admin` en una instalación existente y no regenerar el keyring.
6. Verificar healthcheck, HTTPS y redirección al login. Confirmar que usuarios, sesiones según su política, conexiones cifradas, auditoría y configuración sobreviven. Validar desde la GUI conexiones, catálogo, inventario, RBAC y revocación sin ejecutar mutaciones de infraestructura.
7. Si una comprobación falla, detener nuevas solicitudes, conservar logs sanitizados y volver al digest anterior con los mismos volúmenes, keyring y variables. Un rollback de imagen no revierte una mutación IACP ya aceptada; no restaurar SQLite automáticamente sin revisar el punto de backup.

La Stack empresarial completa está en [deploy/portainer/docker-compose.yml](../deploy/portainer/docker-compose.yml). El manifiesto no publica puertos, usa una sola réplica implícita, monta SQLite en `configuration`, monta el keyring readonly y conecta la red externa `proxy_network`.

## Diferencias de Compose

No hay diferencias en el manifiesto empresarial entre la base 0.6.0 y 0.6.1. El único cambio de Compose es el archivo de producción local: `APP_VERSION` e imagen local pasan de `0.6.0`/`iacoc:0.6.0-local` a `0.6.1`/`iacoc:0.6.1-local`. Ese Compose local no debe usarse como Stack empresarial.

## Hardware y bloqueo E2E

El E2E real permanece bloqueado. La GUI y el cliente OpenAPI ya preparan el flujo completo, pero IACP todavía debe publicar un contrato de solo lectura que asocie a la instancia/operación el modelo de CPU virtual efectivo, timestamp, procedencia y relación con la Golden Image/plan certificado. VMID, imagen, vCPU, RAM, disco, nodo y estado no prueban por sí solos el modelo CPU.

IaCoC no envía overrides técnicos ni corrige Proxmox. Cuando exista ese contrato, el runner debe comprobar la evidencia antes de `start`; ante discrepancia o evidencia ausente debe conservar la evidencia y detener todas las mutaciones posteriores. Hasta entonces no se habilita el recorrido Crear → Energía → Eliminar.

Las operaciones `GET /health/live` y `POST /v1/jobs/smoke` continúan fuera de la GUI por diseño y política. La matriz funcional de las 28 operaciones está en [API_COVERAGE_061.md](API_COVERAGE_061.md).
