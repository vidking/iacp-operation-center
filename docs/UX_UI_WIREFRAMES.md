# Propuesta UX/UI: Infrastructure Operations Workspace

Fecha: 2026-10-28<br>
Dirección seleccionada para implementar: **workspace operativo graphite-first**.

La propuesta responde a las capturas auditadas: elimina la hero dominante de Overview, concentra la atención en evidencia y búsquedas, conserva el isotipo hexagonal y mantiene azul eléctrico/naranja tecnológico como señales semánticas. La ilustración completa queda reservada para Login y superficies de identidad donde sí aporta contexto.

## Sistema visual

Tokens iniciales, reutilizables desde `console.css`:

```text
graphite-950  #080e16   fondo de aplicación
graphite-900  #0f1722   superficie principal
graphite-800  #172231   superficie elevada / drawer
line-cool     #2a3b4d   separación estructural, no decoración
text          #e7eef7   información primaria
muted         #9aacbe   metadatos secundarios
electric-blue #59c8ff   enlaces, foco, evidencia publicada
signal-orange #f5a064   selección y advertencia verificable
success       #67d4b5   estados terminales satisfactorios
danger        #ef8e9c   fallo explícito
```

Escala:

- título de página: 28–32 px;
- sección: 20–22 px;
- texto funcional: 14–16 px;
- tabla: 14 px;
- metadatos e identificadores: 12–13 px, con monospace solo donde ayuda;
- etiqueta mínima: 11 px, nunca para la información operativa principal.

El layout usa una columna de navegación estable en escritorio, un topbar de 64–68 px, un contenido con ancho máximo legible y superficies abiertas. Las tarjetas quedan para métricas o estados que requieren comparación; listas, timeline y tablas no se envuelven en paneles anidados sin propósito.

## Overview

```text
┌─ Sidebar ───────────┬─ Topbar: breadcrumb · buscar · conexión · perfil ────────┐
│ isotipo + workspace │                                                        │
│ Overview            │ Overview                         [Actualizar]           │
│ Operations          │ Visibilidad operativa. Evidencia para decidir.          │
│ Events              │ ─────────────────────────────────────────────────────── │
│ Workers & Queues    │ [● Conectado]  última evidencia · vínculo Conectores    │
│ Incidents           │                                                        │
│ CRM                 │ Resumen operativo                                      │
│                     │  Activas  3     Fallidas relevantes  2     Instancias  4│
│ Administración      │  Vigencia: Actual · consultado 10:39 CST                │
│                     │                                                        │
│ estado / perfil     │ Actividad reciente                         Ver todas →  │
│                     │ ┌ acción ─ recurso / VMID ─ resultado ─ evidencia ─ → ┐ │
│                     │ │ Eliminación · control-plane-api / 30059 · fallida   │ │
│                     │ │ Encendido   · billing-worker / 30060  · completada  │ │
│                     │ │ ...                                                   │ │
│                     │ └─────────────────────────────────────────────────────┘ │
│                     │                                                        │
│                     │ Dependencias observadas: PostgreSQL · Redis · ...       │
└─────────────────────┴────────────────────────────────────────────────────────┘
```

La cifra de “Instancias” solo aparece si el inventario publicado está disponible; no se crea con un conteo local inventado. La actividad es una ventana de 5–10 registros y enlaza al historial paginado.

## Operations

```text
┌─ Operations ──────────────────────────────────────────────────────────────────┐
│ [Todas 780] [En ejecución 1] [Completadas 721] [Inciertas 0] [Fallidas 58]    │
│                                                                              │
│ [ Buscar por nombre, VMID, UUID, operación o código…              ] [Buscar] │
│ [Estado ▾] [Acción ▾] [Cronológica | Por instancia] [Más filtros ▾]          │
│                                                                              │
│ Actividad cronológica · 50 de 780 · evidencia más reciente primero            │
│ ┌ Recurso / VMID ───┬ Acción ───────┬ Resultado ─┬ Última evidencia ┬ Detalle┐│
│ │ test-api · 30059  │ Eliminación   │ failed     │ 01:43 CST         │   →    ││
│ │ worker-2 · 30060  │ Encendido     │ completed  │ 01:41 CST         │   →    ││
│ └───────────────────┴───────────────┴────────────┴──────────────────┴────────┘│
│ Página 1 de 16       [25] [50] [100]          [«] [‹] [1] [2] … [16] [›] [»] │
└──────────────────────────────────────────────────────────────────────────────┘

Más filtros (popover/panel): instancia exacta, operation_id, rango/orden y
otros filtros publicados. Los identificadores completos aparecen en el drawer.
```

