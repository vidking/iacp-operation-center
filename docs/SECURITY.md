# Controles de Iteración 002

## Identidad y sesiones

El proveedor implementado es local. No hay configuración OIDC empresarial disponible en el repositorio. No se inventaron issuer, client ID, grupos o callbacks ni se simula un login OIDC. El puerto server-side `createSessionForUser` y el Principal normalizado separan la sesión del método de autenticación. Un futuro proveedor OIDC deberá verificar issuer/audience/firma/nonce/state/PKCE y mapear subject a un usuario habilitado y tenant/rol autorizados por el servidor antes de llamar a ese puerto. No debe conceder roles a partir de campos enviados por el navegador ni por coincidencia de email sin un vínculo verificado. La integración OIDC requiere otra implementación y pruebas reales con el proveedor.

- Contraseñas: Argon2id, memoria 64 MiB, tres iteraciones, paralelismo uno, salt generado por la biblioteca. Mínimo 14 y máximo 256 caracteres. No hay contraseña fija, autorregistro o usuario incorporado al build.
- Sesión: token opaco aleatorio de 256 bits; SQLite almacena solo su SHA-256. Cookie `__Host-iacoc-session`, Secure, HttpOnly, SameSite=Lax, Path=/, sin Domain. Rotación al autenticar, revocación en logout, cambio de contraseña/rol o deshabilitación.
- Duración: ocho horas absolutas y 30 minutos de inactividad; se actualiza last_seen como máximo cada 30 segundos. La emisión comprueba de nuevo el hash dentro de una transacción para impedir emitir sesiones a partir de una contraseña rotada durante su verificación.
- CSRF: Origin debe coincidir exactamente con PUBLIC_ORIGIN; se rechaza Sec-Fetch-Site cross-site. Mutaciones requieren token de la sesión (campo `_csrf` o cabecera X-CSRF-Token). Login utiliza una cookie HttpOnly/Strict temporal con token independiente para evitar login CSRF. No hay logout GET.
- Límites persistentes: 60 intentos globales/minuto, 15 por dirección/15 minutos, ocho por usuario/15 minutos y máximo cuatro verificaciones Argon2 concurrentes por proceso. El límite cuenta intentos correctos e incorrectos. Con proxy se usa su dirección directa; no se confía en X-Forwarded-For. Antes de ampliar volumen de usuarios, acordar rate limiting en el proxy o implementar una cadena de proxies confiables. La política es deliberadamente conservadora.
- Rutas operativas y endpoints requieren sesión; administración exige Administrator en el servidor. Ocultar el enlace no es la comprobación de permisos. Viewer y Operator son de observación en esta iteración; ninguno ejecuta acciones IACP. Las conexiones y el modo son por tenant, incluso para Administrator.

## Bootstrap y gestión autorizada de usuarios

El bootstrap interactivo solo se permite con users vacío:

```sh
docker compose exec iacoc-web node --experimental-strip-types scripts/bootstrap-admin.mjs
```

La contraseña se introduce sin eco, dentro de la TTY del contenedor. No crea una clave de conexiones automáticamente. La clave se genera separadamente con `security-admin.mjs init-key` en el volumen de claves local.

La CLI `security-admin.mjs user-add` recibe JSON **por stdin**, nunca argumentos: `{username,password,role,tenantId}`. `user-change` recibe `{username,password?,role?,disabled?}` y revoca las sesiones existentes. Los roles válidos son Viewer, Operator y Administrator. No escribir contraseñas en comandos guardados en el historial ni en archivos versionados; alimentar stdin desde el gestor autorizado. La CLI requiere acceso de plataforma al contenedor y debe quedar restringida a operadores autorizados y auditada también en el host. No hay endpoint web para crear usuarios o elevar permisos.

UID/GID locales: el valor validado es 1000:1000. Para IDs diferentes, detener los servicios y ejecutar un contenedor de mantenimiento como root que cambie únicamente la propiedad de `/app/node_modules`, `/app/.svelte-kit`, `/app/.artifacts`, `/app/test-results`, `/var/lib/iacoc` y `/run/iacoc-secrets` en los volúmenes locales. Repetir para los volúmenes del perfil test si se usa ese UID. No relajar permisos del keyring ni modificar archivos de otros proyectos.

## Secretos, almacenamiento y auditoría

SQLite es exclusivamente de IaCoC. Usa WAL, synchronous=FULL, foreign keys, busy timeout, permisos privados y sentencias parametrizadas. Contiene usuarios/roles, hashes, sesiones, límites, conexiones cifradas, settings por tenant, snapshots y auditoría. Se requiere un volumen local con semántica de locks SQLite; una sola réplica. No usar un archivo compartido por varias réplicas o un filesystem de red sin validación específica. Node 22 emite una advertencia porque su API SQLite todavía es experimental; la imagen base está fijada por digest y las operaciones utilizadas se prueban en esa versión.

