# IaCoC 0.5.0 — consolidación productiva

## Alcance

Se conserva la GUI y el CRUD funcional de 0.4.1. Se eliminan fuentes sintéticas del runtime, selección MOCK/DEMO, ruta CRM, gráficos simulados y asistente de pasos. Los fixtures se trasladan a tests/fixtures; scripts/test-* solo se ejecutan en el contenedor de pruebas. La imagen final contiene el build, dependencias runtime y CLI de seguridad, sin tests ni código de simuladores.

Los estados verificados por el backend son Conectado, IACP desconectado, Degradado, Autenticación requerida, Sin permisos y Sin datos disponibles. Un 200 de readiness no acredita workers ni una integración saludable: se exigen observabilidad autenticada vigente y dependencias disponibles. worker_liveness=unknown sigue sin instrumentación. Cada pantalla indica fecha de evidencia y ventana consultada (hasta 50 operaciones / 100 eventos); las búsquedas filtran esa ventana, no un historial global.

El adaptador usa GET /health/ready, /v1/observability, /v1/events y /v1/operations, además de detalles de operación. Una atestación de alcance se comparte solo dentro de cada lectura, nunca entre peticiones. No se conecta a bases de datos de IACP. Sin conexión autorizada no hay consultas ni fallback. Los snapshots genuinos de la misma conexión/versión/tenant pueden conservarse ante un fallo temporal, siempre degradados y anteriores. 401, 403 y alcance distinto invalidan autorización y retiran snapshots, también desde un detalle individual.

## Configuración definitiva en Portainer

Archivo completo: [deploy/portainer/docker-compose.yml](../deploy/portainer/docker-compose.yml). Se mantiene el proyecto Stack **iacoc**, su volumen configuration, UID/GID 1000, keyring readonly, proxy_network externa, router iacoc, websecure y TLS, puerto interno 3000. No se publica ports ni se añade certresolver.

| Variable                | Valor o requisito                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| IACOC_IMAGE_DIGEST      | 64 caracteres hexadecimales del digest OCI publicado, sin prefijo sha256:                                           |
| LIVE_ENABLED            | true para permitir lecturas autenticadas; false es el interruptor externo de seguridad, no habilita datos de prueba |
| IACP_ALLOWED_TARGETS    | Conservar el JSON empresarial ya autorizado, con origen HTTPS e IP exactas verificadas                              |
| IACOC_KEYRING_HOST_FILE | Conservar la ruta ABSOLUTA existente al keyring; legible por UID 1000 y montaje readonly                            |
| IACOC_MEMORY_LIMIT      | 512m por defecto; ajustar según medición                                                                            |
| IACOC_CPU_LIMIT         | 1.0 por defecto                                                                                                     |
| IACOC_PIDS_LIMIT        | 100 por defecto                                                                                                     |

PUBLIC_ORIGIN=https://iacoc.cyberfuel.com, TRUST_PROXY=true, HOST=0.0.0.0, PORT=3000, NODE_ENV=production, BODY_SIZE_LIMIT=16384, IACOC_DB_PATH=/var/lib/iacoc/iacoc.sqlite e IACOC_KEYRING_FILE=/run/secrets/iacoc-keyring.json están fijados en el manifiesto. No habilitar LOCAL_HTTP en producción. No definir HOST_HEADER/ADDRESS_HEADER/PORT_HEADER para confiar en entradas externas.

La forma exacta de IACP_ALLOWED_TARGETS es un array JSON, por ejemplo `[{"origin":"https://iac.cyberfuel.com","addresses":["192.168.1.50"]}]`. Esa IP corresponde a la referencia DNS interna documentada previamente; **conservar el valor ya verificado por el operador en la Stack**, no sustituirlo sin verificar resolución y alcance desde el host Docker destino. Solo admite orígenes exactos, sin path/credenciales/query/fragment, IP exactas permitidas y DNS dentro de esas IP; no CIDR ni comodines. La GUI no puede modificar esta política.

