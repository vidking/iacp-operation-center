# Seguridad V2

La autenticación local usa Argon2id y sesiones SQLite. No creamos usuarios ni
contraseñas predeterminados. RBAC se aplica en el BFF y la administración exige
Administrador del tenant remoto. El hito inicial no expone todavía el alta de
credenciales remotas; por eso no persiste ni devuelve ningún Bearer real.

El contrato de producción reserva un keyring externo y AAD estable para el
futuro flujo de credenciales AES-GCM. Ese flujo debe implementarse antes de
habilitar conectores reales. Nunca devolvemos cifrados o Bearer al navegador.
Las mutaciones disponibles exigen sesión, Origin permitido, CSRF y auditoría.

El BFF tampoco permite pasar una conexión a LIVE sin `last_validation_at` como
evidencia de validación exitosa; la confirmación single-tenant no sustituye esa
validación.

El cliente remoto aplica allowlist de origen/IP, comprobación DNS, TLS,
timeouts, límite de cuerpo y redirects rechazados. No hay proxy arbitrario,
retries automáticos ni fallback de fixtures en LIVE.
