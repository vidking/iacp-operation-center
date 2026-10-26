# Validación Iteración 003 · Asistente API

## Alcance

Aplicación de partida: commit 08409f62e86ec48f270a4ef4393c489d69407146; working tree limpio al iniciar. Se inspeccionaron el asistente anterior, servicios, transporte, RBAC, cifrado y contratos del repositorio vecino en modo lectura. Las seis secciones y el diseño general se conservan. Esta iteración queda sin commit, push ni publicación OCI para revisión.

La documentación IACP 0.10.1 identifica https://iac.cyberfuel.com y 192.168.1.50 como destino corporativo. El operador informa IaCoC funcionando por HTTPS; no se consultó el runtime empresarial para acreditarlo. No se utilizaron credenciales reales ni se modificaron la Stack, IACP, VM 104, Proxmox, CRM, Jira o CI/CD.

## Ejecuciones reales dentro de Docker

| Comprobación                             | Resultado                                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| scripts/validate.sh                      | Exit 0                                                                                                                       |
| Lint Prettier                            | Correcto                                                                                                                     |
| Typecheck Svelte/TypeScript              | 0 errores, 0 advertencias                                                                                                    |
| Vitest                                   | 50 pruebas aprobadas en 4 archivos                                                                                           |
| Playwright                               | 18 pruebas aprobadas: navegación previa, seguridad y asistente                                                               |
| RBAC del nuevo preflight                 | Prueba de navegador ampliada y repetida: Viewer/Operator reciben 403 incluso con CSRF válido                                 |
| Build SvelteKit/adapter-node             | Correcto                                                                                                                     |
| Dockerfile y Compose                     | Checks correctos; Portainer estructural, sin despliegue                                                                      |
| Producción local                         | Imagen construida, arranque y healthcheck correctos                                                                          |
| scripts/validate-persistence.sh ampliado | Exit 0; fecha y diagnóstico por endpoint conservados tras force-recreate, además de sesión, conexión, auditoría y descifrado |
| Revisión visual                          | Captura desktop del asistente revisada; test mobile a 390 px sin desbordamiento horizontal                                   |

Se ejecutó la suite completa después de implementar el código de aplicación. Luego se añadieron comprobaciones explícitas del preflight para Viewer/Operator y de persistencia del diagnóstico; esas pruebas ampliadas también se ejecutaron correctamente. Un error inicial de typecheck por orden de declaración de props se corrigió antes de la suite completa. No hay pruebas fallidas pendientes.

La prueba del asistente verifica el bloqueo del destino antes de pedir token, formulario por pasos, diagnóstico backend fallido seguro, activación bloqueada, retorno a MOCK sin borrar conexiones y rechazo de propiedades que pretendan modificar la política externa. Las pruebas unitarias verifican éxito por endpoint, listado vacío, tenant ajeno, HTTP 401/403/503, error TLS sin textos sensibles, validación stale, LIVE deshabilitado, activación explícita y no divulgación de secretos. Se conservan las pruebas anteriores de CSRF, cifrado, SSRF/DNS pinning, límites y sesiones.

## Cambios

- src/routes/administration/connections/+page.svelte: registro por pasos, selección de conexión y refresh explícito, mensajes claros y MOCK conservando credenciales.
- src/lib/components/ConnectionWizard.svelte: validación y activación independientes, resultados por endpoint y stale.
- src/routes/api/admin/connections/preflight/+server.ts: comprobación local de política, Administrator + CSRF + límite de intentos, sin DNS/HTTP ni cambios de política.
- src/lib/server/connections/service.ts: diagnóstico persistido en settings, ligado a versión y fecha; sin migración SQLite.
- src/lib/server/connections/transport.ts: códigos neutros diferenciados para 401, 403, 503 y certificados TLS.
- src/lib/types/security.ts y connection-diagnostics.ts: metadata segura y mensajes compartidos.
- tests/security.test.ts, transport.test.ts, browser/security.spec.ts y scripts/verify-persistence.mjs: cobertura ampliada.
- README.md y docs/API_CONNECTIONS.md: procedimiento de activación y formato exacto de política externa.

## Límites

Los éxitos de LIVE se ejercitan con respuestas sintéticas en las pruebas unitarias, no con la API empresarial. El navegador verifica el flujo de usuario y un fallo DNS seguro con fixtures. El proxy HTTPS de laboratorio tampoco acredita Traefik empresarial.

La IP concreta está documentada por IACP, pendiente de confirmar desde el contenedor empresarial antes de aplicarla. Faltan prueba autorizada de conectividad/TLS, reader real y tenant coincidente. LIVE_ENABLED y la allowlist siguen exclusivamente bajo control del operador. HTTP 403 puede proceder de permisos, tenant inhabilitado o gateway; no se inventa una causa exacta ni se devuelve el cuerpo del error.

Sin nuevas dependencias ni herramientas Node ejecutadas en el host. SQLite nativo de Node 22 conserva su advertencia experimental conocida. El manifiesto empresarial y los Compose no se modificaron.
