# Primera publicación: requisitos y procedimiento

Este documento prepara una publicación futura. No se ejecutó ninguna operación en Portainer, Traefik, el registry ni el Control Plane empresarial. El push de código autorizado no construye ni publica una imagen: no hay workflows Forgejo en este repositorio.

## Stack empresarial preparada

Archivo: `deploy/portainer/docker-compose.yml`, para Docker Standalone gestionado por Portainer. Debe confirmarse ese tipo de entorno y la compatibilidad de su versión Compose antes de desplegar; no es un manifiesto Swarm.

- Imagen `scm.cyberfuel.com/cyberfuel/iacp-operation-center@sha256:<digest>`, preconstruida e inmutable. No usa latest ni build.
- Red externa configurada (pendiente de verificar en destino) `proxy_network` y `traefik.docker.network=proxy_network`.
- Router `iacoc`, regla Host(`iacoc.cyberfuel.com`), entrypoint `websecure`, TLS y servicio `iacoc` con loadbalancer.server.port=3000.
- Sin ports ni otro contenedor Traefik; no se declara certresolver. El certificado debe ser proporcionado por el mecanismo empresarial existente.
- Usuario 1000:1000, cap_drop ALL, no-new-privileges, filesystem readonly, tmpfs, reinicio controlado y healthcheck mínimo.
- Volumen Docker propio para SQLite, una réplica, clave externa montada readonly. No hay bind mount de código.

Los nombres de router/servicio son exclusivos de IaCoC en esta configuración; comprobar que no colisionen con objetos existentes antes de crear la Stack. El Compose valida sintaxis localmente, no la existencia de la red, certificado, imagen, archivo de claves o credenciales empresariales.

## Variables y secretos que debe proporcionar el operador