La búsqueda principal convierte `30060` en una consulta tenant-scoped normal. No se envía un VMID a un parámetro de UUID. La vista por instancia reutiliza la paginación global y cada grupo expande su historial sin descargar otra vez todo el tenant.

## Events

```text
┌─ Events ───────────────────────────────────────────────────────────────────────┐
│ [Instancia, operación o correlación…] [Estado ▾] [Vista ▾] [Más recientes ↓]  │
│ Sin eventos nuevos · cursor válido · última sincronización 10:40:12 CST       │
│                                                                              │
│ ● 01:43 CST   Eliminación de KVM fallida       test-api · VM 30059   failed   │
│               PLAN_INTEGRITY_FAILED · operación 6303…              Ver →     │
│                                                                              │
│ ● 01:43 CST   Plan de eliminación iniciado     test-api · VM 30059   running  │
│               delete_plan_started · operación 6303…               Ver →      │
│                                                                              │
│   detalle expandido: Correlation · Operation · Instance · Actor · Servicio   │
│   timestamp UTC/local · diagnóstico publicado                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

Una respuesta vacía con cursor válido es un estado normal y discreto. Solo se eleva un aviso cuando la respuesta es inválida, el cursor retrocede/no es entero seguro o existe evidencia de interrupción; la deduplicación por `event_id` se mantiene.

## Workers & Queues

```text
┌─ Workers & Queues ────────────────────────────────────────────────────────────┐
│ Evidencia disponible y límites de instrumentación                              │
│                                                                              │
│ Arquitectura conceptual — no representa telemetría                            │
│                                                                              │
│ [Control Plane] ──→ [Queues] ──→ [Workers] ──→ [Operations] ──→ [KVM / LXC]  │
│       publicada          no publicada       no publicada       evidencia      │
│                                                                              │
│ Telemetría publicada                                                          │
│ No hay worker liveness ni profundidad de cola publicados para esta lectura.  │
│ La edad activa, si existe, se refiere a admisión de operación: 3 h 18 min.   │
│                                                                              │
│ [Ver operaciones activas →]                         [Consultar evidencia →]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

La arquitectura es una explicación visual, no un health check. Si IACP publica Worker ID, heartbeat, liveness o queue depth, se añaden como evidencia con timestamp; si no, el vacío comunica el límite sin repetir cuatro tarjetas “No disponible”.

## Revisión contra las capturas

La propuesta corrige los problemas visibles sin cambiar el contrato operativo:

1. Elimina el bloque hero gigante y devuelve el primer viewport a conectividad, actividad y navegación.
2. Cambia la colección de paneles repetidos por una secuencia de resumen, actividad y dependencias.
3. Une la búsqueda de Operations y deja UUID/otros exactos en “Más filtros”.
4. Convierte Events en una línea de actividad legible y hace explícita la diferencia entre feed sin novedades y feed inválido.
5. Explica Workers como arquitectura conceptual y separa lo publicado de lo no instrumentado.
6. Mantiene detalle lateral, paginación, URL state, estados normalizados, evidencia y guardas de seguridad.
7. En móvil, los controles se apilan en una barra con un único campo principal; las tablas se convierten en filas operativas y el overflow queda limitado a la superficie que realmente lo necesita.

## Criterios para implementar y revisar

- No se usa texto menor de 11 px para información operativa.
- El documento no tiene scroll horizontal en 390–1920 px; cualquier tabla ancha usa solo scroll interno.
- Todas las superficies tienen focus visible, labels explícitos y navegación por teclado.
- `prefers-reduced-motion` desactiva transiciones no esenciales.
- Las fechas se presentan en hora local y UTC cuando el detalle lo exige; se conserva el timestamp original.
- Los paneles laterales tienen botón de cierre, Escape y foco recuperable.
- La UI nunca habilita acciones mutantes con evidencia stale y no inventa métricas ausentes.
