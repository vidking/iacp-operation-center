# IaCoC 0.6.3-rc.1 — publicación controlada

## Artefactos

- Commit de código: `c78084e515e0407406355dd45f87367f0cc16809`.
- Tag Git: `v0.6.3-rc.1`.
- Plataforma: `linux/amd64`.
- Tag OCI: `scm.cyberfuel.com/cyberfuel/iacp-operation-center:0.6.3-rc.1`.
- Tag OCI por revisión:
  `scm.cyberfuel.com/cyberfuel/iacp-operation-center:sha-c78084e515e0407406355dd45f87367f0cc16809`.
- Digest del manifiesto OCI:
  `sha256:e42c36108c28a67b663b396ee0673c59a9f3717a1072f0c7a41558db964a4acf`.
- `IACOC_IMAGE_DIGEST`:
  `e42c36108c28a67b663b396ee0673c59a9f3717a1072f0c7a41558db964a4acf`.

El tag de versión y el tag de revisión devolvieron el mismo digest. El pull por
digest fue verificado para `linux/amd64`. Los labels recuperados fueron
`org.opencontainers.image.version=0.6.3-rc.1` y
`org.opencontainers.image.revision=c78084e515e0407406355dd45f87367f0cc16809`.

## Validación

Todo Node/npm, build y Chromium se ejecutó dentro de Docker:

- `./scripts/validate.sh`: PASS.
- Buildx check, Compose y manifiesto empresarial: PASS.
- Prettier: PASS.
- Svelte check: 0 errores y 0 advertencias.
- 170 pruebas unitarias/integración: PASS.
- Build producción y verificación de 115 artefactos: PASS.
- 20 pruebas Chromium: PASS.
- `./scripts/validate-persistence.sh`: PASS.
- SQLite `user_version=1`, sesiones, usuarios, conexiones cifradas, keyring,
  auditoría e intenciones inciertas preservados durante recreaciones.
- `git diff --check`: PASS.
- Pull e inspección OCI por digest: PASS.

La suite Chromium utiliza el upstream fixture aislado y no acredita una sesión
empresarial ni mutaciones reales de IACP. La aceptación empresarial está separada
en [ACCEPTANCE_063_RC1.md](ACCEPTANCE_063_RC1.md).

## Actualización desde 0.6.2 en Portainer

Portainer no fue actualizado. En una ventana autorizada:

1. Registrar el digest 0.6.2 actualmente desplegado, las variables, el volumen
   SQLite y la ruta del keyring externo. Pausar nuevas solicitudes del portal.
2. Obtener un backup coherente de SQLite incluyendo WAL/SHM cuando existan y
   respaldar el keyring por separado. Conservar ambos como una pareja.
3. Confirmar que `proxy_network`, `websecure`, DNS y TLS existentes están sanos.
   No crear redes, Traefik, certificados ni puertos.
4. Cambiar únicamente `IACOC_IMAGE_DIGEST` en la Stack por:

   ```text
   e42c36108c28a67b663b396ee0673c59a9f3717a1072f0c7a41558db964a4acf
   ```

   Mantener Compose, labels, variables, límites, volumen `configuration`,
   montaje readonly del keyring, red y una sola réplica.

5. Recrear únicamente el servicio `iacoc-web`. No ejecutar `down --volumes`,
   `bootstrap-admin` ni `init-key`; no regenerar el keyring.
6. Verificar health, HTTPS, login, persistencia, conexión reader/operator,
   auditoría y ausencia de secretos en logs. No crear una KVM como parte del
   upgrade.

## Rollback a 0.6.2

Detener nuevas solicitudes y conservar evidencia. Restaurar únicamente el digest
0.6.2 confirmado en el destino. El digest publicado de referencia 0.6.2 es:

```text
b356e34e2600b476d6a9303030a8edadc1fc1bd13f0572a1a28e328528922845
```

Recrear el mismo servicio con los mismos volúmenes, keyring y variables. No
restaurar SQLite automáticamente y no eliminar datos. Un rollback de IaCoC no
revierte una operación IACP ya admitida; las intenciones inciertas deben revisarse
antes de volver a habilitar solicitudes.
