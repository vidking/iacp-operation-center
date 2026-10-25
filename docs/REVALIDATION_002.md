# Reanudación y revalidación de Iteración 002

Fecha: 2026-10-25. Revisión de aplicación recuperada: a299e4d14f6be78a4e78b9ee7de37a208c3c420e. Al iniciar, main y origin/main coincidían después de git fetch; working tree limpio. Se revisaron AGENTS.md, README, documentación, último commit, Dockerfile, los tres Compose, autenticación/bootstrap, persistencia, conexiones y pruebas existentes. No se reimplementó la aplicación.

## Resultados realmente ejecutados

| Comprobación                                | Resultado                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| scripts/validate.sh                         | Exit 0: Dockerfile check, Compose locales/empresarial, lint, typecheck, pruebas y build                                   |
| Typecheck                                   | 0 errores y 0 advertencias                                                                                                |
| Lint                                        | Prettier correcto                                                                                                         |
| Vitest                                      | 38 pruebas aprobadas en 4 archivos                                                                                        |
| Playwright/Chromium                         | 17 pruebas aprobadas, incluida navegación responsive y proxy HTTPS local                                                  |
| Producción                                  | Imagen local construida, runtime sin privilegios y healthcheck correcto                                                   |
| scripts/validate-persistence.sh             | Exit 0; sesión, configuración, auditoría y descifrado conservados tras force-recreate                                     |
| scripts/check-hmr.sh                        | Exit 0; CSS modificado desde el host actualizado sin recargar; archivo original restaurado                                |
| npm ci aislado con la imagen test corregida | Exit 0: 98 paquetes instalados; sin montar dependencias del host                                                          |
| npm audit dentro del contenedor             | 0 vulnerabilidades reportadas                                                                                             |
| Bootstrap manual                            | Administrador creado por TTY con contraseña oculta en contenedor desechable sin red, DB tmpfs; ningún usuario real creado |
| Artefactos Node en host                     | 0 archivos en node_modules, .svelte-kit, .artifacts, build y test-results del repositorio                                 |
| Compose empresarial                         | PORTAINER_MANIFEST_PASS estructural; variables ficticias, sin pull ni despliegue                                          |

Las herramientas Node, instalación reproducible del target Docker, pruebas y builds se ejecutaron dentro de contenedores. No se instalaron dependencias del proyecto en el host. Los datos y credenciales de prueba son sintéticos; los volúmenes del proyecto de persistencia se eliminaron al terminar. Se conserva el Compose local de desarrollo.

## Controles revisados

Argon2id, sesiones opacas persistentes con hash en SQLite, expiración/revocación/logout, cookies Secure/HttpOnly/SameSite, Origin/CSRF, límites de intentos y RBAC en servidor. Las pruebas ejercitan login correcto/incorrecto y denegación administrativa para Viewer/Operator. El bootstrap exige TTY y almacén vacío, sin credenciales predeterminadas.

Credenciales cifradas AES-GCM con keyring fuera de SQLite/Git, respuestas sin token/cifrado, historial administrativo y aislamiento por tenant. La política SSRF exige HTTPS, orígenes e IP exactas, DNS pinning y TLS; rechaza redirecciones y destinos no autorizados. LIVE permanece deshabilitado por defecto y falla cerrado sin conexión válida; no hay fallback ficticio. El proxy HTTPS local verifica el origen canónico y rechazo de cabeceras/protocolo inválidos. Detalle de cobertura y límites en [VALIDATION.md](VALIDATION.md).

No se detectó un fallo funcional o de seguridad confirmado en la aplicación. Una instalación adicional mediante npm ci en un contenedor nuevo detectó EACCES en la caché npm de la imagen test, creada por Playwright como root. Se corrigió su propietario en Dockerfile para permitir reinstalar como usuario node; se reconstruyó y repitió la validación. Esto es una revalidación de los controles solicitados, no una certificación ni una auditoría exhaustiva.

## Cambios realizados

- Dockerfile: caché npm del target test propiedad del usuario node; sin cambios de UI o lógica de aplicación.
- AGENTS.md y PUBLISHING.md distinguen red/entrada previstas de su verificación pendiente en destino.
- OCI_RELEASE.md sustituye la instrucción esquemática de publicación por comandos concretos: revisión limpia, build por plataforma, login oculto por stdin, push SHA, digest del registry, pull y comprobación del SHA OCI.
- Se documentan creación del keyring mediante Docker, bootstrap por TTY y pruebas empresariales aún pendientes. No se cambia el diseño ni las funcionalidades.

## Límites y bloqueos antes de desplegar

No se publicó una imagen OCI ni se contactó Portainer, Traefik, el dominio público o la API empresarial. La comprobación del Compose no acredita existencia de red, certificados, archivo externo, imagen o permisos. El proxy HTTPS de laboratorio usa certificado sintético; no prueba el TLS empresarial.

Faltan autorización para publicar imagen/desplegar, arquitectura y versiones del destino, credenciales registry de publicación y de lectura separadas, acceso Git de lectura, digest publicado, verificación de proxy_network/websecure/certificado, almacenamiento/keyring/backups y bootstrap del administrador real. API iac.cyberfuel.com sigue prevista: LIVE exige origen/IP/CA/tenant y reader confirmados. OIDC/MFA no está implementado; la autenticación disponible es local. SQLite nativo en Node 22 sigue emitiendo advertencia experimental; una réplica y almacenamiento local son los únicos escenarios validados.

No se modificaron IACP, VM 104, CRM, Proxmox, Jira ni servicios empresariales. No se añadieron workflows. El push de código autorizado no publica una imagen ni despliega la aplicación.

## Bloqueo Git al cierre

Las consultas iniciales a origin funcionaron y mostraron main sincronizada con a299e4d. La consulta final falló con Host key verification failed para el alias iacp-forgejo, que resuelve a scm.cyberfuel.com. No se desactivó StrictHostKeyChecking ni se registró una clave recibida sin verificarla por un canal independiente. La publicación de este cambio queda bloqueada hasta restablecer la confianza SSH local y volver a comprobar origin/main; las validaciones de aplicación y persistencia sí finalizaron correctamente. Los cambios se conservan en un commit local, sin push.
