# IaCoC 0.6.3-rc.7 — release empresarial

## Alcance

Esta candidata parte del merge de Forgejo `fd4788c8a85e3325708dc6f03bc3e5ce643e989f`
(PR #4). Incluye las correcciones del CRM para representar explícitamente el
estado de ownership comercial, la evidencia de red e inicialización, y las
guardas de lifecycle sin eliminar las decisiones de autorización de IACP.

No se modificaron IACP, Proxmox, Terraform, Traefik, Golden Images, Portainer,
Jira ni las VM 30059/30060. El bloqueo `COMMERCIAL_OWNERSHIP_BINDING_CHANGED`
continúa siendo una condición informada por IACP; esta candidata no lo elude.

## Artefactos

- Versión: `0.6.3-rc.7`.
- Tag Git: `v0.6.3-rc.7`.
- Plataforma OCI: `linux/amd64`.
- Repositorio OCI: `scm.cyberfuel.com/cyberfuel/iacp-operation-center`.
- Tag de versión: `scm.cyberfuel.com/cyberfuel/iacp-operation-center:0.6.3-rc.7`.
- Commit de release: `c2b27e92f4c7ad766978607be8c8613a9fbe726e`.
- Tag por revisión: `scm.cyberfuel.com/cyberfuel/iacp-operation-center:sha-c2b27e92f4c7ad766978607be8c8613a9fbe726e`.
- Digest OCI verificado: `sha256:d15057f8b58cd2de9c2a78e65a4c285d86bf6cf01eb0f04dc63aa5c0b26e0f30`.
- `IACOC_IMAGE_DIGEST`: `d15057f8b58cd2de9c2a78e65a4c285d86bf6cf01eb0f04dc63aa5c0b26e0f30`.

## QA

La validación se ejecutó dentro de Docker/Compose:

- 195 pruebas unitarias e integración: PASS;
- 27 pruebas Chromium/Playwright: PASS, incluidos 20 ciclos contractuales;
- Prettier: PASS;
- Svelte check: PASS, 0 errores y 0 warnings;
- build de producción y verificación del artefacto: PASS, 114 archivos compilados;
- persistencia SQLite/keyring y migración de conexión Bearer única: PASS;
- validación estructural del Compose empresarial: PASS;
- pull OCI por digest `linux/amd64` y labels de versión/revisión: PASS.

La aceptación empresarial 20/20 de aprovisionamiento y lifecycle no se declara
en esta release: permanece sujeta a la autorización y a las respuestas de IACP.

## Actualización manual desde rc.6

Portainer no se actualiza automáticamente. En una ventana autorizada:

1. Confirmar el digest actualmente desplegado y respaldar SQLite de forma
   coherente, conservando WAL/SHM cuando existan.
2. Respaldar el keyring externo por separado. No regenerarlo ni moverlo a
   SQLite o Git.
3. Cambiar únicamente `IACOC_IMAGE_DIGEST` al digest de rc.7, sin el prefijo
   `sha256:`; el Compose empresarial agrega ese prefijo al construir la
   referencia por digest.
4. Mantener Compose, `proxy_network`, labels Traefik, `PUBLIC_ORIGIN`,
   `IACP_ALLOWED_TARGETS`, variables, usuarios, sesiones, conexión Bearer,
   intents y auditoría.
5. Recrear únicamente el servicio IaCoC. No usar `down --volumes`,
   `bootstrap-admin`, `init-key` ni eliminar volúmenes.
6. Verificar health, HTTPS, login, RBAC, persistencia, conexión Bearer, CRM,
   Events y Operations antes de habilitar nuevas mutaciones.

## Rollback a rc.6

Si falla una comprobación, detener solicitudes nuevas y volver al digest rc.6
confirmado:

```text
sha256:6a5d02dc97686646db709c19075c75a646602ed4d0b11d716d35b6c8a349e5b2
```

Para `IACOC_IMAGE_DIGEST`, usar solamente el valor sin `sha256:`. El rollback
conserva los mismos volúmenes, keyring, red, variables y labels. No revierte
operaciones IACP ya admitidas ni elimina recursos inciertos; esos casos se
concilian antes de reanudar mutaciones.
