# IaCoC — aceptación E2E de 20 KVM

Fecha de ejecución: 2026-10-27 (America/Costa_Rica)

Estado: **BLOQUEADO — 0/20 PASS**

Este informe distingue la validación del consumidor IaCoC de la aceptación empresarial
del aprovisionamiento. No se ejecutaron nuevas mutaciones después del primer resultado
incierto y no se tocaron IACP, Traefik, Proxmox, Terraform, Golden Images, Portainer,
Jira ni recursos preexistentes.

## Resultado ejecutivo

IaCoC sí llegó desde Chromium al BFF y obtuvo una admisión local `202`; el cliente envió
el payload comercial esperado y recibió identificadores de IACP. La ejecución posterior
falló en IACP con `PROVISIONING_COMMAND_FAILED` y quedó `normalized_status=uncertain`.
No existe una instancia materializada acreditada: `vmid=null`, `node=null` y
`infrastructure_kind=unprovisioned`. Por lo tanto, no se inició lifecycle ni se emitió
una segunda creación.

## Evidencia real sanitizada

- Intent local: `aca275ee-9e0a-4a0d-b863-ab2ad101c94f`.
- Instance ID: `fdc579be-6746-47df-b381-b7c0bc6f16dd`.
- Operation ID: `90a81326-39b7-4283-b76b-10c55bd33473`.
- Correlation ID de eventos: `6b698b24-cc29-4075-a395-6fa9763f64d4`.
- IACP: instancia `failed`, operación `failed`, estado normalizado `uncertain`.
- Evento final: `provisioning_apply_uncertain` (evento `2741`).
- Payload CRM: `plan_id=kvm-1`, `image_id=ubuntu-2404`, `network=lab-dhcp`,
  `start_on_create=false`; no incluyó overrides técnicos.
- Solicitud CRM → BFF: `202`; el fallo ocurrió durante el procesamiento posterior de
  IACP, no en la validación del formulario.

El intento anterior `367e44be-116f-464c-b96b-7b9ef2c77cfb` se conserva como incierto y
no fue repetido automáticamente.

## Matriz de las 20 KVM

| # | Sistema solicitado | Nombre previsto | Resultado | Motivo |
|---:|---|---|---|---|
| 1 | Ubuntu 24.04 | `iacoc-e2e-u2404-01` | BLOCKED | El primer aprovisionamiento real terminó incierto en IACP; no se ejecutó lifecycle. |
| 2 | Ubuntu 24.04 | `iacoc-e2e-u2404-02` | NOT RUN | Guard de mutaciones por resultado incierto anterior. |
| 3 | Ubuntu 24.04 | `iacoc-e2e-u2404-03` | NOT RUN | Guard de mutaciones por resultado incierto anterior. |
| 4 | Ubuntu 24.04 | `iacoc-e2e-u2404-04` | NOT RUN | Guard de mutaciones por resultado incierto anterior. |
| 5 | Ubuntu 24.04 | `iacoc-e2e-u2404-05` | NOT RUN | Guard de mutaciones por resultado incierto anterior. |
| 6 | Ubuntu 26.x | `iacoc-e2e-u26xx-01` | NOT RUN | Versión efectiva pendiente de ejecución; no se inventó `image_id`. |
| 7 | Ubuntu 26.x | `iacoc-e2e-u26xx-02` | NOT RUN | Guard de mutaciones por resultado incierto anterior. |
| 8 | Ubuntu 26.x | `iacoc-e2e-u26xx-03` | NOT RUN | Guard de mutaciones por resultado incierto anterior. |
| 9 | Ubuntu 26.x | `iacoc-e2e-u26xx-04` | NOT RUN | Guard de mutaciones por resultado incierto anterior. |
| 10 | Ubuntu 26.x | `iacoc-e2e-u26xx-05` | NOT RUN | Guard de mutaciones por resultado incierto anterior. |
| 11 | AlmaLinux 9 | `iacoc-e2e-alma9-01` | NOT RUN | Catálogo/imagen no se usaron para una mutación adicional. |
| 12 | AlmaLinux 9 | `iacoc-e2e-alma9-02` | NOT RUN | Guard de mutaciones por resultado incierto anterior. |
| 13 | AlmaLinux 9 | `iacoc-e2e-alma9-03` | NOT RUN | Guard de mutaciones por resultado incierto anterior. |
| 14 | AlmaLinux 9 | `iacoc-e2e-alma9-04` | NOT RUN | Guard de mutaciones por resultado incierto anterior. |
| 15 | AlmaLinux 9 | `iacoc-e2e-alma9-05` | NOT RUN | Guard de mutaciones por resultado incierto anterior. |
| 16 | AlmaLinux 10 | `iacoc-e2e-alma10-01` | NOT RUN | Catálogo/imagen no se usaron para una mutación adicional. |
| 17 | AlmaLinux 10 | `iacoc-e2e-alma10-02` | NOT RUN | Guard de mutaciones por resultado incierto anterior. |
| 18 | AlmaLinux 10 | `iacoc-e2e-alma10-03` | NOT RUN | Guard de mutaciones por resultado incierto anterior. |
| 19 | AlmaLinux 10 | `iacoc-e2e-alma10-04` | NOT RUN | Guard de mutaciones por resultado incierto anterior. |
| 20 | AlmaLinux 10 | `iacoc-e2e-alma10-05` | NOT RUN | Guard de mutaciones por resultado incierto anterior. |

Resumen: `PASS=0`, `FAIL=0`, `BLOCKED=1`, `NOT RUN=19`.

## Validación de IaCoC

La prueba real verificó el recorrido Chromium → CRM → `/api/crm/commands` → BFF →
cliente HTTP IACP. Se observaron catálogo `200`, admisión `202`, polling de operación
`200` y persistencia del diagnóstico upstream. El payload no incluyó CPU model, NUMA,
firmware, controladoras, bridges ni otros overrides.

El cambio local conserva diagnósticos HTTP sanitizados, correlación, duración y detalle
seguro en el intent; la paginación incremental de Events recorre hasta el tail con
deduplicación y protección contra cursor detenido. Un estado incierto no reintenta ni
continúa lifecycle automáticamente.

La validación de contrato y fixtures cubre las rutas de creación/lifecycle, idempotencia,
errores upstream, persistencia y estados. Esto es **IaCoC PASS de consumidor**, no
aceptación empresarial E2E.

## QA ejecutado

- 183 pruebas unitarias/integración: PASS.
- 23 pruebas Chromium/Playwright: PASS.
- Prettier: PASS.
- Svelte check: PASS.
- Build de producción: PASS.
- Persistencia y recreación de contenedor: PASS.
- Compatibilidad SQLite: PASS.
- Manifest de Portainer: PASS.
- `git diff --check`: PASS.

## Bloqueo externo y siguiente condición

IACP debe reconciliar o resolver el registro de aprovisionamiento incierto antes de
emitir otro POST. El health check actual del API respondió, pero la evidencia disponible
no acredita que el intento fallido haya llegado a una VM materializada. IaCoC no tiene
autoridad para corregir ese estado ni debe forzar una eliminación.

La aceptación 20/20 solo puede reanudarse después de una conciliación autoritativa y de
una nueva corrida explícitamente autorizada. Este informe no declara lifecycle, hardware
ni eliminación para la primera instancia.

