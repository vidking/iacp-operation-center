# Validación IaCoC 0.6.0

Las cuotas históricas de LAB están resueltas en IACP. No se usan como prerrequisito, validación ni impedimento en IaCoC. Las evidencias siguientes distinguen software local, solicitudes reales y resultado de infraestructura.

## Software local

Última suite Docker comprobada durante el cierre: **110 pruebas unitarias y 16 pruebas Chromium**, todas aprobadas. Tipos Svelte/TypeScript sin errores ni advertencias. Cubre creación repetida con claves independientes, ausência de cálculos locales de cuota, idempotencia, duplicados concurrentes, errores autenticados y de red, estados inciertos sin reenvío, RBAC, tenant, secretos, CSRF/SSRF, reporte JSON, eventos, actualización con backoff y fechas cercanas a medianoche.

El recorrido de navegador prueba creación → inventario → start → reboot → shutdown → DELETE → nueva creación. El contrato comercial se prueba con planes/imágenes publicados por el doble, cuerpo CommercialInstanceCreate y lifecycle sin exigir políticas históricas. Los dobles viven en tests/scripts de test y no se copian al runtime final.

El timeout anterior fue un locator exacto cuyo nombre accesible incluía ayuda. Se corrigió la selección y otras expectativas sobre conexión sin filas y roles status simultáneos. La prueba completa tarda segundos; no se ocultó aumentando indiscriminadamente su timeout. Se añadieron búsqueda/filtro/paginación de inventario, paginación de Operations, ventanas solapadas de Events y exportación de evidencia.

## Integración real: creación enviada por la GUI

26/10/2026 06:38:43–06:39:18 UTC (00:38:43–00:39:18 CST): desde una instancia Docker local aislada de IaCoC, con IACP real en https://iac.cyberfuel.com, TLS validado, DNS fijado e identidades registradas por Administration → API Connections.

Las identidades seleccionadas fueron lab-operation-center (operator, administration=false) para lifecycle y lab-swagger-postman (otra identidad operator del mismo tenant, utilizada exclusivamente para GET) para observación. Sus valores se pasaron por stdin y por la GUI; nunca por argumentos, Git, logs o builds. No se usó bootstrap ni administración global. Un reader dedicado al tenant sigue siendo la opción de privilegio mínimo cuando IACP lo entregue.

El catálogo real publicó **kvm-1, kvm-2, kvm-3 y kvm-4 disponibles**, sin filtros locales. La GUI envió una creación auténtica con una nueva clave de idempotencia y obtuvo:

| Evidencia                                | Valor                                |
| ---------------------------------------- | ------------------------------------ |
| Nombre nuevo de prueba                   | iacoc-e2e-060-mvovyeij-a             |
| Clave de intención                       | 1d6f8eb1-09da-4b02-a40d-3be0c3452a40 |
| Instance ID                              | a5318da2-79bd-485f-b334-79ba739f3666 |
| Operation ID                             | 4c510abe-cda4-4cb7-a0df-6361ab9372b4 |
| Actor                                    | lab-operation-center                 |
| Admisión                                 | aceptada por IACP                    |
| Estado persistido final observado        | failed                               |
| Estado normalizado observado             | uncertain                            |
| Código efectivo                          | PROXMOX_OBSERVATION_FAILED           |
| VMID / nodo / infraestructura observados | null / null / unprovisioned          |

Se observaron eventos reales commercial_accepted, provisioning_plan_started, provisioning_planned, provisioning_apply_approved, provisioning_apply_queued, provisioning_apply_started, provisioning_mutation_started y provisioning_apply_uncertain. El actor worker:provisioning acredita esa actividad histórica, no un worker vivo identificado ni heartbeat.

La creación no se repitió. Se solicitó una reconciliación manual por observación desde la GUI sobre el mismo UUID y operación; IACP pasó failed/running → completed/completed, sin nueva VM ni nuevo Apply desde IaCoC. Luego publicó VMID **30028**, nodo **mng01**, infraestructura **kvm**, entrega **verified**, energía running y acceso completed.

| Acción real                           | Operation ID                                           | Resultado acreditado         |
| ------------------------------------- | ------------------------------------------------------ | ---------------------------- |
| Reconciliar por observación           | 4c510abe-cda4-4cb7-a0df-6361ab9372b4 (misma operación) | completed; misma instancia   |
| Apagar normalmente                    | 90e30169-3144-46db-b9cc-4288a59e0e5b                   | completed                    |
| Encender                              | c730930d-1325-4f0f-ba14-b30f285054fe                   | completed                    |
| Reiniciar                             | 1869769b-cfed-4101-97a5-7a6ecd77256c                   | failed, POWER_ACPI_TIMEOUT   |
| Apagar normalmente para cerrar prueba | 1655bf87-3f99-4dd6-9bb6-5fc455ad9a22                   | completed                    |
| Eliminar con nombre/UUID confirmados  | 99291c2e-736b-4c79-b30c-8d52bf2de47e                   | completed; instancia deleted |

Las capturas aportadas por el usuario acreditan que el task qmreboot de VM 30028 en mng01 informó Guest Agent sin respuesta y timeout de quit/powerdown (00:48:02–00:49:05 CST). El BFF reflejó el error de IACP, sin simular reboot completado ni usar force-stop. El encendido previo no acreditaba que Guest Agent estuviera listo tras ese nuevo arranque.

La KVM nueva de prueba fue apagada normalmente y eliminada exclusivamente mediante IACP. No se tocaron recursos anteriores. El recorrido real prueba creación, recuperación por observación, invitado verificado, inventario, apagado, encendido, diagnóstico de reboot y eliminación; **no certifica reboot exitoso**. El segundo aprovisionamiento intencional se valida localmente con claves nuevas y planes diferentes; no se presenta como otra KVM real creada durante este recorrido. La observabilidad de worker liveness/colas continúa pendiente de contrato.

La evidencia JSON proyectada está en docs/evidence/060: resultado inicial incierto y ciclo antes de DELETE. Son capturas temporales de auditoría, no estado actual ni fixtures runtime.

La GUI exportó un reporte autenticado de esa instancia y su operación con eventos, diagnóstico, UTC original y presentación America/Costa_Rica. No exporta contraseña, token, ciphertext, bodies de solicitud ni stderr. El journal persiste aceptación, clave, hash e identificadores separadamente del resultado asíncrono.

## Compatibilidad, secretos y límites

Se ejecutó `IACOC_UPGRADE_FROM=iacoc:0.5.0-local ./scripts/validate-persistence.sh`: upgrade 0.5.0→0.6.0 y recreación con usuarios, sesiones, conexiones, AAD/ciphertexts, diagnósticos y auditoría preservados. Otra recreación conserva una intención incierta y la credencial cifrada separada de lifecycle. El esquema mantiene user_version=1 con tabla adicional crm_intents.

`./scripts/validate.sh` comprende Docker build checks, revisión estructural Compose empresarial, Compose local, formato, tipos, unitarias, build, ausencia de fuentes sintéticas y Chromium. Las ejecuciones definitivas se registran en la publicación. Se revisan diff y valores exactos de las credenciales autorizadas sin imprimirlos. Los secretos de integración solo se guardan cifrados en volúmenes de validación separados del build.

No se modificó IACP, VM 104, VM 106, plantilla 29000, Proxmox directamente, Jira ni la Stack empresarial. No hay acceso a socket Docker/Redis/PostgreSQL desde IaCoC. La instrumentación de workers/colas y el vínculo comercial plan_id del inventario faltan en el contrato comprobado; ver IACP_INTEGRATION_REQUIREMENTS_060.md.
