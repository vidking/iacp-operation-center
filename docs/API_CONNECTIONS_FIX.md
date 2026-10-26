# IaCoC 0.4.1 · Corrección funcional de API Connections

## Alcance y diagnóstico

Corrección sobre fbc6cb6 (0.4.0). El usuario canceló el rediseño visual: se conservan estilos, colores, sidebar, tipografía, navegación, tarjetas y distribución. No se modifica IACP, su Stack, VM 104, Proxmox ni Jira. El LIVE empresarial existente se considera reportado por el operador; no se accede a sus datos ni se manipula SQLite de producción.

Causas verificadas en código:

- No existían una mutación de eliminación ni un control asociado.
- Configurar solo cambiaba el diagnóstico seleccionado; no abría los campos editables.
- La edición exigía el flujo de creación y todos los cambios reenvolvían el secreto, incrementaban su versión y retiraban la validación, incluso al cambiar el nombre.
- La selección para LIVE se confundía con el estado validado: una conexión revocada podía dejar de parecer seleccionada, aunque seguía siendo la referencia del espacio.
- Historial y Actualizar estado no manejaban adecuadamente errores/estado ocupado. Los mensajes podían mostrar el último fallo de validación como si hubiera fallado un guardado correcto.
- El formulario principal para reemplazar acceso dependía del endpoint fijo de alta, incluso para una conexión existente cuyo destino se había editado.

## Acciones reparadas, en la pantalla existente

Abrir Administración avanzada en API Connections. Configurar y el icono Editar abren la edición con datos del registro. Los secretos siempre se presentan vacíos.

- Nombre, entorno y etiqueta: guardar conserva autorización, versión del secreto y evidencia, incluso si esa conexión está activa.
- Endpoint o nueva credencial: se reenvuelve/cifra con el AAD correspondiente, incrementa versión y retira validación/evidencia. Si estaba seleccionada para LIVE, sigue identificada como tal pero queda bloqueada. Probar de nuevo no la reactiva por sí solo; hay que pulsar Activar LIVE.
- Cancelar edición: descarta el formulario sin escribir datos.
- Test Connection: prueba exclusivamente la conexión indicada y devuelve su resultado. No cambia la selección activa de otra conexión.
- Habilitar: permite volver a probar una conexión desactivada con su acceso cifrado existente, sin pedirlo de nuevo. No activa LIVE automáticamente.
- Desactivar: afecta solo al registro indicado. Si era la conexión seleccionada, retira esa selección y vuelve al modo configurado de demostración existente, mostrando el cambio. Desactivar otra no toca LIVE.
- Reemplazar credencial: mantiene el registro y exige prueba/activación nuevas. La acción principal Conectar puede reutilizar un registro desactivado sin duplicarlo.
- Historial: identifica el registro y maneja fallos. La auditoría de una conexión eliminada sigue siendo consultable solo por Administrators de su espacio.
- Actualizar estado: actualiza la lista con feedback y control de errores.
- Los iconos conservan sus componentes y tienen etiquetas accesibles/tooltips.

Los registros muestran explícitamente LIVE ACTIVA, LIVE BLOQUEADA o INACTIVA, además de estado de validación y fecha.

## Eliminación

Cada fila ofrece Eliminar conexión. La confirmación identifica nombre, entorno y endpoint. Cancelarla no modifica datos.

El backend exige Administrator del espacio y confirmId igual al identificador de ruta. Si esa conexión es la seleccionada para LIVE, responde CONNECTION_IN_USE (409), incluso si la validación está revocada/fallida. La confirmación ofrece Desactivar para eliminar. Solo después se habilita la eliminación.

Se eliminan la fila y su secreto cifrado, su snapshot por FK y los settings de validación/activación de ese identificador. No se elimina la asociación del espacio, el keyring, claves compartidas, usuarios, sesiones ni otras conexiones. La auditoría conserva actor, fecha, identificador, nombre y versión, sin secretos ni cifrados.

El borrado es lógico en el almacenamiento de aplicación, con secure_delete ya habilitado. No se presenta como borrado físico de backups o WAL históricos. Tampoco revoca una identidad compartida en IACP: eso sería otro cambio autorizado del propietario de ese servicio.

## Compatibilidad y seguridad

No hay migración de esquema: SQLite continúa en user_version=1. Se preservan AAD, algoritmo de cifrado y keyring. selectedForLive es metadata calculada a partir de la selección existente; no altera registros al actualizar la aplicación.

El setting activation-required:ID se escribe únicamente al cambiar una autorización o recibir revocación. Las conexiones LIVE válidas existentes no se invalidan al instalar la versión. Las ediciones pueden incluir expectedUpdatedAt para rechazar guardados sobre un registro modificado concurrentemente; el timestamp de modificación es monotónico.

