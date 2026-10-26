# Iteración 003 · Conectar IaCoC con IACP

Referencia histórica: el flujo actual y la separación entre identidades locales/IACP están en [ITERATION_004.md](ITERATION_004.md).

IaCoC está publicado en https://iacoc.cyberfuel.com según el operador. Esta iteración modifica únicamente la aplicación local y su documentación, sin cambiar la Stack ni probar la API empresarial. El asistente está en Administration → API Connections y exige Administrator del tenant.

## Contrato revisado

Referencia en modo lectura: ../iacp-controlplane/docs/IACOC_CONTRACT.md, CRM_INTEGRATION.md y openapi.json, versión 0.10.1. GO_LIVE_INTERNAL.md y GO_LIVE_MVP.md identifican el origen oficial https://iac.cyberfuel.com y su DNS corporativo a 192.168.1.50.

La credencial es un token Bearer IACP de servicio con rol reader del tenant autorizado, separado del CRM y del login de documentación. El tenant de IaCoC procede de la sesión, no se edita en el asistente. La etiqueta de identidad de servicio es descriptiva: las consultas prueban autenticación, acceso de lectura y evidencia del tenant, pero no permiten inspeccionar ni certificar el rol exacto del token. Solicitar reader al custodio, nunca bootstrap/operator/approver para este uso.

## Valores concretos de la configuración externa

Configuración documentada para este destino:

```dotenv
IACP_ALLOWED_TARGETS=[{"origin":"https://iac.cyberfuel.com","addresses":["192.168.1.50"]}]
LIVE_ENABLED=true
```

Estos valores son una propuesta para revisión del operador, no una modificación realizada en Portainer. La IP procede de los documentos del Control Plane, no de una comprobación de red empresarial en esta sesión. Confirmar desde el contenedor destino que DNS corporativo devuelve esa IP y que existe ruta privada/TLS válido antes de aplicar. Si no coincide, detenerse y confirmar las IP con el responsable; no agregar automáticamente direcciones resueltas ni sustituirla por la IP de IaCoC, Forgejo o una IP WAN.

IACP_ALLOWED_TARGETS es **una cadena JSON**, array de hasta 32 objetos estrictos. Cada objeto contiene exclusivamente origin (origen HTTPS canónico sin ruta ni credenciales) y addresses (entre 1 y 16 IP literales exactas). No es CSV, CIDR ni un array de URLs; no admite comodines, nombres DNS en addresses o propiedades adicionales. En el campo de variables de Portainer introducir el JSON completo, sin añadir comillas externas como parte del valor. En un archivo .env se puede envolver entre comillas simples conforme al parser Compose. No es un secreto.

La comparación admite origen con o sin barra final; el origen canónico almacenado será https://iac.cyberfuel.com. HTTPS usa 443 por defecto. No registrar /v1, /docs ni /health/ready en el campo endpoint. Un puerto no estándar sería otro origen que requiere autorización explícita.

Todas las IP devueltas por DNS (A/AAAA) deben estar autorizadas. El socket se fija a una IP aprobada y conserva hostname/SNI y validación TLS; se bloquean loopback, link-local, metadata y otros rangos no seguros. Una dirección RFC1918 exacta sí es admisible. Un cambio de DNS no amplía permisos.

La UI no recibe ni modifica addresses, la allowlist, LIVE_ENABLED, CA ni parámetros de seguridad. El operador conserva esos controles externos. La nueva comprobación de destino consulta solamente la política local: no resuelve DNS, no hace HTTP ni demuestra conectividad.

Para observar sin habilitar LIVE mantener LIVE_ENABLED=false: se pueden registrar y probar conexiones, pero activar devuelve LIVE_DISABLED. MOCK es el modo inicial recomendado. Habilitar LIVE_ENABLED no cambia automáticamente el modo del tenant; no hace falta configurar DATA_MODE=LIVE en Portainer.

Si IACP usa CA privada, el operador debe distribuir su raíz pública aprobada y configurar NODE_EXTRA_CA_CERTS con un archivo montado readonly. La imagen no incluye CA ni secretos empresariales. No desactivar TLS ni enviar cookies de gateway por este adaptador. Confirmar además que la política de acceso de IACP autoriza el origen de red de IaCoC; la allowlist de IaCoC no concede acceso en IACP.

## Procedimiento exacto de activación, después de revisar y publicar la imagen

