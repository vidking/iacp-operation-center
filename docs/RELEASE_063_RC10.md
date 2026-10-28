# IaCoC 0.6.3-rc.10 — estabilización de autenticación y Operations

## Alcance

- Versión: `0.6.3-rc.10`.
- Commit de integración: `6d85ec8f95d082d7d383e7f0254af34cb19d8b6e`.
- Rama de release: `release/0.6.3-rc.10`.
- Tag Git: `v0.6.3-rc.10`.
- Plataforma OCI: `linux/amd64`.
- Repositorio OCI: `scm.cyberfuel.com/cyberfuel/iacp-operation-center`.
- SHA de release: `b460570e0cbaba23fcaa8713d474c1dc8f16f2c7`.
- Digest OCI del índice publicado: `sha256:9a150e87e143676d6059f3612bb2f6e228e58033e197494dc41f934e87660297`.
- `IACOC_IMAGE_DIGEST`: `9a150e87e143676d6059f3612bb2f6e228e58033e197494dc41f934e87660297`.

Esta release conserva la administración multiusuario, Argon2id, CSRF, RBAC de
servidor, aislamiento de tenant, SQLite, keyring y Bearer cifrado. Incluye la
corrección del rate limiter de login y el refresco controlado del índice de
instancias usado para agrupar Operations, Events e Incidents.

No modifica el contrato de IACP, no ejecuta mutaciones empresariales y no
actualiza Portainer automáticamente.

## Compatibilidad y actualización

La actualización desde rc.9 es compatible y no requiere migración destructiva:

- Conservar el volumen SQLite, incluidos WAL/SHM cuando existan.
- Conservar usuarios, UUID, sesiones, tenant, auditoría e intents.
- Conservar el keyring externo y la conexión Bearer cifrada.
- Conservar `proxy_network`, labels Traefik, `websecure`, TLS, allowlist y
  variables empresariales.
- Cambiar únicamente `IACOC_IMAGE_DIGEST` por el digest de rc.10, sin el prefijo
  `sha256:` si el Compose empresarial lo agrega.
- No ejecutar `bootstrap-admin`, `init-key`, rotación de claves ni eliminación
  de volúmenes.

Antes de recrear el servicio, registrar el digest realmente desplegado y tomar
un respaldo coherente de SQLite. Luego verificar health, login en dos
navegadores, usuarios/RBAC, Operations agrupadas y persistencia.

## Rollback

Detener nuevas acciones desde la GUI, conservar auditoría e intents inciertos y
volver al digest registrado antes de la actualización. Mantener los mismos
volúmenes, keyring, red y variables. El rollback de la imagen no revierte
operaciones que ya hayan sido enviadas a IACP.

Referencia publicada de rollback rc.9:
`6935292233cd116e2733ac33c0abf1dd015d8f70ffb4722d0f97023b16a5c125`.

## QA

Validación contenerizada ejecutada sobre rc.10:

- `./scripts/validate.sh`: PASS.
- 208 unitarias/integración en 17 archivos: PASS.
- Svelte check: 0 errores y 0 advertencias.
- Prettier/lint: PASS.
- Chromium/Playwright: 34/34 PASS, incluyendo login en dos contextos,
  creación y administración de usuarios, RBAC de backend, agrupación y
  búsqueda de 500 operaciones, Events/Incidents y 20 ciclos contractuales.
- Build de producción y verificación del artefacto: PASS.
- Persistencia SQLite/WAL, keyring, sesiones, conexiones, auditoría e intents
  inciertos tras recrear el contenedor: PASS.
- Compose empresarial y manifiesto Portainer: PASS estructural.

Los ciclos contractuales usan el stub aislado de IACP; no representan nuevas
mutaciones empresariales ni sustituyen la aceptación real contra IACP.

## Artefacto OCI

- Digest OCI `linux/amd64`: verificado mediante pull por digest.
- Labels verificadas: `org.opencontainers.image.version=0.6.3-rc.10` y
  `org.opencontainers.image.revision=b460570e0cbaba23fcaa8713d474c1dc8f16f2c7`.
