# Archivo estable de IaCoC V1

Este documento marca el cierre de la línea V1 de Infrastructure as Code
Operation Center. La rama `stable/v1` conserva la aplicación SvelteKit estable
sin cambios de runtime posteriores a este archivo. El tag anotado
`v1.0.0-legacy-stable` apunta al mismo commit que esta rama.

## Referencia Git

- Commit de código V1 verificado desde `origin/main`: `9191d1af68a437df7b260ef1b13217e7a06c0973`.
- Commit de archivo estable: se registra en el commit que contiene este documento.
- Rama: `stable/v1`.
- Tag: `v1.0.0-legacy-stable`.
- La rama y el tag no deben modificarse mediante force-push.
- `main` continúa siendo la línea estable V1; `develop` se reserva para V2.

## Imagen OCI histórica

La release documentada `v0.6.3-rc.11` registró:

```text
scm.cyberfuel.com/cyberfuel/iacp-operation-center:0.6.3-rc.11
sha256:d953e8d4ef1c65518d6fa575ccd94166684c571c14a4861014d30f0d0cfc66f8
```

Este digest es evidencia documental de la release histórica y no certifica por
sí solo qué imagen está desplegada actualmente. La publicación o actualización
de Portainer no forma parte del cierre de este archivo.

## Arquitectura preservada

V1 usa SvelteKit, TypeScript, Vite, Tailwind, Lucide, un BFF integrado en las
rutas server de SvelteKit y SQLite local para sesiones, configuración,
conexiones, snapshots y auditoría. Las credenciales de conexión se cifran con
AES-GCM y un keyring externo. La aplicación conserva autenticación local,
sesiones, RBAC, validación de conexiones IACP, observabilidad, operaciones,
eventos, incidentes, CRM Simulator y la integración ControlPlaneV2.

El contrato técnico de IACP continúa siendo la autoridad para lecturas y
acciones. V1 conserva sus validaciones de tenant, origen, TLS, límites,
timeouts, estados inciertos y confirmaciones de alcance.

## Estado y limitaciones conocidas

Esta referencia representa el cierre de código V1. No equivale a una aceptación
empresarial ni a una certificación de disponibilidad de IACP, Proxmox, Portainer
o de cualquier dependencia externa. La evidencia empresarial debe consultarse
por separado y con fecha.

V1 no debe recibir nuevas funciones de V2. Las correcciones críticas de
seguridad o disponibilidad deben conservar el contrato, la persistencia y la
compatibilidad de la línea V1, y documentarse con una nueva release de esa
línea.

## Recuperación

Para recuperar V1 se debe desplegar la imagen OCI aprobada de la línea V1 con
su digest verificado y los volúmenes propios de V1: SQLite, keyring y sesiones.
No se deben reutilizar los volúmenes, cookies, keyring ni base de datos de V2.
Antes de cualquier publicación se ejecutan las validaciones V1 y se verifica el
Compose empresarial sin modificar Portainer ni la Stack activa.

## Mantenimiento permitido

Se permiten únicamente parches de seguridad, compatibilidad de dependencias y
correcciones necesarias para mantener V1 operable. Toda evolución de producto,
navegación, diseño o integración nueva se implementa en `develop` como V2.
