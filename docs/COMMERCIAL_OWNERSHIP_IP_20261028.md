# CRM comercial — ownership, red y lifecycle

## Alcance

Esta comprobación se realizó sobre IaCoC exclusivamente. Las consultas al
Control Plane fueron lecturas autenticadas dentro de Docker; no se enviaron
creaciones, comandos de energía, eliminaciones ni solicitudes de red. VM 30059
y VM 30060 permanecieron intactas.

## Evidencia real de IACP

La conexión Bearer consultada publicó el tenant
`00000000-0000-0000-0000-000000000001`. Las lecturas utilizadas fueron:

- `GET /openapi.json`: contrato público disponible.
- `GET /v1/observability`: `active_operations=0`, `uncertain_operations=0`.
- `GET /v1/instances/{instance_id}`.
- `GET /v1/instances/{instance_id}/power`.
- `GET /v1/operations?instance_id=...&limit=50&offset=0`.

Resultados relevantes:

| Instancia                              | VMID / nodo     | Provisión       | Energía   | Mutaciones | Diagnóstico IACP                       |
| -------------------------------------- | --------------- | --------------- | --------- | ---------- | -------------------------------------- |
| `d0437eb6-ef34-454f-93c8-6402a9396d35` | 30059 / `mng01` | `ready` / `kvm` | `running` | `false`    | `COMMERCIAL_OWNERSHIP_BINDING_CHANGED` |
| `9ea54de9-c263-4206-933e-2e652e48cc10` | 30060 / `mng01` | `ready` / `kvm` | `running` | `false`    | `COMMERCIAL_OWNERSHIP_BINDING_CHANGED` |

El código aparece directamente en el campo contractual `blocked_reason` de la
respuesta de energía. IaCoC no lo traduce desde una política local ni lo
suprime. Por tanto, no es seguro habilitar start, shutdown, reboot o delete
hasta que IACP confirme nuevamente la vinculación comercial.

Ambas instancias pertenecen al tenant observado. Las operaciones históricas
publican `requested_by=bootstrap`; esa identidad no se reutilizó ni se usó
para operar desde IaCoC.

## Red e IP

En ambas respuestas:

- `ip_addresses=[]`.
- `network_observation.status=pending`.
- `network_observation.reason=GUEST_INITIALIZATION_REQUIRED`.
- `network_observation.ip_addresses=[]`.

Las direcciones vistas fuera de la API no se incorporan al cliente. IaCoC solo
presenta `ip_addresses` y `network_observation.ip_addresses` publicados por
IACP, junto con estado, motivo y momento de observación cuando estén
disponibles.

La GUI conserva la acción `Descubrir IP` únicamente si el endpoint está
publicado por el OpenAPI y la instancia es elegible. La operación se sigue y
la instancia se vuelve a leer; no se ejecuta automáticamente ni se consulta
Proxmox.

## Correcciones de IaCoC

- El detalle comercial muestra explícitamente
  `COMMERCIAL_OWNERSHIP_BINDING_CHANGED` y mantiene bloqueadas las mutaciones
  cuando IACP publica `mutations_available=false`.
- El BFF conserva el código upstream como diagnóstico seguro al rechazar una
  acción por la evidencia de energía.
- La evidencia de red conserva `status` y `reason` cuando la dirección todavía
  no fue publicada.
- Una operación de inicialización fallida ya no deshabilita permanentemente
  la acción: solo se bloquea mientras la inicialización está `queued`,
  `running` o `uncertain`.
- Fulfillment, inicialización y eliminación activas se consideran actividad
  vigente; una entrada histórica terminal no bloquea el lifecycle por sí sola.
- No se reintrodujeron políticas de laboratorio, cuotas, umbrales de VMID ni
  credenciales adicionales.

## Validación

Ejecutado dentro de Docker:

- 195 pruebas unitarias/integración: PASS.
- 27 pruebas Chromium/Playwright: PASS.
- 20 ciclos contractuales: PASS.
- Prettier: PASS.
- Svelte check: PASS, sin errores ni advertencias.
- Build de producción y verificación del artefacto: PASS.
- Persistencia SQLite/keyring, recreación e intents inciertos: PASS.
- Compose empresarial: PASS.

La evidencia contractual no equivale a un lifecycle real sobre estas dos
instancias. No se hizo ninguna mutación real durante esta corrección.

## Estado de aceptación

IaCoC consume correctamente el contrato comercial, conserva la autoridad de
IACP y representa el bloqueo de ownership sin falsificar capacidades. La
resolución de `COMMERCIAL_OWNERSHIP_BINDING_CHANGED` requiere una corrección o
reconciliación en IACP; no debe sortearse desde IaCoC.
