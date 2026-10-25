# Arquitectura vigente

El alcance vigente es frontend MOCK desarrollado exclusivamente dentro de Docker. Ver [FRONTEND.md](FRONTEND.md) para componentes, datos, tipos y estructura.

`+layout.server.ts` obtiene fixtures locales. No selecciona un adaptador por variables de entorno y no realiza peticiones HTTP. Incluso si DATA_MODE=IACP existe en el entorno, las rutas sirven exclusivamente DEMO. `/health` solo acredita liveness de IaCoC, no IACP ni workers.

El adaptador de lectura existente en `src/lib/server/data/iacp.ts` se conserva desconectado, con pruebas unitarias. Sus métodos no están expuestos como endpoints. Una iteración posterior deberá conectar el puerto `ObservationClient` a una API autenticada y autorizar reader/tenant antes de habilitar evidencia real.

Fuentes de referencia consultadas en lectura, sin modificar repositorios vecinos:

- `../iacp-controlplane/docs/IACOC_CONTRACT.md`
- `../iacp-controlplane/docs/CRM_INTEGRATION.md`
- `../iacp-controlplane/docs/openapi.json`, versión 0.10.1; extracto y SHA-256 en `contracts/readonly-openapi-excerpt.json`.

Las proyecciones Zod se encuentran en `src/lib/types/observation.ts`; el módulo servidor anterior las reexporta para compatibilidad. `status` y `normalized_status` se conservan separados. Un resultado incierto prevalece visualmente aunque el estado histórico sea failed. Los IDs de correlación usan operation_id como fallback de presentación cuando falta correlation_id.

Los fixtures de operaciones/eventos siguen las proyecciones del contrato. Los fixtures de gráficas, workers, colas, incidentes y CRM son modelos visuales independientes, rotulados DEMO. No constituyen contratos upstream. El feed real puede confirmar IDs fuera de orden y no es un outbox; una futura integración necesitará paginación, solapamiento y deduplicación sin afirmar entrega sin pérdida.

No hay polling, reintentos, reconciliación, comandos, infraestructura, conexiones DB/Redis ni persistencia de negocio. Todos los procesos Node se ejecutan en contenedores; el código fuente sigue en Git y editable en Omarchy.
