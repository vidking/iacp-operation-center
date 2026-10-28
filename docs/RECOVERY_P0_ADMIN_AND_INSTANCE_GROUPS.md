# P0: recuperación de administración y actividad por instancia

## Causas corregidas

- La administración de usuarios colapsaba validaciones de username, nombre visible,
  contraseña, rol, tenant y checkbox de estado en `INVALID_USER`. Ahora cada
  condición conserva un código y un campo, y la GUI muestra el diagnóstico en
  español.
- El formulario de edición incluía una contraseña opcional. Un autocompletado del
  navegador podía convertir una edición de perfil en una rotación de contraseña.
  La edición ya no acepta contraseñas; el restablecimiento es una acción separada,
  explícita y auditada, con revocación de sesiones de la cuenta afectada.
- El valor HTML del checkbox llegaba como texto. La normalización acepta
  explícitamente `true`, `false` y `on`, por lo que reactivar una cuenta no la deja
  desactivada accidentalmente.
- Operations solo exponía la correlación por identificador. Ahora el BFF mantiene
  un índice de lectura tenant-scoped de instancias publicado por IACP (con caché de
  10 segundos), sin llamadas por fila ni acceso a Proxmox. Operations, Events e
  Incidents pueden agrupar y buscar por nombre, VMID, nodo e instance ID cuando
  esos campos están publicados.

## Garantías conservadas

Argon2id, CSRF, cookies de sesión, RBAC de servidor, aislamiento de tenant,
protección del último Administrador, keyring, cifrado AES-GCM, auditoría y el
Bearer único permanecen sin cambios de seguridad. Un índice de instancia que no
puede actualizarse no inventa nombres o VMID: la UI mantiene la búsqueda por los
identificadores entregados por IACP y muestra la condición degradada.

## Validación local

Todas las verificaciones se ejecutaron en contenedores Docker:

- 207 unitarias/integración: PASS.
- Svelte check: 0 errores, 0 advertencias.
- Prettier: PASS.
- Build de producción y verificación del artefacto: PASS.
- Persistencia SQLite/WAL, keyring, sesiones, auditoría e intents inciertos tras
  recrear el contenedor: PASS.
- 6 pruebas Chromium de identidad/RBAC, incluyendo creación GUI, login en contexto
  independiente, reset, revocación, desactivar/reactivar y último Administrador:
  PASS.
- Suite Chromium funcional restante: PASS, incluyendo 20 ciclos contractuales,
  paginación de 500 operaciones, agrupación por instancia y Events recientes.
- Compose de Portainer: validación estructural PASS; no se actualizó la Stack.

La prueba contractual no acredita el acceso de la cuenta empresarial ni una
mutación real contra IACP.

## Recuperación de la cuenta empresarial

En el checkout y los contenedores disponibles durante este hotfix solo existe la
base aislada de desarrollo/pruebas; no se montó la SQLite empresarial de
`iacoc.cyberfuel.com`. Por eso no se inspeccionaron ni se alteraron sus usuarios,
sesiones o keyring, y no se ejecutó `bootstrap-admin`.

Si la inspección autorizada de la Stack confirma que la cuenta existente requiere
un reset, el operador debe ejecutar `security-admin.mjs user-change` dentro del
contenedor empresarial existente, suministrando el JSON por entrada protegida y
sin poner la contraseña en argumentos, logs, Git o chat. El comando conserva el
UUID, tenant, auditoría y conexiones; revoca las sesiones de esa cuenta. Después
se debe probar el login en dos contextos de navegador independientes.
