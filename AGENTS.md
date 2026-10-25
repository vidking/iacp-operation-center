# IaCoC — reglas de desarrollo

- Trabajar exclusivamente en este repositorio. No modificar Control Plane ni CRM.
- IaCoC observa; Control Plane ejecuta. No añadir comandos, reconciliaciones, reintentos automáticos o acceso directo a motores/DB/Redis/Proxmox/state.
- MOCK es el modo predeterminado y debe funcionar sin red. Rotular siempre las muestras.
- Consultar docs/IACOC_CONTRACT.md, docs/CRM_INTEGRATION.md y docs/openapi.json del repositorio hermano en modo lectura antes de cambiar el adaptador. No inventar contratos.
- Tokens solo en src/lib/server y variables privadas. No usar PUBLIC_* para secretos. No aceptar destinos upstream, tokens o tenants del navegador.
- IACP requiere sesión autenticada, rol reader y tenant vinculado en el servidor. Hasta implementarlo, mantener el bloqueo por defecto de hooks.server.ts.
- CRM tiene implementación e identidad independientes. No crear un proxy genérico.
- Preservar status y normalized_status. Mostrar unknown, stale y fecha de evidencia. No inferir heartbeat ni profundidad de cola.
- Validar con npm run check, npm test, npm run build y npm run test:e2e. Actualizar documentación de limitaciones.
- No desplegar infraestructura, crear Jira, hacer commit ni push sin instrucción explícita.

## Alcance vigente: UI 100% contenerizada

- No ejecutar Node, npm, npx, Vite, SvelteKit, formatters o pruebas directamente en el host. Usar `docker compose exec` o el target `test`.
- Mantener el código en bind mount y dependencias/artefactos en volúmenes Docker. No instalar dependencias en Omarchy.
- Las rutas sirven siempre MOCK; no activar la integración IACP durante esta iteración. El adaptador anterior permanece desconectado.
- No crear workflows Forgejo, manifiestos empresariales ni configurar Portainer. Solo desarrollo y producción locales separados.
- El arranque y las pruebas locales mediante Docker están autorizados. No realizar commit ni push.
