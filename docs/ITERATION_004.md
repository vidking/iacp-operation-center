# Iteración 004 · Conexión operativa e identidades separadas

## Diagnóstico y estado

La aplicación de partida es 08813f7 (Iteración 003), versión 0.2.0. La versión preparada es 0.4.0. El operador informa IaCoC desplegado por HTTPS, DNS/allowlist verificados y fallos de autenticación en IACP. Esta sesión no inspecciona ni modifica ese runtime.

El fallo de asociación está confirmado en código: connections.tenant_id y users.tenant_id representan el espacio local de IaCoC, pero sourceFor los utilizaba como tenant remoto de IACP. Una cuenta local del espacio administrador no es el UUID de la credencial de servicio. El backend comparaba dominios de identidad diferentes.

HTTP 401 es otro problema: el servidor/gateway rechaza la credencial. No demuestra que sea un error de tenant ni se arregla omitiendo la verificación. Sin credencial real no puede atribuirse a una causa concreta. No usar token_sha256 como token, ni credenciales docs, Forgejo, Portainer o bootstrap.

El usuario confirmó que no dispone de un archivo reader autorizado accesible para esta sesión y solicita simplificar el proceso. **La activación y validación empresarial de LIVE quedan bloqueadas.** No se presenta MOCK como producción operativa.

## Flujo resultante

1. Abrir Administration → API Connections.
2. Ver IACP Cyberfuel, endpoint oficial, estado, modo, última sincronización y validación.
3. Pulsar Conectar IACP. Si ya existe un acceso guardado, se verifica sin volver a pedirlo. Si hay un acceso provisionado para este espacio mediante secreto de runtime, se importa y prueba desde el backend.
4. Como alternativa inicial, un Administrator introduce una sola Clave de conexión. No se piden nombre de identidad, UUID, prefijo, entorno ni endpoint en el flujo habitual. Se cifra inmediatamente; los fallos también conservan la conexión para poder administrar o rotar el acceso.
5. El backend consulta readiness, observability, eventos, operaciones y un detalle disponible. Descubre el alcance autenticado desde observability y exige que los eventos y las lecturas siguientes correspondan a él.
6. Confirmar conexión y activar LIVE. La validación debe ser completa, de la versión actual y reciente (menos de cinco minutos). Esta acción administrativa confirma la asociación inicial.
7. Usar Overview, Operations, Events, Workers & Queues e Incidents. No se vuelve a pedir la clave al consultar, recargar o reiniciar. Volver a MOCK conserva la conexión.

Administración avanzada conserva los controles anteriores de edición, rotación, historial, destinos autorizados y diagnóstico por endpoint. Los UUID solo aparecen allí cuando es necesario investigar. La UI no puede cambiar allowlist, TLS ni LIVE_ENABLED.

## Modelo de aislamiento y compatibilidad

- users.tenant_id y connections.tenant_id siguen siendo el espacio de autorización local. RBAC, filtros de propietario y el AAD de los secretos existentes no cambian.
- association:espacio en settings conserva el tenant remoto confirmado. Se obtiene de evidencia autenticada, nunca del nombre de usuario o de un UUID bootstrap supuesto.
- Un Test Connection solo guarda una propuesta de alcance ligada a versión/fecha; no concede LIVE ni establece la asociación.
- La primera activación establece el alcance explícitamente. Otra credencial que devuelva un tenant diferente no lo reemplaza. Esto aplica también al rotar o crear otra conexión en ese espacio.
- Otro espacio local no puede leer/probar/activar conexiones ajenas. El secreto provisionado globalmente requiere asignación externa explícita al espacio local para impedir que otro Administrator lo importe.
- Las conexiones antiguas se conservan cifradas con el mismo AAD. Las validaciones antiguas sin asociación requieren una prueba y confirmación nuevas. Un LIVE antiguo sin asociación falla cerrado.
- Se usan settings y snapshots existentes; no hay migración destructiva, cambio de esquema, borrado de usuarios, sesiones, conexiones o keyring.
- Tras un 401, 403 o cambio de tenant durante LIVE se invalida la autorización de esa versión y se elimina su snapshot. No se muestran datos cacheados tras revocación. DNS/TLS/disponibilidad pueden mostrar evidencia anterior marcada stale, nunca fixtures.
- El modo LIVE necesita validación reciente al activarse. Las lecturas siguientes autentican y comprueban alcance en cada consulta. El vencimiento de la validación inicial no convierte una lectura real en MOCK; sirve para exigir nueva prueba antes de otra activación.

## Provisionamiento del acceso inicial

Contrato inspeccionado: ../iacp-controlplane/docs/openapi.json 0.10.1, IACOC_CONTRACT.md, CRM_INTEGRATION.md y app/iacp/security.py; checkout vecino 2b0c065. Se revisó también scripts/iacpctl. No se ejecutó código ni se escribieron archivos en ese repositorio.

IACP usa credenciales opacas de al menos 32 caracteres. El registro indicado por IACP_TENANT_CREDENTIALS_FILE contiene una lista de entradas con token_sha256, tenant_id (UUID activo real), subject, role y administration. Para IaCoC corresponde una identidad dedicada con role=reader y administration=false. La documentación local identifica /etc/iacp/identity/tenant_credentials.json como registro operativo, pero la ruta activa y el tenant deben verificarse por el operador IACP.

La API no ofrece emisión de tokens ni introspección de rol/sujeto. GET /v1/observability permite descubrir tenant_id; los GET prueban permisos de lectura. No permiten asegurar que una credencial tenga exclusivamente el rol reader. La emisión/custodia debe acreditar ese rol; IaCoC solo ejecuta GET aunque reciba por error una credencial más amplia.

