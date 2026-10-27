# IaCoC — aceptación integral como consumidor de IACP

Fecha de ejecución: 27/10/2026 (America/Costa_Rica)

Esta evidencia corresponde a la rama `qa/iacoc-api-consumer-acceptance`, posterior a `v0.6.3-rc.5`. No modifica la release publicada ni acredita aprovisionamiento real en Proxmox.

## Resultado

| Alcance                             | Resultado             |
| ----------------------------------- | --------------------- |
| Chromium/Playwright sobre GUI CRM   | PASS                  |
| Simulador contractual aislado       | PASS                  |
| Matriz Ubuntu 24.04                 | 5/5                   |
| Matriz Ubuntu 26.04 (`ubuntu-2604`) | 5/5                   |
| Matriz AlmaLinux 9                  | 5/5                   |
| Matriz AlmaLinux 10                 | 5/5                   |
| Total de ciclos completos           | 20/20                 |
| Creaciones simuladas                | 20                    |
| Lifecycle simulados                 | 100 (5 por instancia) |
| Eliminaciones simuladas             | 20                    |
| Operaciones correlacionadas         | 140                   |
| Eventos correlacionados             | 280                   |
| Errores de consola                  | 0                     |
| Solicitudes fallidas                | 0                     |
| Mutaciones contra IACP empresarial  | 0                     |

Cada ciclo fue ejecutado por los controles reales del navegador: selección de plan e imagen, formulario comercial, `Crear KVM`, inventario, `Encender`, `Reiniciar`, `Apagar`, segundo `Encender`, segundo `Apagar` y eliminación confirmada. El simulador recibió las solicitudes desde el BFF y aplicó sus transiciones únicamente en respuesta a esas solicitudes.

La ejecución final dentro de la suite completa duró 6m 21s. La duración por ciclo osciló entre 3.592s y 6.988s, con promedio de 3.888s, sin contar el pacing de 15s entre ciclos. El pacing evita alcanzar el limitador defensivo de lectura de IaCoC (120 lecturas/minuto); no reintenta ni duplica mutaciones.

La evidencia JSON y las capturas se generan en el volumen Docker `iacoc-local_test_results`:

- `api-consumer-acceptance.json`: identificadores de operación/instancia, VMID simulado, estados, acciones y duraciones.
- `api-consumer-acceptance-first.png`: CRM revisado antes de la primera admisión.
- `api-consumer-acceptance-final.png`: Overview posterior a la matriz.

El estado final del simulador verificó 20 instancias con `deleted`, 140 comandos y 280 eventos. La persistencia del simulador no conserva contraseñas de acceso inicial.

## Contrato y rutas verificadas

El cliente usa el mapa generado en `src/lib/types/iacp.generated.ts` y `contractPath`; no construye rutas operativas arbitrarias. El simulador contractual implementa, en entorno de pruebas, las rutas necesarias para:

- `GET /openapi.json`, `/health/ready`, `/v1/plans`, `/v1/images`, `/v1/profiles`, `/v1/lab/policies`, `/v1/lab/usage`.
- `GET /v1/instances`, `/v1/instances/{instance_id}`, `/v1/instances/{instance_id}/power`.
- `GET /v1/operations`, `/v1/operations/{operation_id}`, `/v1/events?after=&limit=`.
- `POST /v1/instances`, acciones de energía publicadas por IACP y `DELETE` de instancia desechable.

Las solicitudes de creación conservan plan, imagen, red y parámetros comerciales; no se agregan CPU model, NUMA, firmware, BIOS, controladoras, bridges ni otros overrides técnicos. Los comandos usan claves de idempotencia nuevas y el simulador devuelve `operation_id`, `instance_id` y `job_id` según el esquema de admisión.

La prueba también verificó:

- Paginación incremental de Events con `after`, `next_after` y deduplicación por `event_id`.
- Operations consultadas por identificador y estados terminales `completed`/`deleted` reflejados en CRM.
- Ordenamiento temporal y presencia de `CST (UTC−06:00)` en Events/Overview.
- Navegación a Overview, Operations y Events sin recarga manual adicional.
- Ausencia de requests fallidas y errores de consola durante los 20 recorridos.

## Resiliencia y errores

La suite existente conserva regresiones para 401, 403, 409, 422, 429, 500, 502, 503, 504, timeout, conexión interrumpida, respuesta sin identificadores, respuesta perdida después de admisión, incertidumbre e idempotencia. La cobertura está distribuida principalmente entre `tests/transport.test.ts`, `tests/crm.test.ts`, `tests/states.test.ts`, `tests/connections.test.ts` y los escenarios Chromium de `tests/browser/connections.spec.ts`, `tests/browser/crm.spec.ts` y `tests/browser/incidents.spec.ts`.

Durante la preparación de esta aceptación apareció un HTTP 429 local al ejecutar cinco ciclos sin pausa. Se confirmó que provenía del límite defensivo `crm-read: 120/min`; se corrigió el runner agregando pacing entre ciclos, sin elevar ni eliminar el límite y sin reintentar comandos mutantes.

También se corrigieron dos defectos exclusivos de la prueba contractual: abrir el `<details>` de eliminación antes de llenar la confirmación y emitir en el simulador el valor de `service` permitido por `eventSchema`. No fue necesario modificar el BFF ni el cliente de producción.

## Lecturas reales de IACP

La validación empresarial de solo lectura anterior a esta rama comprobó desde Chromium/Docker el acceso a readiness, observabilidad, catálogo, inventario, operaciones, eventos y pantallas CRM/Operations/Events/Overview, sin POST, DELETE ni lifecycle. Esa evidencia no se mezcla con esta matriz: las 20 ejecuciones descritas aquí usan exclusivamente el simulador contractual aislado.

La aceptación real de aprovisionamiento en IACP/Proxmox continúa separada y no se declara PASS por este documento. El intento real anterior permanece sujeto a su conciliación y al fallo externo de aprovisionamiento ya documentado.

## Comandos reproducibles

```sh
# 20 ciclos contractuales desde Chromium; no toca IACP empresarial
ACCEPTANCE20_COUNT=5 docker compose run --rm -e ACCEPTANCE20_COUNT=5 \
  iacoc-tests npx playwright test \
  tests/browser/api-consumer-acceptance.spec.ts --workers=1

# Validación completa del repositorio dentro de Docker
./scripts/validate.sh
```

El servicio `iacoc-tests` usa `network_mode: none`; el servidor contractual se inicia dentro de ese servicio por Playwright y no existe en el runtime de producción. No hay conexión a Proxmox, Redis, Docker socket ni IACP empresarial en esta prueba.

## Estado de entrega

La validación final ejecutó `./scripts/validate.sh` con 183 unitarias, Svelte check limpio, build de producción y 24 pruebas Chromium PASS. `./scripts/validate-persistence.sh` también PASS: sesión, conexión cifrada, intent incierto, auditoría, keyring y SQLite sobrevivieron la recreación.

El cambio está en la rama independiente `qa/iacoc-api-consumer-acceptance`, commit `27203f0`, publicada en Forgejo. El enlace compare para abrir el Pull Request sin merge es:

`https://scm.cyberfuel.com/CyberFuel/iacp-operation-center/compare/main...qa/iacoc-api-consumer-acceptance`

La aceptación no publica OCI, no actualiza Portainer y no modifica IACP.