Credenciales de IACP: AES-256-GCM, IV aleatorio de 96 bits y AAD con connection_id, tenant y endpoint. El keyring de claves de 256 bits vive fuera de SQLite y Git. El panel solo devuelve metadata y `credentialsConfigured`; nunca el cifrado, la clave ni el valor original. Cambiar endpoint o credencial incrementa versión, invalida validación y elimina snapshot. Los errores HTTP/criptográficos/SQL no retornan mensajes nativos ni cuerpos upstream. No se registran cabeceras Authorization ni cuerpos de formularios.

La rotación de credencial de servicio se hace desde API Connections; no muestra ni necesita recuperar la anterior. Debe validarse antes de reactivar LIVE. La identidad asociada es una etiqueta administrativa: el contrato no ofrece un endpoint de introspección de roles. El responsable de IACP debe emitir y verificar una identidad reader por tenant; IaCoC descubre el alcance mediante observabilidad autenticada, exige una confirmación administrativa inicial, y compara observabilidad/eventos/operaciones con esa asociación remota. El espacio local de sesión no se confunde con el tenant de IACP. Una credencial de otro tenant no sustituye el alcance aprobado.

`security-admin.mjs rotate-key` agrega una nueva clave activa, reenvuelve las credenciales en una transacción y conserva las claves anteriores para backups. Ejecutar en mantenimiento, con el servicio detenido y escritura explícita sobre el archivo de claves. La aplicación web empresarial normalmente monta ese archivo readonly. Un fallo después de actualizar el keyring conserva las claves antiguas y permite recuperar el estado anterior. No retirar claves antiguas hasta renovar/verificar todos los backups. Backup sin su keyring correspondiente no permite recuperar credenciales.

Auditoría append-only dentro de la aplicación: eventos de login/logout/fallo, altas/cambios de usuarios, creación/edición/rotación/test/activación/deshabilitación de conexiones, cambio a MOCK y rotación de clave. Registra actor, tenant, fecha, acción, objeto y metadata sin secretos. Triggers impiden UPDATE/DELETE por las vías de aplicación; un propietario del archivo SQLite aún puede alterarlo. No se presenta como auditoría inmutable frente a un administrador de almacenamiento. La exportación, retención y protección externa de auditoría deben acordarse antes de operación empresarial sostenida.

## SSRF y cliente IACP

Política de destinos externa al panel: origen HTTPS canónico y lista exacta de IP. Se rechazan usuario/password URL, paths, fragmentos, query, hostname terminado en punto, esquemas alternativos y destinos no autorizados. No hay wildcards. Loopback, link-local/metadata, multicast, unspecified y rangos reservados no son autorizables; IPv4 mapeada en IPv6 se normaliza antes de comparar.

En cada consulta se resuelve DNS con límite, se verifica que **todas** las respuestas estén permitidas y se fija una dirección en el lookup del socket. No se realiza una segunda resolución al conectar. TLS >=1.2 verifica cadena y hostname; no hay opción para desactivar verificación. No se siguen redirecciones; timeout global de 5 s por petición y cuerpo JSON máximo 1 MiB. Solo GET a las cinco rutas contratadas, con parámetros acotados. No existe proxy de URL arbitraria, reintento automático ni ejecución de infraestructura.

La habilitación de LIVE y los permisos de red siguen siendo controles independientes. También restringir egress por firewall a los destinos aprobados. Las pruebas locales ejercitan el transporte con dobles controlados; no acreditan conectividad, certificado ni token de IACP empresarial.

## Publicación HTTPS

`scripts/start-server.mjs` es el entrypoint de producción. Normaliza el protocolo desde PUBLIC_ORIGIN y sobrescribe una cabecera interna antes de delegar al handler de adapter-node. En modo HTTPS exige TRUST_PROXY=true y x-forwarded-proto exactamente https, excepto para el health técnico. Host debe producir el origen canónico esperado; host/IP reenviados se ignoran. Esto requiere que el contenedor solo sea alcanzable por la red confiable y que Traefik preserve Host y sobrescriba la cabecera. Un miembro hostil de esa red puede falsificar cabeceras: la red es parte de la frontera de confianza, no una autenticación basada solo en cabeceras.

CSP con nonces de SvelteKit para scripts, frame-ancestors none, form-action self, base-uri none, object-src none, no-store, nosniff, referrer same-origin, X-Frame-Options DENY y HSTS en HTTPS. Style unsafe-inline es necesario para los indicadores visuales; no se concede unsafe-inline a scripts de producción.

No se implementan provisión, recuperación real, Terraform, acceso PostgreSQL/Redis/Proxmox/state, ni credenciales CRM compartidas. `/health` solo devuelve status/application. La adopción de SSO/MFA, revisión de permisos y validación del entorno empresarial siguen pendientes; no se afirma una auditoría independiente completa ni una certificación de seguridad.

Referencias primarias: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), [Node 22 SQLite](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html).

La opción IACOC_READER_CREDENTIAL_FILE requiere también IACOC_READER_WORKSPACE, asignado externamente al espacio local autorizado. Otro Administrator no puede importar ese secreto global. La ruta no es un campo API. Ante 401/403 o cambio de alcance durante LIVE se invalida la versión y se retira su snapshot; no se conserva acceso por caché tras revocación. Véase docs/ITERATION_004.md.
