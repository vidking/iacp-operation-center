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

También completamos el primer plano operativo: inventario con filtros de
estado y campos etiquetados, Operations con títulos prácticos y pasos
publicados, Events en actualización acotada, Workers con observabilidad real o
historial explícito, e Incidents derivado de fallos/incertidumbres. Users &
Access aplica los tres roles con asignación por conector y Settings persiste
tema claro/oscuro, tamaño de letra, densidad y movimiento reducido. Las
ausencias de evidencia se presentan como estados compactos, no como paneles
vacíos de pantalla completa.

## Siguiente hito

Completar cursores de paginación cuando el contrato los publique, añadir el
detalle profundo de instancia y operación, y asociar automáticamente cada
ejecución con su timeline cuando IACP publique correlación suficiente. La
consola no rellenará esos huecos con métricas sintéticas.

## Hitos posteriores

Añadimos acciones de recuperación autorizada únicamente cuando las capacidades
y permisos publicados por IACP estén disponibles. No añadiremos contratos
comerciales, CRM ni cuotas locales.
