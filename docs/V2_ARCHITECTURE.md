# Arquitectura V2

Usamos una SPA React en apps/web, un BFF Fastify en apps/bff y paquetes
compartidos para contratos, cliente API, configuración y UI. La SPA nunca
recibe Bearer ni credenciales remotas.

TanStack Router mantiene un shell persistente. TanStack Query administra una
consulta por recurso, conexión y versión de credencial; las consultas lentas no
bloquean rutas. SQLite local conserva usuarios, sesiones, conexiones y
auditoría. V2 no registra todavía Bearer reales; el keyring de credenciales
queda reservado fuera de SQLite y Git para el hito de conectores.

Los adaptadores upstream consumen únicamente paths presentes en el OpenAPI real
de IACP. El BFF decide sesión, RBAC, CSRF, origen, allowlist, DNS, TLS, límites
y correlación antes de llamar al servidor remoto.
