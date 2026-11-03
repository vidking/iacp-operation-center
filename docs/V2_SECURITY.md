# Seguridad V2

La autenticación local usa Argon2id y sesiones SQLite. No creamos usuarios ni
contraseñas predeterminados; el primer Administrador se crea mediante el
bootstrap por stdin. RBAC se aplica en el BFF: `Lector` puede leer solo los
conectores e instancias asignadas, `Operador` puede crear y operar recursos
asignados a través de conectores autorizados y `Administrador` administra
usuarios, conectores, asignaciones y el tenant completo. IACP conserva la
autorización final de cada recurso remoto.

El alta de conexiones IACP cifra cada Bearer con AES-GCM y un keyring
externo a SQLite/Git. El AAD incluye el identificador de conexión y la versión
de credencial. Nunca devolvemos cifrados o Bearer al navegador. Las mutaciones
exigen sesión, Origin permitido, CSRF y auditoría.

El BFF tampoco permite pasar una conexión a LIVE sin `last_validation_at` como
evidencia de validación exitosa; la confirmación single-tenant no sustituye esa
validación.

LIVE no exige que la API seleccionada publique `tenant_id`: cuando su contrato
publica un alcance single-tenant sin tenant, la confirmación administrativa
explícita es la evidencia de asociación. `tenant_id`, dependencias y heartbeat
ausentes se conservan como `null`, `not-published` o `unknown`.

La línea V2 usa un keyring externo nuevo, separado del keyring y del volumen de
SQLite de V1. Al rotarlo se conserva el AAD
`iacoc-v2:connection:<id>:credential:<version>` y no se sobrescribe el archivo
anterior durante la migración. El contenedor de producción solo monta el
archivo V2 en lectura.

El cliente remoto aplica allowlist de origen/IP, comprobación DNS, TLS,
timeouts, límite de cuerpo y redirects rechazados. No hay proxy arbitrario,
retries automáticos ni fallback de fixtures en LIVE.
