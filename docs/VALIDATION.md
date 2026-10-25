# Validación vigente · UI 100% Docker

Fecha: 25 de octubre de 2026. Host Omarchy: solo edición de archivos, shell/Git, Docker/Compose y HTTP de comprobación. Node **22.23.4** y npm **10.9.9** se ejecutaron dentro de contenedores. Docker local: 29.9.2, Compose 5.6.1, contexto default con socket local; no se usó infraestructura empresarial.

En una iteración anterior a la regla de contenerización se habían ejecutado herramientas Node en el host. Sus dependencias y artefactos del proyecto fueron retirados antes de esta validación. Desde la instrucción de desarrollo 100% contenerizado, todas las instalaciones, formatters, builds, pruebas y procesos de aplicación se ejecutaron dentro de Docker. No se modificó la instalación Node global del usuario.

| Comprobación                   | Evidencia / resultado                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose up -d --build` | Desarrollo construido y arrancado; healthy en 127.0.0.1:5173                                                                     |
| Instalación reproducible       | `npm ci --ignore-scripts` ejecutado en targets Docker, usando package-lock.json                                                  |
| Acceso HTTP                    | GET `/` y `/health` correctos en desarrollo y producción local                                                                   |
| Hot Reload                     | Chromium dentro de Docker detectó cambio CSS hecho desde host sin recarga; `scripts/check-hmr.sh` pasó y restauró el archivo     |
| Lint                           | Prettier desde Docker: todos los archivos comprobados correctos                                                                  |
| Typecheck                      | svelte-check desde Docker: 0 errores, 0 advertencias                                                                             |
| Pruebas de datos               | 9 aprobadas en Vitest dentro de Docker                                                                                           |
| Pruebas de interfaz            | 10 aprobadas en Playwright/Chromium dentro del target test                                                                       |
| Build                          | `adapter-node` correcto en Docker, salida `.artifacts/build` en volumen                                                          |
| Dockerfile                     | `docker buildx build --check --target production .`: sin advertencias                                                            |
| Compose                        | Configuración de desarrollo y producción validada                                                                                |
| Producción local               | Imagen construida, arrancada, HTML correcto y healthcheck healthy en 127.0.0.1:3000                                              |
| Usuario y dependencias runtime | uid/gid 1000 node; sin TypeScript, Vite ni paquete Lucide (iconos compilados en build)                                           |
| Bind mounts de producción      | `.Mounts` vacío; el tmpfs está declarado por separado en HostConfig                                                              |
| Auditoría de dependencias      | `npm audit --audit-level=low` dentro de Docker: 0 vulnerabilidades reportadas                                                    |
| Artefactos Node en host        | 0 archivos en las rutas host node_modules/.svelte-kit/build/.artifacts/test-results; solo posibles directorios vacíos de montaje |
| Git e infraestructura          | Sin commit, push, Forgejo Actions, Portainer, IACP, CRM, Proxmox, Jira ni Terraform                                              |

La imagen local de producción validada se etiqueta `iacoc:0.1.0-local`, usa base Node fijada por digest y ocupa aproximadamente 321 MiB según Docker (336,629,651 bytes en esta revisión). No se publicó en ningún registry. Se verificó arranque en modo MOCK, usuario no root, ausencia de dependencias de desarrollo y liveness propia. El tamaño es el de Debian slim + Node + aplicación, no un artefacto estático sin servidor.

## Cobertura de interfaz

1. Navegación por las seis secciones, sin errores JS ni solicitudes del navegador a servicios externos.
2. Filtrado de operaciones, diferencia status/normalized_status, drawer con timeline y enlace a correlación.
3. Búsqueda, orden descendente, búsqueda global y resultado vacío.
4. Estados loading/error/empty con regreso a la vista normal.
5. Incidentes, historial, severidad y respuesta editorial del asistente conceptual.
6. Clientes y catálogo CRM, formulario de vista previa sin POST ni modificación del historial.
7. Ventana del gráfico, controles y notificaciones.
8. Todas las rutas a 390 y 768 píxeles, sin desbordamiento horizontal de la página; las tablas permiten scroll interno.
9. Health y MOCK independientes de variables IACP ficticias; token/upstream ficticios ausentes en HTML y rutas proxy inexistentes con 404.
10. Capturas de escritorio y móvil extraídas del volumen de pruebas y revisadas visualmente en `docs/previews/`.

La comprobación del adaptador real es unitaria con HTTP simulado. No se contactó IACP y ninguna ruta del portal lo invoca.

## Problemas encontrados y resueltos

- adapter-node no puede borrar la raíz de un volumen montado: la salida ahora es un subdirectorio `.artifacts/build`.
- Una etiqueta visualmente oculta en el encabezado de tabla causaba overflow fuera del área de scroll; se reemplazó por aria-label en el encabezado.
- Las bibliotecas de iconos se compilan en el build para evitar conservar el paquete completo en runtime.
- Las dependencias y artefactos que existían de la iteración previa fueron sustituidos por volúmenes Docker.

## Estado al entregar

El servicio de desarrollo permanece saludable en **http://localhost:5173**. El contenedor temporal de producción quedó detenido después de la comprobación. Las imágenes y volúmenes del proyecto se conservan para reproducibilidad; no se eliminaron recursos ajenos.

## Pendientes fuera del alcance vigente

- Auditoría formal de accesibilidad y contraste, y QA en Safari/Firefox y móvil físico; aquí se verificó Chromium en escritorio y viewports móvil/tablet.
- Cualquier autenticación, autorización reader/tenant y conexión API real de IACP. El adaptador permanece desconectado de las rutas.
- Integración del módulo CRM independiente, sin duplicar su lógica comercial.
- Registry privado, workflows Forgejo y despliegue empresarial en Portainer, cuando se autoricen en otra iteración. No faltan credenciales para la validación local; no se solicitaron ni usaron credenciales empresariales.
- Redes, dominio, TLS, reverse proxy, persistencia de sesiones y controles de producción empresarial; no se asumieron valores del entorno.

La evidencia anterior reemplaza el informe de la primera iteración que utilizó herramientas del host. El alcance y método actuales se describen en README.md y FRONTEND.md.