1. Aprobar la nueva imagen y su digest mediante el procedimiento OCI existente. Esta iteración no la publica ni actualiza la Stack.
2. El operador revisa DNS, IP, ruta, firewall/gateway, certificado/CA y reader del tenant. Cuando se autorice, configura externamente la allowlist anterior y LIVE_ENABLED=true. Mantener MOCK al iniciar. Si ya hay otros destinos autorizados, preservar sus entradas revisadas; no reemplazar la política completa sin revisión.
3. Entrar como Administrator del tenant correspondiente en https://iacoc.cyberfuel.com/administration/connections. Elegir Nueva conexión, nombre y entorno production; endpoint https://iac.cyberfuel.com. Continuar: credencial reader comprueba la política sin pedir aún el secreto. Un destino no autorizado debe resolverse con el operador.
4. Introducir la etiqueta de identidad y pegar únicamente el token reader, sin prefijo Bearer. Guardar conexión. La credencial se cifra AES-256-GCM con el keyring externo; nunca se devuelve. Guardar no activa LIVE.
5. En el asistente de esa conexión ejecutar Test Connection. Desde el backend se consultan, sin reintentos: GET /health/ready, GET /v1/observability, GET /v1/events?after=0&limit=100 y GET /v1/operations?limit=50&offset=0. Se verifica tenant en observability y eventos; antes de operaciones se reafirma el tenant porque OperationResponse no lo contiene. Si hay operaciones, también se verifica un detalle existente.
6. Revisar el diagnóstico por endpoint y la última validación. Se detiene al primer fallo y marca el resto como no ejecutado. Una lista de operaciones vacía es válida; únicamente se omite su detalle. Una respuesta sin contrato válido, tenant ajeno o token rechazado nunca permite activar.
7. Dentro de los cinco minutos posteriores a una validación completa correcta, pulsar Activar LIVE explícitamente. El servidor vuelve a comprobar Administrator/tenant, LIVE_ENABLED, versión de credencial, fecha, conexión habilitada, política de destino y acceso a la clave. El botón es una ayuda; la autorización también existe en el backend.
8. Confirmar modo LIVE y evidencia disponible en Overview/Operations/Events. Los workers y colas sin interfaz acreditada continúan unknown; no se fabrican métricas. Ante fallos se usa solo evidencia cacheada de la misma conexión/tenant/versión, marcada stale, o un estado sin datos; nunca hay fallback automático a MOCK.
9. Para regresar, pulsar Usar MOCK. Conserva conexión, secreto y diagnóstico. Volver a LIVE requiere una acción explícita y validación reciente; no se reactiva automáticamente. Editar o rotar invalida validación y snapshots y exige nueva prueba.
10. Actualizar estado recalcula stale. Una validación con más de cinco minutos se muestra stale y no permite una nueva activación. Esto no desactiva por sí solo una sesión LIVE ya seleccionada: las lecturas conservan sus controles y frescura propios.

## Diagnóstico y siguiente acción

| Código                                              | Interpretación / acción                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| ENDPOINT_NOT_ALLOWED                                | Origen/forma no admitidos o IP de la política inválida. El operador revisa la allowlist; la UI no la puede editar.                         |
| DESTINATION_POLICY_INVALID                          | JSON/esquema de política inválido; corregir externamente.                                                                                  |
| UPSTREAM_DNS_DENIED                                 | DNS no resuelve o devuelve una IP no autorizada; comprobarlo desde el contenedor.                                                          |
| UPSTREAM_UNAUTHORIZED                               | HTTP 401: token ausente, inválido/expirado o autenticación rechazada por el gateway. Rotar reader; confirmar el destino si no se resuelve. |
| UPSTREAM_FORBIDDEN                                  | HTTP 403: revisar tenant habilitado, permisos reader y acceso de red/gateway. No se puede deducir la causa exacta sin el operador.         |
| UPSTREAM_TENANT_MISMATCH                            | La evidencia devuelta pertenece a otro tenant; usar la identidad correcta.                                                                 |
| LIVE_DISABLED                                       | El operador no habilitó LIVE_ENABLED; probar es posible, activar no.                                                                       |
| VALIDATION_REQUIRED                                 | Sin validación completa reciente de la versión actual; ejecutar prueba manual.                                                             |
| UPSTREAM_TLS_ERROR                                  | Certificado/CA/nombre/vigencia inválidos; corregir trust sin bypass TLS.                                                                   |
| UPSTREAM_NOT_READY                                  | Readiness devuelve 503; escalar al operador IACP sin ejecutar recuperación.                                                                |
| UPSTREAM_SERVICE_UNAVAILABLE                        | API/gateway devuelve 503.                                                                                                                  |
| UPSTREAM_REDIRECT_DENIED                            | Redirección bloqueada; revisar origen final o gateway.                                                                                     |
| UPSTREAM_CONTRACT_ERROR / UPSTREAM_INVALID_RESPONSE | Contrato incompatible o HTML/login en vez de JSON.                                                                                         |
| UPSTREAM_TIMEOUT / UPSTREAM_UNAVAILABLE             | Revisar ruta, firewall y servicio; no hay retry automático.                                                                                |
| CREDENTIAL_UNAVAILABLE / KEYRING_UNAVAILABLE        | Revisar keyring/montaje/permisos con el operador; nunca devolver el secreto al cliente.                                                    |

El historial registra creación, edición, rotación, validación, activación y retorno a MOCK. El diagnóstico por endpoint persiste en SQLite usando settings, ligado a versión y fecha del intento; no requiere migración del esquema. No contiene cuerpos de IACP, tokens ni direcciones de la allowlist. Los registros anteriores sin diagnóstico por endpoint piden ejecutar una nueva prueba.

## Validación local

Ejecutar exclusivamente desde Docker con scripts/validate.sh y scripts/validate-persistence.sh. Las pruebas usan fixtures y dobles locales; no sustituyen una prueba autorizada desde el contenedor empresarial con el reader real. No se modifican Control Plane, VM 104, Proxmox, CRM ni Stack empresarial. Cambios pendientes de revisión antes de publicar una imagen.
