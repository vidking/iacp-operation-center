# IaCoC 0.6.2 — publicación correctiva P0

## Artefacto publicado

- Rama: `main`.
- Commit de código: `2ecf5c052ef0f3eb9f35d0481daf19d43fddba06`.
- Versión: `0.6.2`.
- Plataforma: `linux/amd64`.
- Tags publicados: `scm.cyberfuel.com/cyberfuel/iacp-operation-center:0.6.2` y
  `scm.cyberfuel.com/cyberfuel/iacp-operation-center:sha-2ecf5c052ef0f3eb9f35d0481daf19d43fddba06`.
- Digest OCI del manifiesto: `sha256:b356e34e2600b476d6a9303030a8edadc1fc1bd13f0572a1a28e328528922845`.
- Referencia inmutable:
  `scm.cyberfuel.com/cyberfuel/iacp-operation-center@sha256:b356e34e2600b476d6a9303030a8edadc1fc1bd13f0572a1a28e328528922845`.
- `IACOC_IMAGE_DIGEST`:
  `b356e34e2600b476d6a9303030a8edadc1fc1bd13f0572a1a28e328528922845`.

El pull por digest fue verificado desde el registro. El manifiesto contiene la
plataforma `linux/amd64` y los labels `org.opencontainers.image.version=0.6.2` y
`org.opencontainers.image.revision=2ecf5c052ef0f3eb9f35d0481daf19d43fddba06`.

## Corrección incluida

La GUI comercial reconoce una Golden Image únicamente cuando IACP la publica como
`certificada` o `habilitada`, está marcada `authorized` y su disponibilidad está
activa. Imágenes deshabilitadas, desconocidas, no autorizadas o no disponibles no
se muestran como seleccionables. IaCoC no agrega cuotas, modelos CPU, overrides de
hardware ni defaults técnicos.

También se conservan los timeouts explícitos, los errores recuperables, el estado
de solicitud incierta, los patrones HTML válidos y el flujo de configuración única
de reader/operator cifrado en backend.

## Validación ejecutada

Todo Node/npm, build y Playwright se ejecutó dentro de Docker:

- `./scripts/validate.sh`: PASS.
- Docker build check, Compose local/producción y manifiesto empresarial: PASS.
- Prettier: PASS.
- Svelte check: PASS, 0 errores y 0 advertencias.
- 169 pruebas unitarias/integración: PASS.
- Build de producción y revisión de 115 artefactos: PASS.
- 19 pruebas Chromium: PASS.
- Regresión P0 de imagen `certificada`: PASS; `Crear KVM` habilitado, admisión
  `202`, seguimiento de operación e inventario verificados en fixture aislado.
- `git diff --check`: PASS.
- `IACOC_UPGRADE_FROM` apuntando al digest 0.6.1: PASS; se conservaron sesiones,
  usuarios, conexiones cifradas, keyring, auditoría, diagnósticos e intención
  incierta con SQLite `user_version=1`.

Las pruebas browser usan un upstream local aislado y no ejecutan IACP, Proxmox ni
mutaciones reales. No se crearon, encendieron, apagaron, reiniciaron ni eliminaron
instancias durante esta publicación.

## Actualización desde 0.6.1 en Portainer

Portainer no fue actualizado. Este es el procedimiento para el operador en una
ventana autorizada:

1. Registrar el digest 0.6.1 actualmente desplegado, variables de Stack, volumen
   exacto de configuración SQLite y ruta del keyring externo. Pausar nuevas
   solicitudes del portal durante la recreación.
2. Hacer un backup coherente de SQLite: usar la herramienta de backup de SQLite o
   detener brevemente IaCoC y copiar el archivo junto con cualquier `-wal`/`-shm`.
   Respaldar el keyring externo por separado. Conservar ambos respaldos como pareja.
3. Confirmar que `proxy_network`, `websecure`, DNS y TLS existentes siguen
   disponibles. No crear Traefik, redes, certificados ni puertos nuevos.
4. En la Stack existente, cambiar únicamente `IACOC_IMAGE_DIGEST` al valor:

   ```text
   b356e34e2600b476d6a9303030a8edadc1fc1bd13f0572a1a28e328528922845
   ```

   Mantener el Compose empresarial, labels, variables, límites, volumen SQLite,
   montaje readonly del keyring, red y una sola réplica.

5. Recrear únicamente el servicio IaCoC desde Portainer. No usar `down --volumes`,
   no borrar volúmenes, no ejecutar `bootstrap-admin` ni `init-key` en una
   instalación existente y no regenerar el keyring.
6. Verificar healthcheck, HTTPS y redirección al login. Comprobar que sobreviven
   usuarios, sesiones según política, conexiones, credenciales cifradas, auditoría
   y configuración operator. Estas son lecturas; no iniciar una KVM como parte de
   la actualización.
7. Si falla una comprobación, detener nuevas solicitudes y volver al digest 0.6.1
   usando los mismos volúmenes, keyring y variables. El rollback de IaCoC no revierte
   una operación IACP ya admitida; no restaurar SQLite automáticamente sin revisar
   el punto de backup.

## Aceptación humana empresarial

La aceptación humana es independiente de los tests locales. Requiere un
Administrator del tenant, reader válido, operator dedicado autorizado por IACP,
una sola KVM desechable de MNG y autorización explícita para mutar infraestructura.
No debe ejecutarse automáticamente durante la publicación.

Checklist: [ACCEPTANCE_062.md](ACCEPTANCE_062.md).

No tocar VM 30029 ni recursos existentes. Si IACP devuelve una discrepancia de
hardware, falta de evidencia CPU o estado incierto, detener el recorrido y
conservar el operation ID y la evidencia; no forzar recuperación ni modificar
Proxmox.
