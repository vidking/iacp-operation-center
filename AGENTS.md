# IaCoC — reglas de desarrollo

- Trabajar exclusivamente en este repositorio; no modificar IACP, CRM, Proxmox ni otros servicios empresariales. No Jira ni Terraform.
- Ejecutar instalaciones, Node/npm/npx, formatters, app, tests y builds exclusivamente dentro de Docker. Código en bind mount; dependencias y artefactos en volúmenes.
- Conservar el diseño aprobado. MOCK predeterminado, siempre rotulado; CRM y asistente conceptual siguen siendo DEMO sin acciones reales.
- Toda ruta operativa y endpoint requiere sesión. Administración exige Administrator del tenant en el servidor, independientemente de la UI. Viewer y Operator solo observan.
- Autenticación local Argon2id y sesiones SQLite; sin usuarios/contraseñas predeterminados. Secretos solo por stdin autorizado, gestor o UI autenticada; nunca argumentos, Git, logs o builds.
- Las credenciales de conexiones se cifran AES-GCM con keyring externo a SQLite/Git. No devolver cifrados ni valores al navegador. No introducir secretos empresariales en tests.
- LIVE es solo lectura: requiere habilitación del servidor, conexión validada y tenant. Usar exclusivamente el cliente de conexiones con política de origen/IP, DNS pinning, TLS, límite de tamaño, timeout y redirects rechazados. No implementar proxy arbitrario, retries, reconciliación ni comandos.
- Consultar en modo lectura los docs IACOC_CONTRACT.md, CRM_INTEGRATION.md y openapi.json del repositorio hermano antes de cambiar el adaptador. No inventar endpoints ni métricas.
- Preservar status/normalized_status; unknown/stale y fechas de evidencia. No inferir heartbeat, profundidad de cola o workers vivos. LIVE nunca usa fixtures como fallback de errores.
- La persistencia es SQLite propia, una réplica y volumen local; no usar PostgreSQL/Redis de IACP ni state. Backup y keyring se mantienen separados.
- Configuración empresarial confirmada: iacoc.cyberfuel.com, proxy_network, websecure y TLS. No crear Traefik, certresolver, workflows Forgejo ni desplegar Portainer. El manifiesto usa imagen OCI por digest y no publica puertos.
- Antes de publicar código: ./scripts/validate.sh, ./scripts/validate-persistence.sh, revisión de Compose empresarial, diff y secretos. Documentar exactamente lo ejecutado y límites.
- Commit/push a main están autorizados por el usuario para cerrar Iteración 002 solo si pasan las validaciones, no hay conflictos ni fallos críticos de seguridad. No publicar una imagen OCI ni desplegar servicios sin autorización aparte.