El registro guarda hashes, no permite recuperar el secreto original. Si existe un reader válido custodiado, se entrega una vez por canal privado o se monta como secreto. Si no existe, hace falta un cambio autorizado del operador IACP: generar secreto aleatorio, preparar una entrada reader del tenant activo, validar un registro candidato preservando todas las identidades anteriores, instalarlo con backup/montaje correcto y entregar el secreto por un canal protegido. No hay un comando reader-issue soportado en iacpctl; docs-rotate solo gestiona documentación y no resuelve este caso.

**Cambio mínimo propuesto en IACP, no implementado:** extender su herramienta de operador con preparación de un candidato reader y handoff privado, y una instalación separada aprobada con validación del modelo Credential, tenant activo, permisos de archivo, backup y auditoría. Reutilizar el patrón de mantenimiento existente; no habilitar emisión anónima, convertir un hash en secreto ni entregar bootstrap al portal. Un futuro enrollment automatizado necesitará además un contrato y autenticación específicos; IaCoC no inventa esa interfaz.

## Acceso sin pegar secretos en el navegador

Opción de runtime, pendiente de cambio externo autorizado:

- IACOC_READER_CREDENTIAL_FILE: ruta dentro del contenedor a un archivo regular de secreto montado readonly, máximo 4096 bytes, modo 0400/0600 y legible por el usuario de la aplicación. No se admite symlink ni archivo accesible por grupo/otros.
- IACOC_READER_WORKSPACE: espacio **local** autorizado para importar esa credencial, por ejemplo administrador solo si ese es el espacio local real. No es el UUID remoto ni se deriva del usuario.
- Ambas son configuración del operador. Nunca se devuelven la ruta ni el secreto a la UI. Conectar IACP importa el contenido una vez y lo conserva cifrado como las conexiones existentes.
- Para aplicarlo harán falta environment y montaje explícitos en la configuración del contenedor; añadir variables de Stack sin referencias Compose no los inyecta. El manifiesto empresarial existente no se modifica en esta iteración.
- Sin esa opción, la autorización administrativa inicial permite introducir una Clave de conexión una sola vez. No se puede omitir toda provisión de identidad cuando el servidor no ofrece enrollment.

La allowlist y LIVE_ENABLED existentes se conservan. No se requiere cambiar DATA_MODE a LIVE en Portainer: la activación es administrativa por espacio.

## Datos reales y diagnóstico

LIVE utiliza exclusivamente evidencia IACP. Overview muestra dependencias y contadores observados; Operations y Events mantienen estados persistidos/normalizados y correlación. El detalle de una operación se consulta de nuevo desde el backend; un error de autorización no sustituye el detalle por datos locales.

Workers y colas permanecen unknown/not-disclosed cuando no hay instrumentación. Incidents deriva señales de operaciones fallidas/inciertas consultadas, sin fabricar tickets o recuperaciones. CRM permanece laboratorio DEMO separado. Notificaciones y series sintéticas no se muestran en LIVE. La fecha de sincronización procede del snapshot efectivamente leído, no de un reloj inventado.

## Publicación y Stack existente iacoc

No modificar servicios IACP ni infraestructura para compensar un 401. La publicación de la aplicación requiere las validaciones locales y la autorización de entrega. Disponer del reader dedicado y completar la prueba empresarial son requisitos adicionales para activar y acreditar LIVE; publicar una imagen no los sustituye. Esta iteración no declara una imagen publicada ni un despliegue efectivo sin evidencia.

1. Revisar el diff, escanear secretos y registrar resultado de scripts/validate.sh y scripts/validate-persistence.sh. Preparar commit de IaCoC y comprobar origin/main antes de push.
2. Construir exclusivamente mediante Docker para linux/amd64, target production, APP_VERSION=0.4.0 y VCS_REF con SHA revisado completo.
3. Publicar, cuando se apruebe, en scm.cyberfuel.com/cyberfuel/iacp-operation-center:sha-SHA_COMPLETO. Seguir docs/OCI_RELEASE.md, usando la versión 0.4.0. Obtener digest del manifiesto del registry, verificar pull por digest y etiqueta OCI de revisión. No usar el ID local de imagen como digest publicado.
4. En Portainer, inspeccionar la Stack existente iacoc y registrar su referencia/digest anterior, environment, mounts, nombres reales de volúmenes y archivo de keyring. No crear otra Stack ni deducir nombres de volúmenes de un checkout.
5. Respaldar SQLite coherentemente y el keyring por separado. Actualizar solo la referencia de imagen/digest revisada, manteniendo configuración, red, labels y mounts. No down -v, recreación de claves ni bootstrap sobre la base existente.
6. Verificar health, login y sesión previa, usuarios, conexiones e historial. Probar el acceso IACP y confirmar explícitamente la asociación y LIVE. Confirmar operaciones/eventos reales y ausencia de DEMO operativo. Si no autentica, dejar MOCK o LIVE bloqueado y registrar causa; no declarar LIVE.
7. Rollback: volver al digest anterior conservado y la misma configuración/volúmenes/keyring. No se cambia el esquema SQLite; las claves settings adicionales no destruyen compatibilidad. Versiones anteriores conservan la confusión de identidades: si se vuelve a 0.2.0, mantener MOCK hasta revisar su comportamiento; no usar rollback como bypass de aislamiento.

Ninguno de estos pasos de Portainer se ejecutó en esta sesión. La prueba empresarial de lectura sigue pendiente por ausencia de credencial reader autorizada.
