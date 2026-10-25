# Validación Iteración 002

Todas las instalaciones, análisis, pruebas y builds se ejecutaron en contenedores Docker locales de Omarchy. Node 22.23.4 y npm 10.9.9 proceden de la base fijada por digest; no se ejecutaron herramientas Node del host. Los datos/credenciales/certificados de prueba son sintéticos, aleatorios y aislados en volúmenes; no se usaron secretos empresariales.

## Comprobaciones realizadas

| Comprobación                                    | Resultado                                                                                                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Instalación reproducible de nuevas dependencias | npm ci en Docker; lockfile actualizado dentro de Docker                                                               |
| Lint                                            | Prettier correcto                                                                                                     |
| Typecheck                                       | Svelte/TypeScript: 0 errores, 0 advertencias                                                                          |
| Vitest                                          | 38 pruebas aprobadas, incluidas las nueve originales                                                                  |
| Playwright/Chromium                             | 17 pruebas aprobadas: diez de UI anterior adaptadas al login y siete de seguridad                                     |
| Build SvelteKit/adapter-node                    | Correcto en Docker                                                                                                    |
| Runtime de producción local                     | Construido y arrancado con usuario node sin privilegios; health correcto                                              |
| Persistencia tras --force-recreate              | Sesión autenticada, metadata, auditoría y descifrado de conexión conservados                                          |
| Proxy HTTPS local                               | Login, cookies Secure, Origin/CSRF y logout correctos; rechaza acceso directo sin cabecera de proxy y Host incorrecto |
| Docker/Compose                                  | Configuraciones locales y empresarial renderizadas; Dockerfile check sin advertencias                                 |
| Dependencias                                    | npm audit sin vulnerabilidades reportadas en la revisión final                                                        |

Las pruebas unitarias cubren Argon2id real y parámetros, login inválido, expiración, revocación, carrera con rotación de contraseña, límites persistentes, CSRF/Origin, cuerpos acotados, RBAC, cifrado/AAD/no divulgación, rotación de clave por CLI y creación única de keyring, tenant, validación/activación/versiones, fallos stale y denegación LIVE sin credenciales. El transporte se ejercita con dobles de DNS/HTTPS para verificar IP fijada, TLS exigido, GET, bloqueo de redirecciones/metadata/loopback/DNS mixto/rebinding, límites y errores neutros.

Playwright prueba login correcto/incorrecto, atributos de cookies, sesión tras recarga, logout y rechazo del token revocado, acceso anónimo, Viewer/Operator contra endpoints administrativos, CSRF/Origin administrativos, UI de alta de conexión, metadata sin secreto, test fallido seguro, rotación, historial, SSRF y aislamiento entre Administrators de diferentes tenants. Conserva navegación, tablas, búsquedas, detalle, correlación, simulaciones, CRM DEMO, gráficas, notificaciones y vistas 390/768 px.

`scripts/validate-persistence.sh` crea un proyecto Docker propio desechable, genera un administrador/token aleatorios sin imprimirlos, almacena una conexión cifrada, conserva un estado de navegador en un volumen de pruebas, recrea el contenedor y confirma acceso con la sesión anterior, configuración, auditoría y una edición que necesita descifrar la credencial. El proyecto y sus volúmenes se eliminan al finalizar. No reutiliza usuarios o datos de desarrollo.

## Problemas encontrados y corregidos

- adapter-node 6 deriva por defecto un origen HTTPS. Las pruebas HTTP locales detectaron rechazo CSRF del formulario. El entrypoint Node ahora fija el protocolo de runtime desde el origen canónico y sobrescribe su cabecera interna; en HTTPS exige el protocolo del proxy. La protección CSRF nativa permanece activa.
- La inicialización del keyring intentaba crear el mismo archivo dos veces. Ahora hace una sola creación exclusiva; una prueba CLI verifica que no sobrescribe una clave existente y que la rotación conserva capacidad de descifrado.
- El botón de logout quedaba fuera del viewport en una sidebar con poco alto. Se habilitó scroll de la sidebar y se preservó espacio para el botón.
- Un texto auxiliar cambiaba el nombre accesible del campo de credencial. Se definió un nombre accesible explícito.
- Se agregó una segunda comprobación de hash al emitir sesión para cerrar la carrera con un cambio de contraseña concurrente.

## Alcance real y límites

El proxy HTTPS de laboratorio usa un certificado efímero autofirmado; solo su navegador de prueba acepta ese certificado. El cliente IACP de producción mantiene rejectUnauthorized=true y no tiene bypass TLS. La prueba local no acredita la configuración de Traefik ni un certificado empresarial válido.

No se probó ni contactó Traefik, Portainer, registry OCI, el dominio público o la API empresarial de IACP. El Compose empresarial se validó con variables ficticias únicamente para renderización, sin desplegar. El digest de ceros usado para esa comprobación no es una imagen publicada ni un valor válido de entrega.

Pendientes para publicar: construir/publicar una imagen revisada y obtener su digest del registry, configurar pull/Git de solo lectura en Portainer, aprovisionar keyring externo y almacenamiento/backups, confirmar certificado/TLS/ruta/Host y aislamiento del proxy, bootstrap del administrador real y luego pruebas empresariales autorizadas. LIVE requiere confirmar origen/IP/CA/tenant y emitir reader desde IACP. OIDC/MFA y revisión independiente de seguridad quedan pendientes; no se presenta esta implementación como una auditoría completa o certificación.

SQLite nativo emite una advertencia experimental en Node 22. La versión está fijada y las operaciones se verificaron; revisar esa dependencia antes de futuras actualizaciones. Solo se valida una réplica y Docker Standalone, no Swarm o almacenamiento distribuido.

No se crearon pipelines Forgejo ni se desplegó en Portainer. No se modificaron IACP, CRM, Proxmox o Jira. Commit/push a main se realizan únicamente tras los controles autorizados por el usuario; el SHA publicado se informa al cerrar la tarea.

`./scripts/validate-portainer.sh` también comprobó dentro de un contenedor sin red la referencia @sha256, labels Host/websecure/TLS/puerto 3000, ausencia de ports/build/certresolver, red proxy_network, volumen SQLite y montaje readonly del keyring. Es comprobación estructural sin pull ni despliegue. HMR sobre login también pasó y restauró el CSS original.
