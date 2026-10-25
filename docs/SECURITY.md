# Límites de la iteración visual

El portal sirve exclusivamente MOCK. No hay login real, tokens, llamadas a IACP, pedidos, IA ni recuperaciones. El servidor ignora DATA_MODE=IACP para seleccionar datos. El adaptador servidor existente permanece desconectado. No hay proxy abierto y `/health` no consulta dependencias.

Desarrollo publica únicamente 127.0.0.1:5173. Producción local publica únicamente 127.0.0.1:3000. Ningún contenedor monta docker.sock, usa privileged o network_mode:host. No se utilizan credenciales de empresa ni redes existentes. La imagen runtime usa usuario no root; Compose limita recursos, evita capabilities y mantiene filesystem readonly.

Antes de exponer evidencia real, una iteración posterior debe implementar:

1. SSO/OIDC validando issuer, audience, firma, expiración y sesión servidor; cookies Secure/HttpOnly/SameSite y protección CSRF.
2. Autorización reader por usuario y tenant en cada consulta, vinculada a la identidad del servidor. No confiar en tenant, token o destinos enviados por el navegador.
3. Identidades separadas para observación, CRM y aprobación. Secretos del gestor fuera de Git, builds, HTML, logs y bundles.
4. HTTPS, restricción de egress, validación de Host y esquema por reverse proxy, aislamiento y autorización de cualquier cabecera reenviada. No hay labels o redes empresariales asumidas.
5. Límites de solicitudes y respuestas, auditoría sin secretos, rotación de credenciales y CSP completa.
6. Pruebas de aislamiento de tenants, 401/403/404, expiración, redirecciones y ausencia de secretos.

Los headers actuales incluyen no-store, nosniff, referrer-policy same-origin y frame-ancestors none. No equivalen a un endurecimiento completo. No conectar IaCoC directamente a PostgreSQL, Redis, Terraform, Proxmox ni state. Toda ejecución corresponde al Control Plane.
