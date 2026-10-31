# Seguridad V2

La autenticación local usa Argon2id y sesiones SQLite. No creamos usuarios ni
contraseñas predeterminados; el primer Administrador se crea mediante el
bootstrap por stdin. RBAC se aplica en el BFF y la administración exige
Administrador del tenant remoto.

El alta de conectores ControlPlaneV2 cifra el Bearer con AES-GCM y un keyring
externo a SQLite/Git. El AAD incluye el identificador de conexión y la versión
de credencial. Nunca devolvemos cifrados o Bearer al navegador. Las mutaciones
exigen sesión, Origin permitido, CSRF y auditoría.

El BFF tampoco permite pasar una conexión a LIVE sin `last_validation_at` como
evidencia de validación exitosa; la confirmación single-tenant no sustituye esa
validación.

El cliente remoto aplica allowlist de origen/IP, comprobación DNS, TLS,
timeouts, límite de cuerpo y redirects rechazados. No hay proxy arbitrario,
retries automáticos ni fallback de fixtures en LIVE.
