# Infrastructure as Code — Operation Center

## Alcance

Esta rama integra la identidad visual del IACP Operation Center con la consola
existente de IaCoC y añade administración de perfiles, usuarios, preferencias y
RBAC efectivo en el backend. No modifica contratos de IACP ni introduce una
segunda conexión, un token por usuario o un modo sintético en runtime.

## Identidad visual

- Nombre visible: **Infrastructure as Code** / **Operation Center**.
- Arte suministrado: `static/branding/iacp-operation-center.png` como fuente
  original y `static/branding/iacp-operation-center.webp` para carga web.
- Isotipo compacto y favicon: `static/branding/iacp-mark.svg`.
- El hero de Overview y el login describen el orquestador, workers, KVM y LXC.
  Los elementos sin telemetría publicada por IACP se marcan como conceptuales y
  no se convierten en métricas.
- Los tokens de color viven en `console.css`: grafito, azul eléctrico, naranja
  de acción y superficies de cristal oscuro. `prefers-reduced-motion` desactiva
  las animaciones de interfaz.

Las rutas, cookies, variables `IACOC_*`, nombres de imagen y referencias
técnicas a IACP permanecen sin cambios.

## Perfiles y permisos efectivos

| Rol local                       | Lecturas                                                           | Mutaciones CRM autorizadas por IACP                                                                      | Administración local                           |
| ------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Lector (`Viewer`)               | Overview, Operations, Events, Workers, Incidents, CRM e inventario | No                                                                                                       | No                                             |
| Operador (`Operator`)           | Todas las lecturas del workspace                                   | Crear, encender, apagar, reiniciar, eliminar y acciones comerciales publicadas; IACP decide cada recurso | No                                             |
| Administrador (`Administrator`) | Todas                                                              | Todas las anteriores, sujetas a IACP                                                                     | Usuarios, Conectores, Configuración y perfiles |

La autorización de mutaciones se valida en `src/routes/api/crm/[...path]/+server.ts`
y en `src/lib/server/crm/service.ts`; habilitar un botón no sustituye la
respuesta 401/403 de IACP. Conectores y administración siguen restringidos al
Administrador.

## Datos y migración

- `users.display_name` se añade de forma compatible con `ALTER TABLE` cuando la
  columna no existe. Los UUID de usuario, sesiones, conexiones, keyring,
  intents, auditoría y tenant no se reemplazan.
- Perfil propio: `src/routes/profile/`; cambio de contraseña exige la contraseña
  actual, genera un hash Argon2id y revoca las sesiones del usuario.
- Administración de usuarios: `src/routes/administration/users/`; todas las
  operaciones son tenant-scoped y auditadas. No se puede degradar o desactivar
  al último Administrador activo.
- Preferencias: `src/lib/server/security/preferences.ts` y
  `src/routes/administration/settings/`; el valor predeterminado de presentación
  es `America/Costa_Rica`, con tamaños de página e intervalos acotados.
- La conexión Bearer continúa cifrada AES-GCM en el keyring externo; ningún
  secreto se devuelve al navegador, a la paleta de búsqueda o a los tests.

## Navegación y búsqueda

El avatar abre el menú de perfil con Mi perfil, Cerrar sesión y, para
Administradores, Usuarios y permisos, Conectores y Configuración. La paleta
global usa Ctrl+K/Cmd+K, Escape para cerrar y `/api/search` para consultar
resultados acotados al tenant mediante los endpoints existentes.

## Evidencia QA contenerizada

Ejecutar desde Docker/Compose:

```text
npm run check       # svelte-check
npm test            # unitarias e integración
npm run build       # build de producción
npm run test:e2e    # Chromium/Playwright
```

La validación de esta rama se ejecutó con Docker y terminó con:

- Svelte check: 0 errores, 0 warnings.
- Unitarias/integración: 17 archivos, 205 pruebas PASS.
- Chromium: 32 pruebas PASS, incluyendo la suite contractual de 20 ciclos sin
  mutaciones empresariales.
- Build de producción: PASS.
- La prueba visual `tests/browser/identity-rbac.spec.ts` verifica login,
  Overview, responsive, menú de perfil, Ctrl+K, perfil, usuarios,
  configuración y aislamiento administrativo.

Las capturas y trazas de Playwright se mantienen en el volumen de resultados de
prueba; no se incluyen cookies, tokens ni contraseñas en el repositorio.

## Límites

Esta rama no acredita una mutación empresarial ni telemetría de workers que IACP
no publique. No actualiza Portainer, no publica OCI y no modifica IACP,
Proxmox, Terraform, Traefik, Golden Images o Jira.
