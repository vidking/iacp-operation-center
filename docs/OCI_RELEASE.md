# Publicación OCI y puesta en servicio autorizada

Este procedimiento es para una ventana futura: no se publicó una imagen ni se desplegó Portainer durante la reanudación. Todas las compilaciones y herramientas Node se ejecutan en Docker. No configura Forgejo Actions. Usar Bash desde la raíz del repositorio; detenerse ante cualquier error.

## Revisión y construcción en Omarchy

Confirmar primero arquitectura del host Docker destino y soporte del builder para ella. Este flujo construye una sola plataforma con --load; una compilación cruzada requiere emulación o un builder adecuado previamente autorizado. No inferir la plataforma de la laptop.

```bash
set -euo pipefail
git fetch origin
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain)"
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
./scripts/validate.sh
./scripts/validate-persistence.sh
```

No continuar si falla un control. La versión actual de package.json es 0.4.0; actualizar el argumento al cambiarla. No introducir credenciales en argumentos de build.

```bash
read -r -p 'Plataforma confirmada del destino (linux/amd64 o linux/arm64): ' IACOC_PLATFORM
test "$IACOC_PLATFORM" = linux/amd64 || test "$IACOC_PLATFORM" = linux/arm64
IACOC_REVISION=$(git rev-parse HEAD)
IACOC_REPOSITORY=scm.cyberfuel.com/cyberfuel/iacp-operation-center
IACOC_TAG="$IACOC_REPOSITORY:sha-$IACOC_REVISION"
docker buildx build --platform "$IACOC_PLATFORM" --target production \
  --build-arg APP_VERSION=0.4.0 --build-arg VCS_REF="$IACOC_REVISION" \
  --load --tag "$IACOC_TAG" .
```

## Publicación y digest

Revisar el build antes de publicar. Solo con autorización específica de publicación OCI, ejecutar este bloque en la misma sesión Bash. Confirmar permisos y visibilidad del package en la versión empresarial de Forgejo. Usar una identidad con permiso mínimo para publicar ese package; Portainer tendrá otra identidad de solo lectura. No reutilizar tokens IACP, sobrescribir tags SHA aprobados ni usar latest en producción.

El directorio Docker temporal queda fuera de Git y se elimina al terminar. Introducir el token en el prompt oculto, nunca en argumentos/historial. No ejecutar con trazas de shell activadas.

```bash
(
  set +x
  set -euo pipefail
  test -n "$IACOC_TAG"
  test -n "$IACOC_REVISION"
  test -n "$IACOC_REPOSITORY"
  test -n "$IACOC_PLATFORM"
  IACOC_DOCKER_CONFIG=$(mktemp -d)
  chmod 700 "$IACOC_DOCKER_CONFIG"
  trap 'unset IACOC_REGISTRY_TOKEN; rm -rf -- "$IACOC_DOCKER_CONFIG"' EXIT
  read -r -p 'Identidad de publicación Forgejo: ' IACOC_REGISTRY_USER
  read -r -s -p 'Token de publicación Forgejo: ' IACOC_REGISTRY_TOKEN
  printf '\n'
  printf '%s' "$IACOC_REGISTRY_TOKEN" | docker --config "$IACOC_DOCKER_CONFIG" login \
    scm.cyberfuel.com --username "$IACOC_REGISTRY_USER" --password-stdin
  unset IACOC_REGISTRY_TOKEN
  docker --config "$IACOC_DOCKER_CONFIG" push "$IACOC_TAG"
  IACOC_DIGEST=$(docker --config "$IACOC_DOCKER_CONFIG" buildx imagetools inspect \
    "$IACOC_TAG" --format '{{.Manifest.Digest}}')
  [[ "$IACOC_DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]]
  IACOC_REFERENCE="$IACOC_REPOSITORY@$IACOC_DIGEST"
  docker --config "$IACOC_DOCKER_CONFIG" pull --platform "$IACOC_PLATFORM" "$IACOC_REFERENCE"
  test "$(docker image inspect "$IACOC_REFERENCE" \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$IACOC_REVISION"
  printf 'Referencia aprobada: %s\nIACOC_IMAGE_DIGEST=%s\n' \
    "$IACOC_REFERENCE" "$(printf '%s' "$IACOC_DIGEST" | cut -d: -f2)"
)
```

Registrar SHA, plataforma, resultados de pruebas y **digest del manifiesto del registry**, distinto del ID local de imagen. Usar únicamente su sufijo hexadecimal en IACOC_IMAGE_DIGEST. Un fallo de push/pull bloquea la entrega; no sustituir el digest por un tag. Verificar también pull por digest desde el host destino con su identidad de lectura. Este procedimiento no se ha ejecutado contra el registry privado en esta reanudación.

