# Roadmap V2

## Hito inicial

Completamos shell React, temas Glass, navegación SPA, command palette, sesión
local, BFF, contratos técnicos, keyring AES-GCM, alta/validación/activación de
conectores ControlPlaneV2 y Overview con evidencia desconectada o parcial.

## Hito técnico actual

El BFF ya consume planes, imágenes, inventario, operaciones y eventos del
OpenAPI técnico publicado. Connectors permite mantener varias fuentes activas,
con confirmación single-tenant idempotente por fuente. Provisioning envía
intenciones KVM de laboratorio con secreto de acceso efímero y
Idempotency-Key; el resultado sigue siendo el estado que IACP publica.

## Siguiente hito

Completar la navegación paginada de inventario e historial y añadir el detalle
de operación/instancia, polling acotado por operación iniciada desde IaCoC y la
limpieza autorizada de KVMs desechables cuando IACP publique la evidencia de
eliminación.

## Hitos posteriores

Añadimos recuperación autorizada, administración de usuarios y diagnósticos
únicamente cuando las capacidades y permisos publicados por IACP estén
disponibles. No añadiremos contratos comerciales, CRM ni cuotas locales.
