# IaCoC Operation Center V2

La V2 es una reconstrucción React independiente de la línea SvelteKit V1.
main y stable/v1 conservan V1; develop contiene el nuevo runtime.

## Desarrollo local

El entorno local está aislado de producción y no contiene credenciales
predeterminadas ni un Bearer real. Para habilitar conectores localmente se
provisiona primero un keyring externo en el volumen de desarrollo:

    docker compose -f deploy/v2/docker-compose.yml up --build

El primer Administrador y el keyring se crean mediante comandos separados que
leen exclusivamente stdin; nunca se pasan como argumentos ni se guardan en Git.

Abrimos http://localhost:5174. Sin una sesión creada, la aplicación muestra
el estado desconectado y solicita autenticación. El mock IACP solo se inicia
con el perfil de pruebas.

## Validación

Todos los comandos Node, npm, builds, formatters y pruebas se ejecutan dentro
de Docker:

    ./scripts/validate.sh
    ./scripts/validate-persistence.sh
    git diff --check

No se modifican Portainer, producción, IACP, Proxmox ni Terraform.
