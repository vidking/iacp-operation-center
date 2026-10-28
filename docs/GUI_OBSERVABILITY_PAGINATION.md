# IaCoC — Operations, Events y paginación global

## Alcance

Esta nota documenta la normalización aplicada a las vistas Operations, Events,
Incidents, Overview y CRM Simulator. Las consultas continúan pasando por el
BFF y por la conexión Bearer cifrada existente; no se agregan endpoints ni
fuentes sintéticas al runtime.

## Operations

El contrato de IACP entrega operaciones mediante páginas técnicas por `offset`
y no publica un total ni un orden descendente global. Para evitar que la GUI
ordene solamente la página visible, IaCoC mantiene un índice de lectura en
memoria, aislado por conexión, versión y tenant.

- La primera lectura recorre las páginas disponibles y deduplica por
  `operation_id`.
- Las lecturas posteriores consultan nuevamente la cola final con una ventana
  solapada y actualizan el índice; no reconstruyen todo el historial en cada
  polling.
- El orden se calcula sobre el conjunto global observado, con
  `operation_id` como desempate estable.
- La respuesta del BFF incluye `total`, `pageCount`, `offset`, `pageSize`,
  `queriedAt`, `observedAt` y el alcance tenant-scoped.
- Si IACP no proporciona un total autoritativo, el total mostrado es el total
  del índice de lectura observado por IaCoC, no una afirmación sobre recursos
  fuera de ese alcance. La GUI lo identifica como resultado global observado.

Operations conserva filtros globales por UUID de operación, instancia, tipo,
estado y texto; el estado de orden, página y tamaño queda en la URL para que
la navegación y la recarga sean reproducibles. Las páginas disponibles son
25, 50 y 100 registros.

## Events

El feed reciente se inicializa desde la cola final del snapshot disponible y se
actualiza con el cursor incremental publicado por IACP. Los eventos se
deduplican por `event_id`; un cursor que no avanza se marca como evidencia de
cursor detenido y no se presenta como actualización exitosa.

La vista separa:

- **Recientes:** feed incremental, ordenado por `occurred_at` y luego
  `event_id`, descendente por defecto.
- **Historial:** ventanas consultables hacia atrás, sin reemplazar ni perder
  el feed reciente.

Se muestran por separado la última consulta, la última evidencia recibida y la
edad de la evidencia. Los timestamps originales permanecen en UTC; la
presentación utiliza `America/Costa_Rica`.

## Incidents y Overview

Incidents reutiliza el mismo índice global de operaciones y aplica búsqueda,
filtros, orden y paginación antes de devolver la página. Overview conserva su
ventana reciente explícita y enlaza a Operations para consultar el total global
observado; sus indicadores no se presentan como totales del tenant cuando solo
representan una ventana.

Workers y colas continúan mostrando `No disponible` cuando IACP no publica
heartbeat, worker liveness o profundidad de cola. IaCoC no deduce esas métricas
desde operaciones o eventos históricos.

## Estado de errores y concurrencia

Las respuestas obsoletas se cancelan o descartan mediante `AbortController` y
un número de consulta. Un error transitorio conserva la tabla o feed anterior
marcado como obsoleto; no habilita mutaciones usando esa evidencia. La
revocación de autenticación continúa retirando la información protegida.

## Validación

La validación de esta rama incluye pruebas contractuales con el stub del
OpenAPI, pruebas de paginación con 0, 1, 25, 50, 51, 100, 500 y 1.000
operaciones, navegación de primera/intermedia/última página, búsqueda global,
ordenamiento por última evidencia, actualización incremental de Events y
regresión de navegación. Estas pruebas no crean ni modifican máquinas reales;
la aceptación empresarial y cualquier ciclo de infraestructura se reportan por
separado.
