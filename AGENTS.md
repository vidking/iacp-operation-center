# IaCoC — reglas de desarrollo

- Trabajar exclusivamente en este repositorio; no modificar IACP, CRM, Proxmox ni otros servicios empresariales. No Jira ni Terraform.
- Ejecutar instalaciones, Node/npm/npx, formatters, app, tests y builds exclusivamente dentro de Docker. Código en bind mount; dependencias y artefactos en volúmenes.
- Conservar el diseño aprobado. Runtime exclusivamente real: sin selección MOCK/DEMO, CRM ni fuentes sintéticas. Los fixtures solo existen en tests y no se copian al runtime. Arranque sin conexión significa desconectado.
- Toda ruta operativa y endpoint requiere sesión. Administración exige Administrator del tenant en el servidor, independientemente de la UI. Viewer y Operator locales solo observan; Administrator puede solicitar acciones autorizadas y IACP decide cada recurso.
- Autenticación local Argon2id y sesiones SQLite; sin usuarios/contraseñas predeterminados. Secretos solo por stdin autorizado, gestor o UI autenticada; nunca argumentos, Git, logs o builds.
- Las credenciales de conexiones se cifran AES-GCM con keyring externo a SQLite/Git. No devolver cifrados ni valores al navegador. No introducir secretos empresariales en tests.
- LIVE requiere habilitación del servidor, conexión validada y tenant. Las lecturas y los comandos CRM permitidos usan exclusivamente el cliente de conexiones con política de origen/IP, DNS pinning, TLS, límite de tamaño, timeout y redirects rechazados. No implementar proxy arbitrario, retries automáticos, reconciliación automática ni comandos fuera de la allowlist.
- Consultar en modo lectura los docs IACOC_CONTRACT.md, CRM_INTEGRATION.md y openapi.json del repositorio hermano antes de cambiar el adaptador. No inventar endpoints ni métricas.
- Preservar status/normalized_status; unknown/stale y fechas de evidencia. No inferir heartbeat, profundidad de cola o workers vivos. LIVE nunca usa fixtures como fallback de errores.
- La persistencia es SQLite propia, una réplica y volumen local; no usar PostgreSQL/Redis de IACP ni state. Backup y keyring se mantienen separados.
- Configuración empresarial prevista: iacoc.cyberfuel.com, proxy_network, websecure y TLS; verificar red, entrypoint y certificado en el destino antes de desplegar. No crear Traefik, certresolver, workflows Forgejo ni desplegar Portainer. El manifiesto usa imagen OCI por digest y no publica puertos.
- Antes de publicar código: ./scripts/validate.sh, ./scripts/validate-persistence.sh, revisión de Compose empresarial, diff y secretos. Documentar exactamente lo ejecutado y límites.
- Las releases pueden preparar commit/push e imagen OCI linux/amd64 tras pasar validaciones. No actualizar la Stack empresarial ni activar LIVE sin conexión Bearer autorizada y prueba real. La publicación de una imagen no acredita una conexión empresarial.

- Distinguir espacio local de sesión y alcance remoto IACP: descubrir mediante observabilidad autenticada y confirmar la asociación explícitamente; no adivinar UUID ni reusar bootstrap. Mantener el AAD de secretos existentes. Ante revocación no servir snapshots.

- Mantener el diseño aprobado salvo autorización explícita; las correcciones funcionales deben conservar estilos, sidebar y navegación existentes. La publicación no implica actualización automática de la Stack empresarial.

## Alcance autorizado 0.6.0 (sustituye restricciones históricas de 0.4.1/0.5.0)

- CRM Simulator usa los componentes y estilos existentes, sin rediseño. La integración empresarial utiliza una única conexión Bearer cifrada en backend para lecturas y operaciones autorizadas; no se exige un segundo secreto operator local. Viewer/Operator locales siguen observando; Administrator solicita acciones y el servidor IACP autoriza cada recurso.
- Solo laboratorio MNG (mng01/mng02), instancias KVM nuevas desechables expresamente creadas para pruebas. Nunca tocar VM 104, VM 106, plantilla 29000, máquinas anteriores ni platinum/prx. No cambiar cuotas, políticas, IACP ni Stack empresarial.
- Se autorizó consultar el mapa local /home/despinoza/Documents/IACP/secrets y usar exclusivamente credenciales de laboratorio identificadas, sin exponer valores. Registro de integración solo por GUI; lecturas de configuración remota son de solo lectura. No usar bootstrap ni administration como sustituto.
- Commit/push e imagen OCI linux/amd64 autorizados tras validar. Distinguir evidencia local, lectura IACP real y cierre de lifecycle real; si capacidad/credencial bloquea el laboratorio, documentarlo sin mutar recursos para desbloquearlo.

## Decisión definitiva de aprovisionamiento 0.6.0

IACP resolvió las cuotas comerciales históricas. No reabrir esa investigación ni convertirla en dependencia de IaCoC. No calcular cupos de instancias, consumo global o máximos de planes en el BFF/GUI; no replicar límites históricos en tests. Cada intención nueva de creación se envía a IACP con una clave nueva. Mantener identidad, tenant, estado, seguridad, idempotencia y confirmación destructiva. IACP decide admisión/capacidad y sus rechazos actuales se muestran fielmente. Inventario e historial deben permitir recorrer toda la paginación técnica, sin un máximo total de IaCoC.
