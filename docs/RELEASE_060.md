# IaCoC 0.6.0 — publicación OCI

Código validado y publicado en Forgejo: `5af3feaaa5730c91eb5cd2581fe58ed71cf5f6b1`.

- Versión: **0.6.0**.
- Plataforma comprobada: **linux/amd64**.
- Etiqueta única: `scm.cyberfuel.com/cyberfuel/iacp-operation-center:sha-5af3feaaa5730c91eb5cd2581fe58ed71cf5f6b1`.
- Digest confirmado por push, consulta al registry y pull por digest: `sha256:0278eeaffb6416ff5a4249ad00ac1d3e1fa1671206408233e73fb7c03c1b8785`.
- Referencia empresarial inmutable: `scm.cyberfuel.com/cyberfuel/iacp-operation-center@sha256:0278eeaffb6416ff5a4249ad00ac1d3e1fa1671206408233e73fb7c03c1b8785`.
- Etiquetas OCI verificadas tras pull: version=0.6.0 y revision=5af3feaaa5730c91eb5cd2581fe58ed71cf5f6b1. Usuario runtime node; imagen sin tests ni scripts de integración.

## Validación ejecutada

`./scripts/validate.sh`: PASS; Docker build checks, Compose empresarial/local, Prettier, Svelte/TypeScript sin errores/advertencias, **110 pruebas unitarias**, build, 109 artefactos compilados comprobados sin fuentes sintéticas y **16 pruebas Chromium**.

`IACOC_UPGRADE_FROM=iacoc:0.5.0-local ./scripts/validate-persistence.sh`: PASS; sesiones, usuarios, conexiones, ciphertext/AAD, auditoría y diagnósticos sobreviven 0.5.0→0.6.0. Una recreación adicional preserva journal incierto y secreto separado de lifecycle; user_version=1.

Diff revisado y `git diff --check`: PASS. Escaneo en Docker de 144 archivos contra las credenciales exactas autorizadas, recibidas por stdin y sin imprimir valores: PASS. Build OCI mediante Docker buildx con --platform linux/amd64, APP_VERSION=0.6.0 y VCS_REF del commit de código; push y pull inmutables completados.

El registro de esta publicación se agrega como un commit documental posterior. La imagen corresponde exactamente al commit de código indicado arriba; no contiene esta nota creada después del push de imagen.

## Resultado real

El catálogo real publicó los cuatro planes disponibles. Una creación de GUI fue admitida por IACP y llegó a VMID 30028/mng01, invitado verificado y acceso completed después de reconciliar por observación el mismo UUID. Shutdown y start completaron. Reboot fue admitido pero falló con POWER_ACPI_TIMEOUT; la captura del usuario mostró Guest Agent sin respuesta y quit/powerdown timeout. No hubo force ni sustitución de ese resultado por éxito.

Se completaron posteriormente apagado normal y DELETE autorizado de la misma KVM nueva, con estado final deleted. No se alteraron máquinas preexistentes. Creaciones sucesivas con claves nuevas y planes diferentes están validadas localmente; no se presenta una segunda VM real como ejecutada. Workers/colas siguen Sin instrumentación hasta que IACP publique el contrato. Las cuotas históricas están cerradas y no condicionan IaCoC.

Informe y matriz completos: [STATUS_060.md](STATUS_060.md). IDs, fases y evidencia real: [VALIDATION_060.md](VALIDATION_060.md), [evidence/060](evidence/060). Requisitos para el otro frente: [IACP_INTEGRATION_REQUIREMENTS_060.md](IACP_INTEGRATION_REQUIREMENTS_060.md).

## Portainer preparado, sin despliegue

No se modificó Portainer ni la Stack empresarial. Entregar al operador:

```text
IACOC_IMAGE_DIGEST=0278eeaffb6416ff5a4249ad00ac1d3e1fa1671206408233e73fb7c03c1b8785
```

Conservar variables, volumen SQLite, usuarios, sesiones, conexiones y keyring. Verificar en destino pull por digest, proxy_network, websecure y certificado antes de actualizar. No ejecutar bootstrap/init-key en la instalación existente. Procedimiento completo y rollback: [PRODUCTION_060.md](PRODUCTION_060.md).

Archivos Compose completos: [desarrollo](../docker-compose.yml), [producción local 0.6.0](../docker-compose.production.yml), [Stack empresarial](../deploy/portainer/docker-compose.yml). Solo el Compose local de producción cambió su versión de imagen/argumento; el empresarial continúa parametrizado por digest, sin puertos publicados.

Rollback aprobado de referencia: imagen 0.5.0 `scm.cyberfuel.com/cyberfuel/iacp-operation-center@sha256:531f75b54d2729739e708044f5d23e0c773b7b2161cf626162c1e37c47f76daa`, con DB/keyring coherentes y sin borrar volúmenes. La tabla nueva es aditiva; volver la GUI a 0.5.0 no revierte operaciones de infraestructura.
