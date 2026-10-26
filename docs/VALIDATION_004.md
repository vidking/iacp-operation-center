# Validación Iteración 004 · IaCoC 0.4.0

Aplicación base: 08813f7. Código IACP inspeccionado en modo lectura: 2b0c065, contrato 0.10.1. No se ejecutaron procesos Node ni instalaciones/builds del proyecto en el host.

## Evidencia local realmente ejecutada

| Control                         | Resultado                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| scripts/validate.sh             | Exit 0: checks Docker/Compose, lint, typecheck, unitarias, build y navegador                             |
| Vitest                          | 56 pruebas aprobadas en cinco archivos                                                                   |
| Playwright                      | 19 pruebas aprobadas                                                                                     |
| Typecheck                       | 0 errores, 0 advertencias                                                                                |
| Lint Prettier                   | Correcto, repetido tras documentación                                                                    |
| Build producción                | Correcto con adapter-node                                                                                |
| scripts/validate-persistence.sh | Exit 0; sesión, configuración, diagnóstico por endpoint, auditoría y descifrado conservados tras recrear |
| Flujo LIVE desktop/mobile       | Prueba dedicada repetida correctamente para revisar captura y límites del panel móvil a 390px            |
| Manifiesto empresarial          | Validación estructural correcta; no se modifica ni despliega                                             |
| Secrets / compatibilidad        | Revisar diff y patrones antes de commit; sin cambios destructivos de esquema ni AAD                      |

Cobertura añadida: espacio local administrador distinto de tenant remoto; descubrimiento autenticado sin asociación implícita; confirmación explícita de LIVE; rechazo de alcance diferente tras rotación; invalidación de snapshot tras revocación; conservación de conexión antigua cifrada; aislamiento por espacio local; importación de acceso privado provisionado y prohibición para otro espacio; ausencia de credencial y RBAC.

El navegador prueba: autorización inicial con un solo campo, configuración técnica plegada, asociación sin UUID en la pantalla principal, LIVE con operaciones/eventos y detalle consultado al backend, métricas sin instrumentación en unknown, señales verificables de incidentes, MOCK→LIVE→MOCK conservando acceso, sesiones, Viewer/Operator sin administración, revocación sin datos cacheados y rechazo de otro alcance. Las pruebas existentes de autenticación, CSRF, DNS/TLS/SSRF y navegación continúan pasando.

El primer pase detectó errores de compilación durante la edición y dos aserciones de navegador desactualizadas/ambiguas. Se corrigieron y la suite completa final pasó. No se ocultan fallos pendientes.

## Qué representa la prueba de LIVE

El servidor Playwright 4176 usa un doble de IACP mediante un hook Node exclusivamente de pruebas. Conserva API/backend, sesiones, cifrado, RBAC y flujo de asociación reales de IaCoC, pero sus respuestas IACP son sintéticas. El hook vive en scripts/test-upstream-loader.mjs y el proveedor en scripts/test-upstream.mjs; no se copian a la imagen production, no están activados por el entrypoint normal ni modifican archivos del build. Las pruebas de transporte ejercitan TLS/DNS pinning separadamente.

Esta prueba NO acredita la autenticación contra https://iac.cyberfuel.com ni convierte fixtures en evidencia empresarial. El usuario confirmó que no hay una credencial reader autorizada disponible para la sesión. No se realizó un probe empresarial con credenciales ajenas, bootstrap o hashes del registro.

## Estado empresarial y publicación

La Stack iacoc y su configuración/volúmenes/keyring permanecen intactos. El estado desplegado fue reportado por el usuario como MOCK con 401; esta sesión no lo cambia ni afirma haberlo conectado.

Commit/revisión e imagen se informan al cerrar la entrega. La publicación de la aplicación no acredita LIVE. Para actualizar Portainer usar el digest revisado de la imagen, conservar los mounts y guardar el digest anterior para rollback. El procedimiento, la limitación de emisión reader y el cambio mínimo propuesto en IACP están en ITERATION_004.md.

SQLite nativo de Node 22 mantiene su advertencia experimental conocida. No hay nuevas dependencias. No se instalaron componentes empresariales ni se modificó IACP, VM 104, Proxmox, CRM o Jira.
