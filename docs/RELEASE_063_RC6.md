# IaCoC 0.6.3-rc.6 — release empresarial

## Alcance

Esta candidata parte del merge `af2c6b2e5b30352bf152c3947ad529924fa38156`
(PR #3) e incluye las correcciones de consumo CRM, reanudación por checkpoint,
refresco de energía, diagnóstico upstream, paginación y evidencia del lifecycle
real de VM 30064.

No se modificaron IACP, Proxmox, Terraform, Traefik, Golden Images, Portainer,
Jira ni VM 30060.

## Artefactos

- Versión: `0.6.3-rc.6`.
- Tag Git: `v0.6.3-rc.6`.
- Plataforma OCI: `linux/amd64`.
- Repositorio OCI: `scm.cyberfuel.com/cyberfuel/iacp-operation-center`.
- Tag de versión: `scm.cyberfuel.com/cyberfuel/iacp-operation-center:0.6.3-rc.6`.
- Tag por revisión: `scm.cyberfuel.com/cyberfuel/iacp-operation-center:sha-<release-commit>`.
- Digest OCI: se registra en el informe de publicación después del push y pull.

## QA ejecutado dentro de Docker

```text
194 pruebas unitarias/integración: PASS
27 pruebas Chromium/Playwright: PASS
20 ciclos contractuales: PASS
Prettier: PASS
Svelte check: PASS
Build de producción y verificación del artefacto: PASS
Persistencia SQLite/keyring, migración y recreación: PASS
Compose empresarial: PASS
```

La evidencia empresarial de VM 30064 está en
[`E2E_REAL_VM30064_20261027.md`](E2E_REAL_VM30064_20261027.md). La dirección IP
no fue inventada: IACP informó `GUEST_INITIALIZATION_REQUIRED`.

## Actualización manual desde rc.5

Portainer no se actualiza automáticamente. En una ventana autorizada:

1. Confirmar el digest actualmente desplegado y respaldar SQLite de forma
   coherente, conservando WAL/SHM cuando existan.
2. Respaldar el keyring externo por separado. No regenerarlo.
3. Cambiar únicamente `IACOC_IMAGE_DIGEST` al digest de rc.6.
4. Mantener Compose, `proxy_network`, labels Traefik, `PUBLIC_ORIGIN`,
   `IACP_ALLOWED_TARGETS`, variables, usuarios, sesiones, conexión Bearer y
   auditoría.
5. Recrear únicamente el servicio IaCoC. No usar `down --volumes`,
   `bootstrap-admin`, `init-key` ni borrar volúmenes.
6. Verificar health, HTTPS, login, RBAC, persistencia, conexión Bearer, CRM,
   Events y Operations antes de habilitar nuevas mutaciones.

## Rollback

Si falla una comprobación, detener solicitudes nuevas y volver al digest rc.5
confirmado:

```text
sha256:53f3b0c416b451cc266308334ae2008f00a17612ad943d8e189460607e7223cb
```

El rollback conserva los mismos volúmenes, keyring, red, variables y labels. No
revierte operaciones IACP ya admitidas ni elimina recursos inciertos; esos casos
se concilian antes de reanudar mutaciones.
