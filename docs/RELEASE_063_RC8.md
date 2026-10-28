# IaCoC 0.6.3-rc.8 — release de observabilidad y GUI

## Estado

- Versión: `0.6.3-rc.8`.
- Commit de base empresarial: `27f687e8c5dcbfe0a0579c4f58efb91617a1a863`.
- Tag Git: `v0.6.3-rc.8` (se crea después de la validación final).
- Plataforma OCI: `linux/amd64`.
- Digest OCI: se registra después del push y pull por digest.

Esta release incorpora la paginación global observada de Operations e
Incidents, ordenamiento estable, feed incremental de Events, navegación por
historial y la identificación explícita del alcance y frescura de Overview.
No agrega métricas de workers ni fuentes sintéticas al runtime.

## Digest desplegado antes del cambio

No fue posible verificar el digest realmente ejecutándose en Portainer desde el
checkout local. El endpoint público `GET https://iacoc.cyberfuel.com/health`
respondió `200` con `{"status":"ok","application":"iacoc"}`, pero no
publica versión, revisión ni digest. El contenedor Docker local observado es
`iacoc:dev-0.1.0`, no la Stack empresarial.

El digest de rc.7 registrado en el repositorio es
`sha256:d15057f8b58cd2de9c2a78e65a4c285d86bf6cf01eb0f04dc63aa5c0b26e0f30`;
se conserva únicamente como referencia publicada, no como afirmación del
digest actualmente desplegado.

## Validación

Registrar aquí los resultados finales de Docker, Svelte check, Prettier,
unitarias/integración, Chromium, los 20 ciclos contractuales, persistencia,
Compose y el pull por digest antes de cerrar la release.

La prueba contractual utiliza Chromium contra el stub del contrato IACP y no
crea infraestructura real. La aceptación empresarial queda separada y no se
ejecutan mutaciones reales durante esta publicación.

## Actualización Portainer

1. En una ventana autorizada, registrar desde Portainer el digest efectivo del
   servicio antes del cambio. Si no coincide con el digest documentado, guardar
   ese valor como rollback real de la Stack.
2. Respaldar SQLite incluyendo WAL/SHM de forma coherente y conservar el
   volumen `configuration`.
3. Conservar el keyring externo, sesiones, usuarios, conexión Bearer cifrada,
   intents, auditoría, `proxy_network`, labels Traefik, `websecure`, TLS,
   allowlist y variables empresariales.
4. Cambiar únicamente `IACOC_IMAGE_DIGEST` al digest de rc.8 sin el prefijo
   `sha256:`. No usar tags mutables ni `latest`.
5. Recrear únicamente el servicio desde la Stack existente y verificar health,
   login, persistencia y las vistas Operations/Events.
6. No ejecutar `bootstrap-admin`, `init-key`, migraciones destructivas ni
   eliminar volúmenes.

## Rollback

Detener nuevas acciones desde la GUI, preservar auditoría y revisar intents
`uncertain`. Restaurar el digest efectivo registrado en el paso 1, conservando
los mismos volúmenes, keyring, red y variables. Volver a una imagen anterior no
revierte operaciones de IACP.
