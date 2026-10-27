# IaCoC 0.6.3-rc.5 — release empresarial

## Alcance

Esta candidata publica el merge `92d71f7` de la rama de aceptación E2E. Incluye
los diagnósticos upstream persistentes, la paginación incremental de Events, los
guards del runner ante estados inciertos y el informe sanitizado de la primera
prueba real bloqueada por `PROVISIONING_COMMAND_FAILED` en IACP.

IaCoC mantiene una única conexión Bearer cifrada en backend. El CRM no requiere
un secreto operator separado y las mutaciones continúan sujetas a la sesión
Administrator, tenant y autorización efectiva de IACP.

No se modificaron IACP, Traefik, Proxmox, Terraform, Golden Images, Portainer,
Jira ni recursos empresariales. La aceptación empresarial 20/20 sigue bloqueada:
`PASS=0`, `BLOCKED=1`, `NOT RUN=19`. No se ejecutan nuevas creaciones mientras
permanezca sin conciliar el intento incierto documentado en
[`E2E_20_KVM_REPORT.md`](../E2E_20_KVM_REPORT.md).

## Artefactos

- Versión: `0.6.3-rc.5`.
- Tag Git: `v0.6.3-rc.5`.
- Plataforma OCI: `linux/amd64`.
- Repositorio OCI: `scm.cyberfuel.com/cyberfuel/iacp-operation-center`.
- Tag de versión: `scm.cyberfuel.com/cyberfuel/iacp-operation-center:0.6.3-rc.5`.
- Commit de la imagen: `83b18e3da42d0d12c6a8464000aa771684e01943`.
- Tag por revisión: `scm.cyberfuel.com/cyberfuel/iacp-operation-center:sha-83b18e3da42d0d12c6a8464000aa771684e01943`.
- Digest OCI: `sha256:53f3b0c416b451cc266308334ae2008f00a17612ad943d8e189460607e7223cb`.
- `IACOC_IMAGE_DIGEST`: `53f3b0c416b451cc266308334ae2008f00a17612ad943d8e189460607e7223cb`.

## Validación requerida

Ejecutar exclusivamente dentro de Docker:

```bash
./scripts/validate.sh
./scripts/validate-persistence.sh
```

La validación debe incluir unitarias/integración, Chromium/Playwright, Svelte
check, Prettier, build, persistencia SQLite/keyring, recreación de intents
inciertos y auditoría, migración de conexión Bearer única y Compose empresarial.

La evidencia local no sustituye la aceptación empresarial ni acredita que IACP
aprovisione una KVM.

## Actualización manual desde rc.4

Portainer no se actualiza automáticamente. En una ventana autorizada:

1. Confirmar el digest actualmente desplegado, la Stack, `proxy_network`, labels,
   variables, volumen SQLite y keyring externo.
2. Respaldar SQLite de forma coherente, conservando WAL/SHM cuando existan, y
   respaldar el keyring por separado como pareja de recuperación.
3. Cambiar únicamente `IACOC_IMAGE_DIGEST` al digest de rc.5. Mantener
   `LIVE_ENABLED`, `IACP_ALLOWED_TARGETS`, `PUBLIC_ORIGIN`, límites, labels,
   `proxy_network` y el montaje readonly del keyring.
4. Recrear únicamente el servicio IaCoC. No usar `down --volumes`, `init-key`,
   `bootstrap-admin` ni eliminar volúmenes.
5. Verificar health, HTTPS, login, RBAC, persistencia, auditoría, conexión Bearer,
   CRM, Events y Operations antes de habilitar nuevas solicitudes.

## Rollback

Si falla una comprobación, detener solicitudes nuevas y volver al digest anterior
confirmado, conservando los mismos volúmenes, keyring, variables, red y labels.
El digest rc.4 registrado es:

```text
ca3acc9d3ed945c899e1bb37f01e2eda2b6b07897882b18cb9b9cd9a65e8a9b5
```

El rollback no revierte operaciones IACP ya admitidas ni elimina recursos en
estado incierto. Conciliar esos estados antes de cualquier nueva mutación.

## Aceptación posterior

Después de la actualización, el operador debe comprobar desde el navegador
empresarial login, conexión Bearer única, catálogo, inventario, Events y
Operations. No declarar aprovisionamiento PASS: la creación real, hardware y
lifecycle permanecen pendientes hasta una corrida autorizada y concluyente.
