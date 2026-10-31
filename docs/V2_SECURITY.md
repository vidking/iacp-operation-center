# Seguridad V2

La autenticación local usa Argon2id y sesiones SQLite. No creamos usuarios ni
contraseñas predeterminados. RBAC se aplica en el BFF y la administración exige
Administrador del tenant remoto.

Las credenciales remotas se mantienen cifradas con AES-GCM y keyring externo.
Nunca devolvemos cifrados o Bearer al navegador. Las mutaciones exigen sesión,
Origin permitido, CSRF y auditoría.

El cliente remoto aplica allowlist de origen/IP, comprobación DNS, TLS,
timeouts, límite de cuerpo y redirects rechazados. No hay proxy arbitrario,
retries automáticos ni fallback de fixtures en LIVE.
