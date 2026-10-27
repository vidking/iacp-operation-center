# IaCoC 0.6.3-rc.4 — candidata empresarial

## Alcance

Esta candidata incorpora `bb995f3`, que hace explícita la reutilización de la
identidad reader cuando la conexión está activa, conserva la alternativa de una
credencial operator separada y evita presentar una credencial registrada como
permiso mutante confirmado. También incluye un runner Playwright asistido para
autenticación humana sin exportar cookies, tokens, headers, formularios ni
`storageState`.

No se ejecutaron creaciones ni acciones de lifecycle de infraestructura.
Portainer, IACP, Proxmox, Terraform, Golden Images, Jira y VM 30029 no fueron
modificados.

## Artefactos

- Versión: `0.6.3-rc.4`.
- Commit de la imagen: `3361a3c582cfd1c96709d5720988707b5aa40d20`.
- Tag Git: `v0.6.3-rc.4`.
- Plataforma OCI: `linux/amd64`.
- Tag de versión: `scm.cyberfuel.com/cyberfuel/iacp-operation-center:0.6.3-rc.4`.
- Tag por revisión:
  `scm.cyberfuel.com/cyberfuel/iacp-operation-center:sha-3361a3c582cfd1c96709d5720988707b5aa40d20`.
- Digest OCI: `sha256:ca3acc9d3ed945c899e1bb37f01e2eda2b6b07897882b18cb9b9cd9a65e8a9b5`.
- `IACOC_IMAGE_DIGEST`:
  `ca3acc9d3ed945c899e1bb37f01e2eda2b6b07897882b18cb9b9cd9a65e8a9b5`.

## Validación local

Ejecutada exclusivamente dentro de Docker:

- `./scripts/validate.sh`.
- `./scripts/validate-persistence.sh`.
- 176 pruebas unitarias/integración.
- 21 pruebas Chromium.
- Svelte check, build de producción y verificación de 116 artefactos.
- Manifiesto empresarial y revisión de Compose.
- Sintaxis del runner asistido y `git diff --check`.

Estas pruebas no acreditan permisos mutantes ni aceptación empresarial.

## Aceptación asistida

El operador ejecuta desde la raíz:

```bash
./scripts/run-enterprise-assisted.sh
```

El script construye y ejecuta Chromium dentro de Docker, conecta únicamente el
display local mediante `/tmp/.X11-unix`, y no publica puertos de depuración. El
administrador completa el login y la configuración de reader/operator en la
ventana visible. El runner espera el estado `Conectado` y `Registrado`, navega a
CRM y verifica catálogo y botones sin pulsar `Crear KVM` ni enviar lifecycle.

La evidencia sanitizada queda temporalmente en `/tmp` con modo 0700/0600; no se
exporta la sesión autenticada y el script la elimina al finalizar.

## Actualización manual desde rc.3

Portainer no se actualiza automáticamente. En una ventana autorizada:

1. Confirmar el digest desplegado, la Stack, el volumen SQLite `configuration`,
   el keyring externo, variables, red `proxy_network` y labels existentes.
2. Respaldar SQLite coherentemente, incluyendo WAL/SHM si existen, y respaldar
   el keyring por separado. Conservarlos como pareja.
3. Cambiar únicamente `IACOC_IMAGE_DIGEST` al digest de `rc.4` y conservar
   Compose, `LIVE_ENABLED`, allowlist, volúmenes, keyring readonly y una réplica.
4. Recrear únicamente el servicio IaCoC. No usar `down --volumes`, `init-key`,
   `bootstrap-admin` ni regenerar el keyring.
5. Verificar health, HTTPS, login, RBAC, persistencia, auditoría y la conexión
   reader antes de habilitar nuevas solicitudes.

## Rollback

Si falla una comprobación, detener solicitudes nuevas, conservar evidencia y
volver al digest anterior confirmado. Para `0.6.3-rc.3` el digest anterior es:

```text
6dabdc97c34920a6641dc63840622956455224a57ead3659269586974ca5f376
```

Mantener los mismos volúmenes, keyring, variables, red y labels. El rollback no
revierte operaciones IACP ya admitidas ni elimina recursos de estado incierto.

## Estado de aceptación

La prueba empresarial autenticada, la creación de una KVM desechable y el
lifecycle siguen pendientes de ejecución explícitamente autorizada. Un HTTP 200
de observabilidad no se interpreta como autorización mutante.
