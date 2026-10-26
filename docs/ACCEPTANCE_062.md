# IaCoC 0.6.2 — aceptación humana empresarial

Esta lista debe ejecutarse manualmente desde
`https://iacoc.cyberfuel.com`, después de actualizar Portainer en una ventana
autorizada. No forma parte de la publicación y no debe automatizarse sin una nueva
autorización de mutación.

## Preparación

- Confirmar que la sesión corresponde al tenant autorizado y al rol Administrator.
- Confirmar que se usará una única KVM nueva y desechable de MNG.
- No seleccionar VM 30029, máquinas existentes, plantillas ni recursos históricos.
- Tener disponible una identidad reader y una identidad operator dedicada del mismo
  tenant. Nunca usar `administration` como sustituto.
- Abrir DevTools solo si la política lo permite; no copiar cookies, claves ni
  contraseñas a la evidencia.

## Recorrido

1. Iniciar sesión.
2. Abrir `Administration → Conexión IACP` y validar el acceso de lectura.
3. Registrar una sola vez el acceso operator autorizado y comprobar que aparece
   como configurado; no debe pedirse otra vez al crear o ejecutar lifecycle.
4. Entrar a `CRM Simulator`.
5. Seleccionar el plan publicado `KVM 1`.
6. Seleccionar únicamente `Ubuntu 24.04` con estado certificado y autorizado.
   Una imagen deshabilitada, desconocida o no autorizada no debe ser seleccionable.
7. Completar nombre, red y datos comerciales admitidos por el formulario. No
   introducir CPU, modelo CPU, NUMA, controladoras, firmware, bridge, nodo,
   plantilla ni otros overrides técnicos.
8. Revisar y pulsar `Crear KVM`.
9. Comprobar que aparece una admisión real con `operation ID`; la aceptación no
   equivale todavía a una VM provisionada. Si se inspecciona la red, verificar que
   el BFF responde `202` y que la operación queda correlacionada con IaCoC/IACP.
10. Seguir la operación desde `Operaciones recientes` hasta su estado final,
    registrando timestamps, estado normalizado y cualquier error acreditado.
11. Abrir la instancia desde inventario y registrar instance ID, VMID, estado, IP,
    nodo, CPU/RAM/disco publicados, imagen y última evidencia.
12. Ejecutar solo las acciones lifecycle que aparezcan autorizadas por el estado
    real: Encender, comprobar `running`, Apagar, comprobar `stopped`, Reiniciar
    únicamente cuando esté encendida, comprobar el resultado y finalmente
    Eliminar con confirmación. Tras eliminar, verificar que no figura como activa.

## Evidencia mínima

Registrar en un informe sin secretos:

- fecha/hora local `America/Costa_Rica`;
- versión y digest OCI desplegados;
- operation ID e instance ID;
- VMID, estados y timestamps de cada transición;
- respuesta visible de conexión, catálogo, operación e inventario;
- resultado de cada acción lifecycle;
- screenshots de catálogo, admisión, operación, inventario y resultado final;
- cualquier código de error de IACP.

## Criterio de detención

Detener inmediatamente las mutaciones posteriores ante timeout, error, discrepancia
de hardware, evidencia CPU ausente, estado incierto, operación no correlacionada o
resultado ambiguo. No reenviar automáticamente, no forzar recuperación, no eliminar
un recurso cuyo estado sea incierto y no corregir Proxmox desde IaCoC.

La regresión local de Chromium y sus screenshots no sustituyen esta aceptación
empresarial. La publicación tampoco acredita por sí sola la conformidad de la
Golden Image ni la ejecución del lifecycle real.
