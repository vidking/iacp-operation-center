# IaCoC 0.6.3-rc.13 — ControlPlaneV2 idempotente

## Causa raíz

La confirmación single-tenant tenía dos estados de UI: el lector superior y
`AdvancedConnections`. Además, cada validación exitosa de ControlPlaneV2 volvía
a guardar `scopeConfirmed=false`, y la activación siempre intentaba reconstruir
la confirmación. Por eso una segunda pulsación de «Conectar» podía reiniciar el
checkbox o volver a mostrar `SINGLE_TENANT_CONFIRMATION_REQUIRED`.

ControlPlaneV2 no publica `tenant_id`, dependencias ni heartbeat. Esos campos
son evidencia desconocida/no publicada, no una caída ni un error contractual.

## Cambio implementado

- El lector superior es la única fuente de estado de confirmación; las
  conexiones avanzadas delegan en él y enfocan la confirmación pendiente.
- La confirmación visible es única y usa exactamente el texto aprobado:
  `Confirmo que este endpoint representa el único alcance remoto autorizado`.
- El botón envía exactamente:
  `{ "action": "activate", "confirmSingleTenant": true }`.
- La activación persiste `scopeConfirmed=true`, selecciona la conexión, fija
  `LIVE`, actualiza la página y muestra:
  `Alcance single-tenant confirmado. La conexión quedó activa`.
- Una confirmación existente se conserva durante validaciones repetidas con la
  misma credencial, endpoint y contrato. Cambiar cualquiera de esos elementos
  exige confirmar de nuevo.
- La activación repetida es idempotente y permite alternar varias conexiones
  ControlPlaneV2 conservando una sola conexión activa.
- `tenant_id`, dependencias, capacidad y liveness no publicados se muestran
  como `No publicado`/`Desconocido`.

## Aplicación publicada

- Commit: `97a7636edfc3f6fcb88d3f071e11e7d5e5068967`.
- Versión: `0.6.3-rc.13`.
- Plataforma: `linux/amd64`.
- Imagen OCI:
  `scm.cyberfuel.com/cyberfuel/iacp-operation-center@sha256:2076e0665fc753fa6a9c88dd99f942e414cde09b87462857c5f4a96db10d1b59`.
- Portainer: Stack `iac-oc`, ID `33`, endpoint Docker `3`; se actualizó solo
  `IACOC_IMAGE_DIGEST`, con `PullImage=true` y `Prune=false`. El contenedor
  quedó `running (healthy)` sin puertos publicados.
- Health público: `{"status":"ok","application":"iacoc"}`.
- La raíz HTTPS devuelve `303` a `/login` con `Strict-Transport-Security`,
  `X-Frame-Options: DENY` y `X-Content-Type-Options: nosniff`.

## Archivos funcionales y pruebas

Se modificaron el servicio de conexiones, el lector de administración,
`AdvancedConnections`, los indicadores de campos no publicados, la versión y
los fixtures aislados de pruebas. Se agregaron pruebas unitarias y E2E para:

- descubrimiento/validación ControlPlaneV2;
- una única confirmación visible y payload exacto;
- persistencia de `scopeConfirmed`, selección activa y modo `LIVE`;
- repetición idempotente y varias conexiones alternables;
- no reiniciar el checkbox al pulsar «Conectar»;
- invalidación por cambio de credencial, endpoint o contrato;
- dependencias, tenant y liveness no publicados tratados como desconocidos.

Validaciones ejecutadas exclusivamente dentro de Docker:

- `./scripts/validate.sh`: PASS; lint, Svelte check sin diagnósticos, 215
  pruebas unitarias/integración, build, verificación del artefacto y 37/37
  escenarios Playwright.
- `./scripts/validate-persistence.sh`: PASS; persistieron sesión, conexiones
  cifradas, diagnósticos, auditoría, registros CRM y esquema SQLite después de
  recrear el contenedor.
- `git diff --check`: PASS.

## Límites restantes

Las pruebas usan fixtures aislados y no sustituyen una validación con un Bearer
real de IACP/ControlPlaneV2. El usuario debe introducir ese acceso desde la GUI
autenticada y probar la conexión real; no se incluyó ningún secreto en el
repositorio, imagen o Stack. La automatización de navegador empresarial no
estuvo disponible en esta sesión, por lo que se verificaron health/TLS y el
estado de Portainer por API, no un screenshot de la GUI real.

No se modificaron ControlPlaneV1/V2, IACP, CRM, Proxmox, Traefik ni otros
servicios. El token administrativo de Portainer no se registró; al haber sido
compartido durante la operación, debe revocarse y reemplazarse al cerrar la
ventana de despliegue.