DATA_MODE se elimina de todos los Compose y del runtime: incluso un valor antiguo externo no puede seleccionar fixtures. LIVE_ENABLED se conserva por compatibilidad como habilitación externa de lectura. La clave IACP se registra desde la UI y se cifra; nunca es un argumento de build, secreto versionado ni una variable pública. No se devuelve al navegador.

## Conexión y acceso

1. Iniciar sesión con Administrator existente y abrir API Connections.
2. Reutilizar la conexión productiva conservada, o usar Conectar y registrar **Clave de acceso a IACP** una sola vez. No introducir el prefijo Bearer ni UUID local/remoto. El backend identifica el alcance mediante observabilidad autenticada; la acción administrativa Conectar autoriza su asociación al espacio local.
3. Conectar realiza prueba y selección explícita; Probar conexión conserva la selección actual. Revisar estado, última validación y última sincronización. Si no hay credenciales válidas, el portal permanece desconectado con diagnóstico.
4. Administrar conexiones permite editar metadatos/destino, reemplazar acceso, deshabilitar, revisar auditoría y eliminar con confirmación identificada. Editar una conexión inactiva no afecta otra; cambiar destino/acceso invalida validación, snapshots y activación anteriores. Una seleccionada debe desactivarse antes de eliminarla. Desconectar conserva conexión y secreto para reconectar.

Contrato leído: IACP 0.10.1, docs/IACOC_CONTRACT.md y openapi.json del repositorio vecino. No ofrece login por contraseña, emisión/intercambio de tokens ni introspección de identidad delegada. Por tanto IaCoC admite la clave estática de una identidad reader dedicada al tenant autorizado, provisionada por el responsable de IACP. No se introduce una autenticación ficticia por administrador global ni se almacena una clave global privilegiada como sustituto. Habilitar delegación futura exige un contrato adicional revisado en IACP; no es requisito para reutilizar la conexión reader existente. La UI no puede emitir una credencial que el servidor no emite.

## Compatibilidad y persistencia 0.4.1

No hay migración destructiva ni cambio de esquema: SQLite user_version=1, tablas/usuarios/sesiones/auditoría/conexiones y AAD del cifrado se mantienen. Las claves internas de selección antiguas se leen para conservar una conexión autorizada seleccionada; las selecciones históricas de laboratorio se interpretan como desconectado. Los snapshots antiguos se proyectan y validan antes de mostrar evidencia anterior; no se confían sus etiquetas de presentación. No se borran datos al arrancar ni se regenera el keyring.

El volumen de SQLite y el keyring deben conservarse juntos como pareja lógica, con backups separados y acceso restringido. No cambiar el nombre de Stack/volumen ni ejecutar down --volumes. No inicializar usuarios ni claves sobre un entorno existente.

## Actualización de la Stack existente (operador empresarial)

1. Registrar digest ANTERIOR real, variables actuales, montajes y nombre exacto del volumen. Respaldar SQLite con mecanismo consistente (backup SQLite o parada breve y copia incluyendo WAL/SHM); respaldar keyring separado. No copiar una base activa sin consistencia.
2. Confirmar que Portainer tiene acceso de lectura al package privado de Forgejo y que el host Docker destino es linux/amd64. Verificar proxy_network, router sin colisión, websecure y certificado ya existente para iacoc.cyberfuel.com. No crear ni modificar Traefik.
3. Usar el Compose completo de esta release en la Stack **iacoc**, preservar todas las variables/montajes existentes y sustituir únicamente IACOC_IMAGE_DIGEST por el digest entregado. Retirar DATA_MODE si aún está en las variables. Mantener LIVE_ENABLED=true si la integración está autorizada y conservar allowlist/keyring.
4. Actualizar con pull de imagen por digest, sin build ni eliminación de volúmenes. Este paso lo ejecuta el operador: esta entrega no administra Portainer.
5. Verificar contenedor healthy, versión OCI 0.5.0 y HTTPS en el portal. /health solo acredita el proceso, no el upstream. Comprobar que la sesión existente persiste; iniciar sesión si expiró. Verificar la conexión productiva seleccionada y ejecutar Probar conexión y Actualizar.
6. Comprobar operaciones/eventos/observabilidad reales con fechas actuales y alcance esperado. Revisar una operación y su correlación; workers unknown sin indicador de salud inventado. Si aparece autenticación requerida o sin permisos, rotar el acceso reader y conectar de nuevo. No declarar integración operativa solo por healthcheck o portal accesible.