| Variable / elemento                   | Requisito                                                                                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IACOC_IMAGE_DIGEST`                  | 64 caracteres hex SHA-256 del manifiesto OCI publicado y validado; sin prefijo sha256:                                                                                        |
| Registro Portainer                    | scm.cyberfuel.com, identidad separada con solo lectura de packages/image; no guardarla en el Compose                                                                          |
| Repositorio Git privado               | URL empresarial del repo y credencial Git de lectura en Portainer; referencia al commit revisado en main y Compose path deploy/portainer/docker-compose.yml                   |
| `IACOC_KEYRING_HOST_FILE`             | Ruta absoluta de un archivo regular preaprovisionado fuera de Git y SQLite en el host Docker administrado; UID 1000, modo 0400/0600; bind readonly con create_host_path=false |
| `PUBLIC_ORIGIN`                       | Fijado a https://iacoc.cyberfuel.com en el manifiesto                                                                                                                         |
| `TRUST_PROXY`                         | Fijado a true; requiere aislamiento de red y Traefik que preserve Host y sobrescriba x-forwarded-proto                                                                        |
| `DATA_MODE`                           | MOCK inicialmente; nunca usar LIVE para probar una publicación sin configurar conexión                                                                                        |
| `LIVE_ENABLED`                        | false inicialmente; true solo tras acordar destinos y reader autorizado                                                                                                       |
| `IACP_ALLOWED_TARGETS`                | JSON externo de orígenes HTTPS e IP exactas confirmadas; [] inicialmente                                                                                                      |
| `IACOC_MEMORY_LIMIT`                  | 512m por defecto; revisar con Argon2 y carga esperada antes de reducir                                                                                                        |
| `IACOC_CPU_LIMIT`, `IACOC_PIDS_LIMIT` | 1.0 y 100 por defecto; revisar capacidad                                                                                                                                      |
| Persistencia                          | Volumen local con locks SQLite, backup, retención y propietario UID/GID 1000; confirmar política de backups                                                                   |
| Identidad inicial                     | Nombre, tenant y contraseña elegidos por el operador durante bootstrap; no por variable de build                                                                              |
| Reader IACP                           | Token obtenido del gestor autorizado para ese tenant; introducir una vez en API Connections, nunca en Git ni argumentos CLI                                                   |
| OIDC futuro                           | Issuer, client ID/secret, redirect URI, claims de subject/grupos/tenant y política MFA: todavía no configurados ni implementados                                              |

Si IACP requiere una CA privada, acordar el montaje readonly de su bundle y `NODE_EXTRA_CA_CERTS` antes de habilitar esa conexión. No desactivar la validación TLS. La red proxy debe tener ruta privada autorizada hacia la API de IACP; comprobar firewall, DNS y egress sin añadir conexiones directas a sus bases de datos o motores.

## Preparar y publicar una imagen, cuando se autorice

El procedimiento completo de construcción, login, push y verificación del digest está en [OCI_RELEASE.md](OCI_RELEASE.md). Son instrucciones para una ventana autorizada futura; no se publicó una imagen durante esta reanudación.

## Conectar Portainer, en una ventana posterior autorizada

1. Confirmar tipo/versiones de Portainer y Docker, existencia de proxy_network y ausencia de colisión del router iacoc. Confirmar DNS, regla Host, entrypoint websecure y cobertura TLS existente del dominio. No crear un nuevo certresolver.
2. Configurar registro privado y acceso Git de solo lectura mediante los mecanismos de Portainer. No usar la identidad de IaCoC ni el token IACP para esas funciones.
3. Aprovisionar y respaldar el keyring fuera de Git/SQLite, con permisos para UID 1000, y seleccionar el almacenamiento SQLite propio. No arrancar con claves generadas dentro de un build.
4. Crear una Stack desde el repositorio privado, referencia revisada de main y Compose path empresarial. Configurar las variables anteriores; mantener MOCK y LIVE_ENABLED=false. No activar GitOps/autoupdates sin acordar por separado la política de entrega.
5. Revisar la configuración renderizada: imagen @sha256 real, sin ports, red proxy_network, labels correctas, keyring readonly y almacenamiento persistente. Eliminar cualquier sustitución de prueba como digest de ceros o rutas ficticias.
6. Solo tras autorizar despliegue, crear la Stack. Confirmar health interno. Ejecutar bootstrap con TTY en el contenedor y un operador autorizado antes de usar el portal. El keyring ya estará suministrado; no ejecutar init-key sobre su montaje readonly.
7. Desde un cliente autorizado, comprobar HTTPS, certificado, redirección al login, cookies, logout y Origin/CSRF. Desde un punto externo comprobar que no se alcanza el puerto interno. Estas comprobaciones aún están pendientes en empresa.
8. Para LIVE, confirmar API/versiones OpenAPI, tenant, reader, CA e IP; configurar política externa y LIVE_ENABLED. Crear conexión por Administrator, ejecutar Test Connection y activar. Confirmar aislamiento entre tenants y evidencia stale ante fallos. No solicitar recuperaciones ni provisión.

## Backup, rotación y rollback

SQLite/sesiones sobreviven a la recreación del contenedor. Para una copia coherente sencilla, detener la aplicación y copiar la base junto con cualquier WAL/SHM restante, o utilizar una herramienta SQLite de backup validada. Respaldar el keyring por un canal separado protegido; preservar las claves requeridas por las versiones de backups. Una copia en caliente del archivo principal sin WAL puede perder transacciones.

Para rotar el token IACP, reemplazarlo en API Connections y validar nuevamente. Para rotar la clave de cifrado, detener la aplicación, respaldar DB y keyring, ejecutar la CLI de mantenimiento con escritura explícita sobre el keyring externo y reanudar. Mantener el montaje readonly en la aplicación normal.

Conservar digest anterior y backups antes de actualizar. Rollback: volver al digest aprobado previo y a sus variables compatibles; si existe una migración incompatible, restaurar también DB y keyring del mismo punto de recuperación. No apuntar una versión antigua a un esquema nuevo sin revisar compatibilidad. En esta iteración el esquema es user_version=1. La revocación de sesiones/rotación de contraseñas sigue disponible vía CLI autorizada.

No se puede afirmar que Traefik o Portainer empresarial funcionan hasta completar estas pruebas en el entorno real. El proxy HTTPS de laboratorio verifica el comportamiento de la aplicación; no acredita la configuración, certificados, red o estado de los servicios empresariales.