Referencias oficiales: [Forgejo Container Registry](https://forgejo.org/docs/latest/user/packages/container/), [Docker login](https://docs.docker.com/reference/cli/docker/login/) e [inspección de manifiestos](https://docs.docker.com/reference/cli/docker/buildx/imagetools/inspect/).

## Clave externa y administrador inicial

En la ventana autorizada, el operador del host Docker debe preparar un directorio externo protegido, vacío y propiedad UID/GID 1000. Usar la imagen aprobada por digest. Las variables siguientes se introducen en la terminal del host destino: referencia completa por digest y ruta absoluta del directorio elegido, fuera de Git y SQLite. No usar una ruta de la laptop en el servidor.

```bash
read -r -p 'Referencia OCI aprobada completa por digest: ' IACOC_REFERENCE
read -r -p 'Directorio externo existente con permisos UID 1000: ' IACOC_SECRETS_DIR
test -n "$IACOC_REFERENCE"
test -d "$IACOC_SECRETS_DIR"
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --user 1000:1000 \
  --mount "type=bind,src=$IACOC_SECRETS_DIR,dst=/run/iacoc-secrets" \
  --env IACOC_KEYRING_FILE=/run/iacoc-secrets/iacoc-keyring.json \
  --entrypoint node "$IACOC_REFERENCE" \
  --experimental-strip-types scripts/security-admin.mjs init-key
```

La CLI genera una clave aleatoria, archivo modo 0600 y creación exclusiva: no imprime material sensible ni sobrescribe un archivo existente. Respaldar por el canal seguro acordado. Configurar IACOC_KEYRING_HOST_FILE con la ruta absoluta resultante. La Stack lo monta readonly; no ejecutar init-key sobre el montaje de la aplicación normal. No copiar el contenido a tickets/logs.

Conectar Portainer siguiendo [PUBLISHING.md](PUBLISHING.md), usando MOCK y LIVE_ENABLED=false. Después de arrancar la Stack saludable, identificar su contenedor en Portainer; no asumir un nombre generado. En una terminal TTY autorizada del host administrado:

```bash
read -r -p 'ID del contenedor IaCoC identificado en Portainer: ' IACOC_CONTAINER_ID
docker exec -it "$IACOC_CONTAINER_ID" node --experimental-strip-types scripts/bootstrap-admin.mjs
```

Introducir nombre propio, tenant confirmado y contraseña única de al menos 14 caracteres mediante el prompt oculto. Se crea un Administrator solo si el almacén está vacío; una segunda ejecución se rechaza. No borrar SQLite para repetir el bootstrap. No hay credenciales predeterminadas. Gestionar usuarios, roles y revocaciones posteriores según [SECURITY.md](SECURITY.md); las contraseñas nunca van en argumentos.

## Comprobaciones empresariales pendientes

1. Confirmar Docker Standalone, versiones Portainer/Compose y arquitectura; el manifiesto no es Swarm. Verificar con docker network inspect proxy_network la existencia de la red externa y conexión del Traefik existente y de IaCoC. Confirmar entrada websecure, router/servicio iacoc sin colisiones y certificado válido del dominio. No crear una red ni certresolver sustitutos.
2. Traefik debe preservar Host y sobrescribir X-Forwarded-Proto a https. IaCoC fija el origen canónico y no toma Host/IP reenviados del cliente. Restringir quién puede conectarse a la red compartida: la cabecera de protocolo no autentica al proxy frente a otros contenedores de esa red.
3. Desde un cliente autorizado, comprobar DNS y ejecutar las consultas siguientes. El certificado debe validarse sin -k. Health devuelve solo estado técnico; la raíz redirige al login sin datos operativos.

```bash
curl --fail --show-error https://iacoc.cyberfuel.com/health
curl --silent --show-error --dump-header - --output /dev/null https://iacoc.cyberfuel.com/
```

4. En navegador verificar login correcto/incorrecto, cookie __Host-iacoc-session Secure/HttpOnly/SameSite=Lax, logout y revocación, RBAC y rechazo de formularios sin CSRF u Origin permitido. No copiar cookies ni contraseñas al informe.
5. Verificar health interno, persistencia después de recrear y logs sin secretos desde Portainer. Confirmar ausencia de puertos publicados de IaCoC y acceso externo bloqueado al puerto 3000. La prueba local del proxy HTTPS no acredita Traefik empresarial.

iac.cyberfuel.com es la API prevista, todavía sin validar. Antes de habilitar LIVE faltan origen/IP exactas, DNS, conectividad privada, CA, tenant, token reader y compatibilidad del contrato real. Mantener MOCK, LIVE_ENABLED=false e IACP_ALLOWED_TARGETS=[] hasta entonces. No se necesita LIVE para publicar y revisar el portal autenticado en MOCK.