Se mantienen RBAC server-side, Origin/CSRF, aislamiento por espacio, auditoría, allowlist, TLS y DNS pinning. La eliminación de registros fallidos o con cifrado ilegible no requiere descifrar su secreto. Una credencial revocada sigue sin permitir acceso a snapshots. Una prueba que detecta revocación retira su snapshot; las consultas que ya estaban en vuelo vuelven a comprobar la autorización antes de responder o guardar caché.

## Validación

Ejecutar scripts/validate.sh y scripts/validate-persistence.sh exclusivamente en Docker. Se añadieron pruebas unitarias y un recorrido real de botones con tres registros equivalentes al caso reportado: activo, inactivo y fallido. No se borran conexiones empresariales.

La prueba de persistencia crea tres registros desechables, elimina uno, edita otro, recrea el contenedor y comprueba sesión, registros, auditoría de eliminación, diagnóstico y descifrado del acceso conservado. Las pruebas de navegador usan respuestas IACP sintéticas en un servidor de pruebas separado; no acreditan ni modifican la integración empresarial.

## Publicación, actualización y rollback

Versión de corrección: 0.4.1, sin rediseño. Publicar código e imagen linux/amd64 por SHA/digest después de pasar los controles.

Para la Stack empresarial existente iacoc:

1. Registrar el digest previo y los mounts/environment reales. Conservar SQLite, keyring, redes, labels y todas las variables existentes.
2. Respaldar SQLite coherentemente y keyring por su canal seguro.
3. Actualizar solo la imagen/digest revisado; no crear otra Stack, ejecutar bootstrap, regenerar claves ni down -v.
4. Verificar health, sesión existente, las tres conexiones, selección LIVE, nombres y última validación. Un cambio de nombre no debe interrumpir la lectura.
5. Ejecutar cambios/eliminaciones empresariales solo por decisión explícita del administrador. La eliminación de una conexión secundaria no debe cambiar la seleccionada.

No se modifica ningún Compose porque esta corrección no necesita cambiar su arquitectura. El digest publicado y el commit se informan en la entrega.

Rollback: restaurar el digest anterior conservado y los mismos mounts/environment. No requiere restaurar esquema. Si se cambió una credencial, 0.4.0 no interpreta el nuevo bloqueo de reactivación: antes de volver a usar LIVE, completar prueba/activación con revisión del operador. Un rollback de imagen no recupera filas eliminadas; restaurar un backup sería una acción de datos separada y autorizada.

## Resultado de validación 0.4.1

| Comprobación ejecutada dentro de Docker  | Resultado                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| scripts/validate.sh completo             | Exit 0                                                                                                |
| Typecheck                                | 0 errores, 0 advertencias                                                                             |
| Lint Prettier                            | Correcto                                                                                              |
| Vitest                                   | 66 pruebas aprobadas en seis archivos                                                                 |
| Playwright                               | 20 pruebas aprobadas, incluida administración de tres conexiones por botones reales                   |
| Build SvelteKit/adapter-node             | Correcto                                                                                              |
| Dockerfile y Compose                     | Correctos; manifiesto empresarial validado estructuralmente                                           |
| scripts/validate-persistence.sh ampliado | Exit 0; edición, eliminación, sesión, diagnóstico, auditoría y descifrado conservados tras recreación |
| Preservación visual                      | Sin cambios en CSS, layout global, sidebar, navegación ni componentes del dashboard                   |

El recorrido de navegador cubre creación, selección por teclado, carga sin secretos, cancelar una edición, editar nombre/entorno de la activa sin invalidarla, editar endpoint/credencial de otra, rotar, probar, habilitar/desactivar, rechazar un destino no autorizado, consultar historial, actualizar estado, cancelar eliminación, eliminar fallida/inactiva, impedir borrado LIVE, desactivar y eliminar la seleccionada, mantener sesión tras recarga y reconectar un registro desactivado sin duplicarlo. Comprueba también rechazo server-side de Viewer/Operator y otro espacio.

Las pruebas unitarias adicionales verifican el cifrado/AAD al cambiar endpoint, la preservación exacta del secreto y snapshot al renombrar, bloqueo de guardados concurrentes, eliminación sin descifrado, auditoría después del borrado, aislamiento y una lectura en vuelo frente a revocación. Los fallos iniciales de etiquetas/selección del test se corrigieron; no hay pruebas fallidas pendientes.

Archivos de aplicación modificados: AdvancedConnections.svelte, la página actual de conexiones, service.ts de conexiones, su endpoint [id], y tipos/mensajes de conexiones. Pruebas: nuevo connections.test.ts, browser/connections.spec.ts, servidor/proveedor de fixtures, configuración Playwright y verificación de persistencia. La versión cambia en package.json, package-lock.json y Dockerfile; README, AGENTS y el procedimiento OCI registran esta corrección.

No se accedió a SQLite empresarial ni se borraron conexiones reales. La integración LIVE desplegada sigue bajo control del operador; los resultados anteriores acreditan la corrección local, no un despliegue realizado.