El proxy debe preservar Host y sobrescribir X-Forwarded-Proto=https. La app ignora cabeceras externas de host/IP para su origen canónico, exige protocolo HTTPS reenviado y valida Origin/CSRF. El puerto 3000 no se expone a Internet; la red compartida de proxy es una frontera de confianza que el operador debe controlar.

## Rollback

Restablecer IACOC_IMAGE_DIGEST al digest ANTERIOR registrado y volver a crear únicamente el servicio, con el mismo volumen/keyring/variables. No restaurar una base antigua automáticamente ni perder cambios posteriores. El esquema es compatible con 0.4.1; si se desconectó desde 0.5.0, volver a seleccionar la conexión desde la GUI de la versión anterior. El rollback a 0.4.1 devuelve también sus funciones de laboratorio: restringir acceso hasta verificar la conexión productiva. No usar latest. Si se requiere restauración de backup, hacerlo de forma coordinada preservando la pareja SQLite/keyring.

## Evidencia y límites de validación

Las suites Docker cubren sesiones, HTTPS/proxy local, RBAC/tenants, CRUD, cifrado, revocación, DNS/TLS/SSRF, estados, contratos y navegador desktop/mobile. La imagen se arranca sin fuentes montadas y el proyecto desechable valida sesión/conexiones/cifrado tras recreación. verify-production.mjs inspecciona artefactos compilados y falla si encuentra selector DATA_MODE, fuente simulada, CRM o wizard; el build productivo lo exige.

Los casos de API usan respuestas contractuales de prueba aisladas, no certifican IACP empresarial. No se ha accedido a la SQLite empresarial ni probado una credencial real en esta sesión. El usuario informa integración activa anterior; la confirmación de que 0.5.0 recibe datos reales requiere los pasos posdespliegue anteriores. Tampoco se han administrado Portainer, Traefik, IACP, VM 104 ni Jira. Los resultados exactos y el digest se entregan al terminar la publicación; no se presume una Stack actualizada.

## Registro de validación local de la release

- 78 pruebas unitarias/integración: cifrado, auth, RBAC, CRUD, contratos, transporte y estados.
- 14 pruebas Chromium: GUI desktop/tablet/mobile, acciones reales, sesión/logout, CSRF, proxy HTTPS local y revocación.
- Build SvelteKit y escaneo de 89 archivos compilados: sin fuente sintética, selector de modos, CRM ni wizard.
- Actualización probada desde la imagen publicada 0.4.1 (sha-171a6451c1379f78435249ee2000fdc4b0d74c93) a 0.5.0 sobre volúmenes desechables: sobreviven sesión, registros editados, eliminación, diagnósticos, auditoría y descifrado de acceso creado por 0.4.1; SQLite mantiene user_version=1.

Para repetir la prueba de actualización, con puerto local 3000 libre y la imagen anterior disponible:

```sh
IACOC_UPGRADE_FROM=scm.cyberfuel.com/cyberfuel/iacp-operation-center:sha-171a6451c1379f78435249ee2000fdc4b0d74c93 ./scripts/validate-persistence.sh
```

Sin IACOC_UPGRADE_FROM el mismo script prueba recreación de la versión actual. No utiliza la base empresarial ni sus secretos.
