# IaCoC 0.6.3 — integración Bearer única

## Alcance

IaCoC utiliza una única conexión IACP activa como fuente de credenciales en el
BFF. La misma credencial cifrada se usa para lecturas y para solicitar acciones
autorizadas. IaCoC no infiere permisos mutantes a partir de una lectura HTTP
200: IACP continúa autorizando cada solicitud.

La interfaz de Administración muestra una sola configuración de conexión. Se
eliminó la pantalla y el endpoint local de una segunda credencial de lifecycle,
así como la dependencia de `operatorConfigured` para habilitar el CRM.

## Migración segura

Al enumerar conexiones o crear el contexto de una conexión, IaCoC ejecuta una
migración idempotente `migration:single-bearer-v1`:

- mueve `lifecycle:<connection-id>`, `lifecycle-mode:<connection-id>` y
  `lifecycle-status:<connection-id>` a la familia `legacy:`;
- conserva el ciphertext sin descifrarlo ni volver a cifrarlo, por lo que se
  mantiene el AAD histórico y no se expone el secreto;
- deja la conexión activa como única credencial operativa;
- registra `connection.legacy_lifecycle_migrated` con la indicación de que el
  valor fue preservado;
- borra también los registros heredados cuando el administrador elimina la
  conexión completa.

Los registros heredados no se leen para ejecutar acciones. La eliminación de
una conexión sigue siendo una operación administrativa explícita y conserva la
auditoría existente.

## Rechazos de IACP

Un 401/403 devuelto por una mutación se registra como rechazo de esa intención y
se muestra con el código de IACP. La respuesta no invalida automáticamente la
conexión de lectura. Un fallo de autenticación de lectura sí sigue las reglas
normales de revocación/invalidación y nunca sirve snapshots como fallback.

Antes de enviar una mutación, el BFF revalida la conexión, el tenant y el
recurso. Si el recurso pasa a `deleted` o `deleting`, registra el rechazo y no
envía la solicitud. Las intenciones mantienen su clave de idempotencia y un
resultado incierto no se reenvía automáticamente.

## Validación realizada

- 176 pruebas unitarias/integración: PASS.
- 23 pruebas Chromium/Playwright con sesiones locales aisladas: PASS.
- Svelte check, build de producción y revisión de artefactos: PASS.
- Persistencia y recreación de contenedor, incluyendo ciphertext legado,
  intención incierta, auditoría y keyring externo: PASS.
- `git diff --check`: PASS.

Estas pruebas no equivalen a una creación real. La aceptación empresarial
continúa bloqueada hasta confirmar, con una identidad Bearer del tenant
`00000000-0000-0000-0000-000000000001`, que IACP admite una creación descartable
desde el CRM. No se ejecutaron creaciones ni acciones de lifecycle durante esta
refactorización.
