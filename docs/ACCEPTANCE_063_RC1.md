# IaCoC 0.6.3-rc.1 — aceptación empresarial

Esta aceptación se ejecuta desde Chromium/Playwright dentro de Docker contra
`https://iacoc.cyberfuel.com`, con un Administrator del tenant autorizado. No
guardar credenciales, cookies, tokens ni cuerpos sensibles en el repositorio,
logs, screenshots o reportes.

La imagen candidata es:

```text
scm.cyberfuel.com/cyberfuel/iacp-operation-center@sha256:e42c36108c28a67b663b396ee0673c59a9f3717a1072f0c7a41558db964a4acf
```

## Preparación segura

- Confirmar versión y digest desplegados antes de comenzar.
- Usar una identidad reader y una identidad operator dedicadas al mismo tenant.
- Confirmar rol local Administrator y tenant correcto.
- Preparar exactamente una KVM nueva, desechable, en MNG.
- Excluir VM 30029, recursos existentes, plantillas y máquinas históricas.
- Usar solo credenciales entregadas por stdin/gestor seguro; el runner debe
  limpiar variables en memoria después de configurar las conexiones.
- La política local mantiene suspendidas las mutaciones automáticas hasta una
  autorización explícita del recorrido. Los modos `baseline` y `read` del runner
  sirven para validar acceso y lecturas sin crear infraestructura.

## Verificación de solo lectura

1. Abrir el portal y autenticar al Administrator.
2. En `Administration → API Connections`, comprobar servidor, tenant, estado
   reader, última consulta y diagnóstico. Validar operator una sola vez y
   comprobar que no se solicite nuevamente al ejecutar acciones.
3. Entrar a CRM Simulator y verificar que el catálogo carga aunque Events u
   Operations estén degradados.
4. Confirmar planes publicados, KVM 1 y Ubuntu 24.04 con estado `certificada` o
   `habilitada`, autorización y disponibilidad. No deben aparecer imágenes
   desconocidas o deshabilitadas como seleccionables.
5. Completar el formulario sin CPU, modelo CPU, NUMA, controladora, firmware,
   bridge, nodo ni otros overrides técnicos. Antes de mutar, inspeccionar solo
   los nombres de campos del request y confirmar que no hay overrides.
6. Consultar Inventario, Operations, Events y Overview. Confirmar que las
   recientes aparecen primero, que Events avanza incrementalmente y que cada
   vista distingue `queriedAt` de `observedAt`.
7. Confirmar fechas en `America/Costa_Rica`, edad de evidencia y ausencia de
   errores de consola o solicitudes pendientes sin timeout.

## Recorrido E2E autorizado

Solo después de autorizar expresamente la mutación:

1. Seleccionar el plan e imagen certificados y completar únicamente datos
   comerciales admitidos.
2. Pulsar `Crear KVM` desde la GUI. Registrar `operation_id`, `instance_id`,
   timestamp local y respuesta de admisión.
3. Seguir la operación desde la interfaz hasta estado terminal. Una admisión
   `202` no equivale a provisión completada.
4. Abrir la instancia desde Inventario y registrar VMID, UUID, estado, IP, nodo,
   CPU/RAM/disco publicados, imagen y evidencia temporal.
5. Ejecutar secuencialmente, verificando cada estado antes del siguiente:

   `Crear apagada → Encender → running → Reiniciar → resultado → Apagar → stopped → Encender → running → Apagar → Eliminar`.

6. Confirmar la eliminación con el diálogo y verificar que la instancia ya no
   aparezca como activa.

Ante error, timeout, discrepancia de hardware, evidencia incompleta, correlación
perdida o estado incierto: detener mutaciones posteriores, conservar la evidencia
y no reenviar, recuperar forzadamente ni eliminar el recurso incierto.

## Evidencia esperada

El reporte sanitizado debe contener únicamente:

- versión, digest y timestamp `America/Costa_Rica`;
- tiempos de login, CRM, catálogo, BFF y respuestas IACP;
- estado reader/operator y diagnóstico sin valores secretos;
- operation ID, instance ID, VMID y estados;
- `queriedAt`, `observedAt`, frescura y correlation ID cuando estén publicados;
- eventos nuevos incorporados sin recarga manual;
- screenshots sin credenciales, cookies, tokens ni contraseñas;
- errores de consola, solicitudes fallidas o pendientes;
- resultado individual de cada transición lifecycle.

La suite local de 20 pruebas Chromium y sus fixtures son evidencia automatizada
local, no aceptación empresarial. La candidata no se declara estable hasta que
este recorrido real de CRM, Operations, Events, creación y lifecycle finalice sin
incidentes.
