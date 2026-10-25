# Arquitectura de Iteración 002

```text
Navegador autenticado
  → Traefik existente (futuro entorno empresarial)
  → entrypoint HTTP de IaCoC / handler adapter-node
  → hook: origen, sesión, CSRF y RBAC
  → loaders / API Connections / endpoints de observación
      → SQLite propia: usuarios, sesiones, metadata, cifrados, límites, auditoría y snapshots
      → keyring externo (solo servidor, archivo separado)
      → MOCK local o cliente GET IACP con origen/IP autorizados
```

No hay acceso directo a la infraestructura de IACP. Los únicos GET preparados son `/v1/operations`, `/v1/operations/{operation_id}`, `/v1/events`, `/v1/observability` y `/health/ready`.

## Capas

- `server/security/config.ts`: configuración canónica de runtime y lectura del keyring externo. El origen público empresarial es https://iacoc.cyberfuel.com; HTTP solo se permite explícitamente en loopback local.
- `security/database.ts`: SQLite propia, transacciones, schema v1, settings por tenant, auditoría append-only por la aplicación. `auth.ts`: Argon2id, sesiones opacas/hasheadas, expiración, revocación, rate limit y normalización de Principal. `crypto.ts`: AES-GCM. `http.ts`: cuerpos acotados, Origin, CSRF y errores neutros.
- `hooks.server.ts`: puerta común antes de rutas/endpoints; solo login, health y assets técnicos son públicos. Root layout no consulta ni serializa evidencia para un visitante sin sesión.
- `server/connections/transport.ts`: destino externo autorizado, DNS pinning por petición, TLS y GET acotado. `source.ts`: proyecciones del OpenAPI y controles de tenant. Antes de operaciones se vuelve a contrastar tenant con observability, porque OperationResponse no incluye tenant.
- `connections/service.ts`: permisos Administrator, cifrado, metadata sin secretos, rotación y validación versionada, activación por tenant y snapshots. Actualizar endpoint/credencial invalida activación efectiva y cache; ningún fallo cambia silenciosamente LIVE a MOCK.
- `routes/api/admin/`: administración de conexiones y retorno explícito a MOCK. `api/observations/`: solo recursos enumerados, sesión y modo LIVE válido; no se aceptan URLs/tokens/tenants del navegador.
- `types/security.ts`: Principal/roles y proyección pública de conexiones. La UI no importa código servidor; las propiedades secretas no forman parte de ConnectionView.
- `scripts/start-server.mjs`: servidor Node de producción con esquema canónico de runtime, protección de cabeceras y parada controlada. Usa el handler de adapter-node, sin implementar otro framework.

## Autenticación y datos

Local es el proveedor disponible; OIDC aún no está configurado. El puerto `createSessionForUser` permite que una futura integración server-side emita la misma clase de sesión tras verificar y vincular un subject autorizado. No hay un endpoint OIDC ficticio o validación casera de JWT.

Las credenciales solo se reciben al crear/rotar; las respuestas usan una proyección explícita sin secret/cipher/key. Test Connection comprueba health ready, observabilidad, operaciones/eventos y el detalle de una operación si existe una ID real. Nunca inventa una ID ni interpreta stderr. El label de identidad no sustituye la emisión externa de un reader autorizado de IACP.

Para LIVE se requiere `LIVE_ENABLED=true`, política externa, conexión habilitada y validación de su versión actual. La activación exige una prueba correcta reciente (cinco minutos). Una vez activada, las lecturas mantienen validación de tenant/destino/credencial; el envejecimiento de la última prueba se muestra stale, sin polling ni revalidación automática.

Snapshots almacenan exclusivamente las proyecciones de observación del mismo tenant/conexión/versión. Tras errores se conserva su fecha original y se marca stale; si no existe evidencia se muestra unknown/ausencia. Configuración inválida, credencial rotada o modo no habilitado falla cerrado. La frescura por fecha considera stale después de 120 s y unknown cuando falta fecha o está excesivamente en el futuro.

LIVE no carga gráficos de workers/colas sintéticos ni incidentes ficticios. Sus señales se derivan solo de la página de operaciones consultada. MOCK conserva el diseño y escenarios aprobados. CRM sigue siendo una maqueta independiente sin llamadas técnicas o comerciales.

## Contratos y límites

Se consultaron exclusivamente en lectura `../iacp-controlplane/docs/IACOC_CONTRACT.md`, `CRM_INTEGRATION.md` y `openapi.json` 0.10.1. El esquema real de HealthResponse contiene status live/ready y `/health/ready` devuelve ready en 200. Las proyecciones están en `types/observation.ts`; `docs/contracts/readonly-openapi-excerpt.json` conserva el extracto original y su hash. El adaptador previo `server/data/iacp.ts` se mantiene como legado bajo pruebas; ninguna ruta de LIVE lo invoca.

El feed puede confirmar IDs fuera de orden. Se deduplica por event_id, pero no se promete entrega sin pérdida ni cobertura histórica completa. La interfaz usa ventanas iniciales (50 operaciones, 100 eventos); paginación histórica completa sigue pendiente. No existen recuperaciones, provisión, retries automáticos, acceso a PostgreSQL/Redis/Proxmox ni Terraform State.

La imagen/Stack están preparadas para empresa. La prueba HTTPS es un proxy de laboratorio; no acredita Traefik, certificados, registry, red ni Portainer empresarial.
