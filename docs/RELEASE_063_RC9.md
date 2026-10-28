# IaCoC 0.6.3-rc.9 — identidad, RBAC y consola

## Estado de publicación

- Versión: `0.6.3-rc.9`.
- Commit de base empresarial: `93f5625d35e21a1ac97898c2f224ab3b4af478f2`.
- Commit del artefacto OCI: `b51e22c703b0502923df8c5282a4cc93755c3e80`.
- Rama de release: `release/0.6.3-rc.9`.
- Tag Git: `v0.6.3-rc.9`.
- Plataforma OCI: `linux/amd64`.
- Repositorio OCI: `scm.cyberfuel.com/cyberfuel/iacp-operation-center`.
- Digest OCI del índice publicado: `sha256:6935292233cd116e2733ac33c0abf1dd015d8f70ffb4722d0f97023b16a5c125`.
- `IACOC_IMAGE_DIGEST`: `6935292233cd116e2733ac33c0abf1dd015d8f70ffb4722d0f97023b16a5c125`.
- El índice contiene el manifiesto `linux/amd64` y su attestation OCI.

Esta candidata incorpora la identidad visible **Infrastructure as Code / Operation
Center**, el arte suministrado, perfiles y administración de usuarios desde la
GUI, RBAC efectivo para Lector/Operador/Administrador, preferencias persistentes
y la paleta de búsqueda global. Mantiene una única conexión Bearer cifrada en el
backend y no modifica el contrato ni la autorización de IACP.

## Compatibilidad y migración

La migración es aditiva y compatible con la base de rc.8:

- `users.display_name` se agrega mediante `ALTER TABLE` únicamente si falta.
- Se conserva el UUID del usuario Administrador, sesiones, conexiones, Bearer
  cifrado, keyring externo, auditoría, intents y tenant.
- El esquema SQLite mantiene `user_version=1`.
- El cambio de contraseña exige la contraseña vigente, usa Argon2id y revoca las
  sesiones anteriores.
- No se ejecutan `bootstrap-admin`, `init-key` ni se eliminan volúmenes.

## QA local contenerizado

Validaciones ejecutadas con Docker/Compose:

- `./scripts/validate.sh`: PASS.
- Prettier: PASS.
- Svelte check: PASS, 0 errores y 0 warnings.
- Unitarias/integración: 205/205 PASS en 17 archivos.
- Chromium/Playwright: 32/32 PASS con un worker; incluye 20 ciclos
  contractuales sin mutaciones empresariales.
- Build de producción y verificación de artefactos: PASS.
- Persistencia y recreación Docker: PASS para SQLite/WAL, keyring, sesiones,
  conexiones, auditoría e intents inciertos.
- Pruebas de tres roles: Lector, Operador y Administrador, con autorización
  comprobada en backend; no solo en la interfaz.
- `validate-portainer.sh` y Compose empresarial: PASS estructural.

Las capturas sanitizadas permanecen en el volumen Docker de resultados de
Playwright y no se incorporan al repositorio. Las pruebas contractuales utilizan
el stub aislado de IACP; no acreditan aprovisionamiento real en Proxmox.

## Actualización Portainer desde rc.8

1. Registrar el digest efectivo actualmente desplegado en Portainer antes del
   cambio; no asumir que coincide con rc.8.
2. Respaldar SQLite de forma coherente, incluyendo WAL/SHM cuando existan, y
   conservar el volumen `configuration`.
3. Conservar el keyring externo, usuarios, sesiones, Bearer cifrado, intents,
   auditoría, `proxy_network`, labels Traefik, `websecure`, TLS, allowlist y
   variables empresariales.
4. Cambiar únicamente `IACOC_IMAGE_DIGEST` al digest de rc.9, sin `sha256:`.
5. Recrear el servicio existente y verificar health, login, persistencia,
   Conectores, Usuarios, Configuración, CRM y RBAC.
6. No ejecutar `bootstrap-admin`, `init-key`, regeneración de claves ni borrar
   volúmenes.

## Rollback

Detener nuevas acciones desde la GUI, conservar auditoría e intents `uncertain` y
volver al digest efectivo registrado antes de la actualización. Mantener los
mismos volúmenes, keyring, red y variables. El rollback de la imagen no revierte
operaciones ya enviadas a IACP.

No se actualiza Portainer automáticamente como parte de esta publicación.
