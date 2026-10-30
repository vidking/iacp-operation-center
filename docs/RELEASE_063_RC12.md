# IaCoC 0.6.3-rc.12 — ControlPlaneV2 y despliegue empresarial

## Publicación

- Commit de aplicación: `a3cd41fd487c798d43311dfc6dc04133786b066c`.
- Tag: `v0.6.3-rc.12`.
- Imagen OCI `linux/amd64`:
  `scm.cyberfuel.com/cyberfuel/iacp-operation-center@sha256:397db8263cc28785e66a3cb82f0035e0ee80dd325db20f204aa738aeaeb00e14`.
- El pull por digest verificó las etiquetas OCI de versión `0.6.3-rc.12` y revisión `a3cd41fd487c798d43311dfc6dc04133786b066c`.

## Adaptador ControlPlaneV2

IaCoC descubre el contrato publicado por `/openapi.json`, reconoce la referencia
`InstanceCreateRequest`, normaliza los envelopes de planes, imágenes, instancias,
operaciones, eventos y observabilidad, y usa únicamente las rutas de mutación
publicadas por ControlPlaneV2. El alcance se modela explícitamente como
`single-tenant-endpoint`; no se inventa `tenant_id`, heartbeat, profundidad de
cola ni capacidad no publicada.

La política aplicada a la Stack `iac-oc` es exactamente:

```json
[
  { "origin": "https://iac.cyberfuel.com", "addresses": ["192.168.1.50"] },
  { "origin": "https://dev-iac.cyberfuel.com", "addresses": ["192.168.3.110"] }
]
```

La UI permite registrar y confirmar el endpoint `https://dev-iac.cyberfuel.com`
como alcance único, manteniendo la credencial Bearer cifrada en el keyring
externo y sin devolverla al navegador.

## Portainer

Se actualizó la Stack existente `iac-oc` (ID 33, endpoint Docker 3) mediante su
API administrativa, conservando el volumen SQLite `configuration`, el bind
readonly del keyring, `proxy_network`, TLS, límites y ausencia de puertos
publicados.

- `IACOC_IMAGE_DIGEST` quedó en el digest publicado sin prefijo `sha256:`.
- `IACP_ALLOWED_TARGETS` quedó con la política exacta solicitada.
- Se eliminó `DATA_MODE: MOCK` del Compose empresarial; el runtime es real.
- `LIVE_ENABLED` y la ruta del keyring existente se conservaron sin cambios.
- `PullImage=true`, recreación correcta y contenedor saludable verificados.

Estado final observado: `iacoc-web` en ejecución y saludable, imagen por
digest, `published_ports={}`, health público `{"status":"ok","application":"iacoc"}`.

## Validación

- `./scripts/validate.sh`: manifiesto Portainer, lint, Svelte check, build,
  artefacto de producción, 212 unitarias/integración y Playwright 36/36 PASS.
- La matriz Playwright incluye el caso histórico número 32 y el ciclo
  contractual de 20 ciclos CRM.
- `./scripts/validate-persistence.sh`: persistencia de sesiones, credenciales
  cifradas, intenciones, auditoría y esquema SQLite PASS.
- Las pruebas Playwright y unitarias usan fixtures aislados de test; no son una
  certificación de mutaciones reales en IACP/Proxmox y no se crearon VMs ni se
  modificaron esos servicios durante esta entrega.

El token administrativo de Portainer se recibió por el canal de la sesión y no
se registró en el repositorio, la imagen ni la configuración de IaCoC. Como fue
compartido durante la operación, debe revocarse y reemplazarse al cerrar la
ventana de despliegue.
