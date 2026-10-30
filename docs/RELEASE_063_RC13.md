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
- Los reportes confirmados de versiones anteriores que aún no tenían
  `createRef` se migran conservando la confirmación; no se fuerza una nueva
  interacción solo por actualizar IaCoC.
- `tenant_id`, dependencias, capacidad y liveness no publicados se muestran
  como `No publicado`/`Desconocido`.
- Cuando la conexión ya está activa pero la evidencia V2 es incompleta, la UI
  muestra `Conexión activa · evidencia parcial`; conserva `unknown` como estado
  técnico y explica que IACP no publicó dependencias o liveness suficientes.

## Aplicación publicada

- Commits funcionales: `97a7636edfc3f6fcb88d3f071e11e7d5e5068967` y
  `3d2a05e303e9e71771b5eaa01ee11eb3f597394a`, más el ajuste de presentación
  `2ac0c023bc08cffcec2365a6a0ce80df20acdec8`.
- Versión: `0.6.3-rc.13`.
- Plataforma: `linux/amd64`.
- Imagen OCI:
  `scm.cyberfuel.com/cyberfuel/iacp-operation-center@sha256:bd63996aace994ab78e7ff3f74f288734278409910f7c44e99665d73f873625a`.
- El digest nuevo se publicó y se verificó con pull `linux/amd64`. Portainer no
  se actualizó en esta tarea; la Stack `iac-oc` conserva el digest anterior
  `696430772c051250c2ee0ee4e4173f1c9a5cf55ffeaa61386a873d0602b2919e` hasta
  una ventana explícita del operador.

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

- `./scripts/validate.sh`: PASS; lint, Svelte check sin diagnósticos, 216
  pruebas unitarias/integración, build, verificación del artefacto y 37/37
  escenarios Playwright.
- `./scripts/validate-persistence.sh`: PASS; persistieron sesión, conexiones
  cifradas, diagnósticos, auditoría, registros CRM y esquema SQLite después de
  recrear el contenedor.
- `git diff --check`: PASS.

## Límites restantes

La validación real de ControlPlaneV2 se ejecutó como lectura autorizada: health,
OpenAPI, observabilidad, catálogo, inventario, operaciones y eventos pasaron por
el adaptador; la activación de IaCoC quedó `scopeConfirmed=true`, seleccionada y
en modo `LIVE`. No se enviaron mutaciones a ControlPlaneV2/IACP. La evidencia V2
real no publica `tenant_id`, dependencias ni liveness, por lo que IaCoC conserva
esos valores como desconocidos.

La imagen nueva aún no está aplicada en Portainer por la restricción de esta
tarea. No se incluyó ningún secreto en el repositorio, la imagen ni la Stack.
El Bearer compartido durante la operación debe revocarse y reemplazarse.

No se modificaron ControlPlaneV1/V2, IACP, CRM, Proxmox, Traefik ni otros
servicios. El token administrativo de Portainer no se registró; al haber sido
compartido durante la operación, debe revocarse y reemplazarse al cerrar la
ventana de despliegue.
