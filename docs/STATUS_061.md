# IaCoC 0.6.1 — estado publicado y E2E bloqueado

Base conservada: 0.6.0, con IaCoC 0.6.1 publicada en Forgejo. HEAD de la imagen `097e07d9b5d4df5e1daae6eead7382b8e437b2bc`; digest OCI `sha256:c9eeefe0773a9c90c8d098c0046af5bf8f0fd4ef9ab3c4865307d9a46b97829c`. No hubo despliegue empresarial ni modificación de IACP, Proxmox, Golden Images, Portainer o VM 30029.

## Implementación

- Incidents: lista paginada derivada de operaciones, filtros de página/CR, contadores con alcance, detalle, hipótesis separadas de evidencia confirmada, eventos/correlaciones y enlaces a Operations/Events/CRM/exportación.
- Estado actual de instancia separado del fallo histórico; `deleted` cierra la atención y elimina opciones de recuperación. La operación fallida original no se reescribe.
- Reconciliación por endpoint real: requiere Administrator local, identidad operator separada, contrato publicado, incertidumbre y recovery_required explícitos, identidad del recurso y timestamps vigentes; revalidación backend justo antes de enviar, journal idempotente y auditoría. No existe retry genérico, force ni ejecutor alterno.
- CRM conserva catálogo real y creación comercial. Tarjetas reutilizan estilos existentes. Motivos de controles inactivos, enlace de configuración operator y estados de entrega/operaciones en curso. Actualización al cerrar operación y cancelación de lecturas obsoletas al cambiar pestaña.
- API Connections expone autenticación/tenant y componentes de salud, separados de disponibilidad de dependencias. Credenciales cifradas y contratos de permisos existentes conservados; no se inventa introspección de roles.
- Operations: orden por fecha, acceso directo UUID, filtros server-side por instancia/estado persistido y navegación a la última página mediante búsqueda binaria de offsets. No descarga todo el historial. El estado normalizado y búsquedas de texto/tipo son filtros de página, explícitos.
- Consultas GET concurrentes compartidas por identidad/origen/ruta, sin cache persistente ni reintentos de comandos; catálogo/detalle paralelizados. Server-Timing mide BFF. El reloj local CR no hace consultas.
- Workers: corregido el literal `:else}`; telemetría sigue no instrumentada. No se infieren workers vivos ni colas.

## Cobertura ampliada de API

Contrato actual leído por HTTPS autenticado y contrastado con Forgejo. [Matriz de los 28 endpoints](API_COVERAGE_061.md), con roles, GUI, pruebas, evidencia real y exclusiones justificadas. Tipos y rutas generados offline desde OpenAPI (38 tipos / 28 operaciones); las acciones de infraestructura se resuelven por operationId y continúan pasando por el transporte seguro existente.

Se completaron en GUI/BFF descubrimiento de IP, verificación de acceso, inicialización autorizada, continuación de la misma solicitud y reintento de planificación con expected_attempt publicado y confirmación. Referencias de trabajo/política son de lectura; red estática solo se ofrece si el perfil está publicado y habilitado. Referencias comerciales order_id/product_id no crean billing ni otra base de clientes. Estas ampliaciones están validadas localmente; no se ejecutaron nuevas mutaciones reales para acreditarlas.

## Auditoría de hardware y limpieza

[Auditoría VM 30030](IACP_CPU_DISCREPANCY_30030.md): IaCoC emitió plan kvm-1 / imagen ubuntu-2404; sin cpu_model/cpu_type/NUMA/BIOS/Q35/template_id. El body original con contraseña no se conservó; se entrega reconstrucción saneada con sus límites probatorios. No se forzó otro modelo CPU.

| VMID  | Resultado verificado por IACP                                            | Operación                                      |
| ----- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| 30028 | Ya deleted; ninguna nueva mutación                                       | 99291c2e-736b-4c79-b30c-8d52bf2de47e histórica |
| 30030 | DELETE completed, deletion.phase=deleted; instancia deleted              | f07d8d68-7896-45fe-a81f-365b7530327c           |
| 30029 | DELETE failed, APPROVED_POSTCONDITION_MISMATCH; última lectura aún ready | 4b87c197-7fbd-4b77-9057-c25d26f69f84           |

La lectura final fue 2026-10-26T07:53:57.584Z. El usuario asumió después la eliminación manual de 30029: no se reintentó ni se afirma su estado actual. Ambas instancias estaban stopped al solicitar DELETE, por lo que no se enviaron apagados adicionales en la limpieza. No hubo force, acceso nativo a Proxmox ni cambios de cuotas.

Evidencia preservada en [evidence/061](evidence/061): inventario, reportes previos/posteriores, eventos de borrado, capturas de instancia/diagnóstico y regresión de incidentes desktop/mobile. La ausencia del recurso 30030 se acredita mediante el resultado de IACP; no se presenta como inspección independiente de Proxmox.

## Validación real frente a validación local

En GUI real local conectada a IACP: reader de finalidad observación y operator configurados, catálogo de cuatro productos, creación admitida, incertidumbre PROXMOX_OBSERVATION_FAILED, reconciliación del mismo UUID completada y DELETE autorizado de 30030 completado. Un apagado anterior fue rechazado INSTANCE_BUSY durante la inicialización. No se acredita un ciclo completo de start/shutdown/reboot en 0.6.1 ni conformidad de hardware. La discrepancia de CPU y la postcondición de 30029 requieren investigación del frente IACP.

Medición de catálogo con cuatro planes habilitados: aproximadamente 6,1 s en 0.6.0 y 3,7–3,8 s con las correcciones. No se comparan como equivalentes las consultas posteriores donde IACP publicó indisponibilidad. Los tiempos de inventario antiguos no midieron la finalización de la respuesta y no se presentan como mejora. Mediciones de recursos GET y BFF están separadas de readiness de infraestructura.

Pruebas aisladas: **169 unitarias/integración y 18 Chromium aprobadas**, Svelte/TypeScript sin errores ni advertencias, build completado. Ejecución con Docker --network none; solo dobles para infraestructura. Revisar VALIDATION_061.md para comprobaciones finales y persistencia.

## Publicación

Versión publicada 0.6.1 en `main` mediante los commits `a4e2c19` y `097e07d`. Portainer no fue actualizado. La release empresarial y nueva creación real quedan pendientes de aclarar la discrepancia de configuración y completar la aceptación; publicar la imagen no habilita el E2E.

Compose completos: [desarrollo/tests](../docker-compose.yml), [producción local](../docker-compose.production.yml), [empresarial sin cambios](../deploy/portainer/docker-compose.yml). Tests Compose sin red externa. Se conserva SQLite schema v1, conexiones, sesiones, AAD y keyring; no hay migración destructiva. Upgrade/rollback conservan volúmenes; no ejecutar bootstrap o init-key en instalaciones existentes. El rollback de referencia sigue siendo el digest 0.6.0 documentado en RELEASE_060.md.
