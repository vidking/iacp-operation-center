# IaCoC 0.6.1 — cierre y publicación preparada

Este documento prepara el commit y la publicación futura. No se ejecuta push, no se publica una imagen OCI y no se actualiza Portainer como parte de esta revisión.

## Checks locales previos al commit

Ejecutar desde el repositorio, usando Docker:

```sh
./scripts/validate.sh
./scripts/validate-persistence.sh
git diff --check
git status --short
```

`validate.sh` debe producir lint, svelte-check, pruebas unitarias/integración, build, validación de Compose y pruebas de navegador. `validate-persistence.sh` debe ejecutarse solo sobre volúmenes desechables o un entorno de validación autorizado.

Antes del commit revisar manualmente:

- `docs/API_COVERAGE_061.md` y esta matriz final;
- diff completo, archivos generados y ausencia de secretos;
- imagen OCI por digest en el manifiesto empresarial, sin publicar todavía;
- que no haya cambios en IACP, Proxmox, Golden Images, Portainer o Jira;
- que el E2E real siga bloqueado hasta cerrar la discrepancia CPU y recibir autorización.

## Commit local

Después de los checks y de una revisión del diff, preparar un único commit local de 0.6.1 con un mensaje equivalente a:

```sh
git add <archivos-revisados>
git commit -m "feat(iacoc): complete 0.6.1 GUI coverage and E2E gate"
```

No usar `git add -A` sin revisar el inventario: el repositorio contiene evidencia y cambios locales aprobados que deben conservarse intencionalmente.

## Publicación futura, separada del cierre funcional

1. Ejecutar los checks anteriores en un entorno Docker limpio.
2. Construir `linux/amd64` con el Dockerfile de producción y obtener el digest del manifiesto.
3. Escanear la imagen y verificar que no contiene secretos ni fixtures de runtime.
4. Publicar el digest en el registro OCI autorizado.
5. Actualizar únicamente el manifiesto empresarial con ese digest en una ventana separada y aprobada.
6. Verificar red `proxy_network`, `websecure`, DNS, certificado, healthcheck y ausencia de puertos publicados en el destino.
7. Activar LIVE solo después de configurar reader, tenant, política de origen/IP, TLS y conexión validada.

La publicación de una imagen no acredita una conexión empresarial ni ejecuta el E2E real.
