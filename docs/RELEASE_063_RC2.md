# IaCoC 0.6.3-rc.2 — publicación controlada

## Alcance

Esta candidata conserva `e48d23b` y publica la corrección de API Connections:

- Un reader rechazado por IACP puede reemplazarse y validarse nuevamente.
- `VALIDATION_REQUIRED` no oculta el `401` ni bloquea la recuperación.
- La validación operator está separada de la validación reader.
- Un operator rechazado o perteneciente a otro tenant no invalida reader ni
  habilita CRM.
- Las credenciales permanecen cifradas en el backend y no llegan al navegador.

## Tenant y credenciales

La lectura autorizada de `pilot-operator.token` confirmó tenant
`00000000-0000-0000-0000-000000000001` mediante `GET /v1/observability`.

No se identificó una credencial reader utilizable del mismo tenant. La identidad
reader documentada disponible pertenece al tenant
`0294373d-7075-4eb5-9dca-9ff256298828`; la réplica local de IaCoC usa
`product-validation`. Ninguna de esas evidencias acredita el tenant reader
empresarial de `iacoc.cyberfuel.com`.

El E2E empresarial queda bloqueado hasta que IACP entregue o confirme una
identidad reader cuyo alcance efectivo sea
`00000000-0000-0000-0000-000000000001`.

## Artefactos

- Commit de código: pendiente de publicación.
- Tag Git: `v0.6.3-rc.2`.
- Plataforma OCI: `linux/amd64`.
- Referencia OCI: pendiente de publicación.
- Digest de manifiesto: pendiente de publicación.
- `IACOC_IMAGE_DIGEST`: pendiente de publicación.

## Validación

Se conservará la evidencia de `./scripts/validate.sh`,
`./scripts/validate-persistence.sh`, la suite Chromium y el pull por digest al
completar la publicación.

## Actualización desde rc.1

En una ventana autorizada, respaldar SQLite incluyendo WAL/SHM cuando existan y
el keyring externo por separado. En la Stack empresarial cambiar únicamente
`IACOC_IMAGE_DIGEST` al digest de rc.2, conservar volúmenes, keyring, usuarios,
conexiones, auditoría, red, labels y variables, y recrear únicamente el
servicio IaCoC. No ejecutar `down --volumes`, `init-key`, bootstrap ni cambios
en Portainer fuera de esa sustitución.

## Rollback a rc.1

Restaurar el digest rc.1 registrado en
`docs/RELEASE_063_RC1.md`, manteniendo exactamente los mismos volúmenes,
keyring y variables. No restaurar SQLite automáticamente ni revertir
operaciones IACP ya admitidas.
