# IaCoC 0.6.1 — diagnóstico y corrección P0 del CRM

## Alcance

Esta revisión se limitó a IaCoC. No se modificaron IACP, Proxmox, Golden Images,
Terraform, Portainer, Jira ni recursos existentes. No se enviaron mutaciones reales
de infraestructura.

## Causa exacta del bloqueo de Crear KVM

El plan del catálogo sí se podía seleccionar, pero el formulario comercial quedaba
sin una imagen compatible y autorizada. El filtro de `CommercialCatalog.svelte`
aceptaba únicamente imágenes con estado `habilitada`; el catálogo publicado por IACP
para la Golden Image certificada usa el estado `certificada`. Por lo tanto:

1. el plan aparecía como seleccionable;
2. la imagen certificada era descartada por la GUI;
3. `compatible` quedaba vacío y `available` era falso;
4. el botón de creación permanecía deshabilitado;
5. no se enviaba `POST /api/crm/commands` al BFF ni se alcanzaba `POST /v1/instances`.

La corrección acepta únicamente los estados de imagen publicados por el contrato y
ya utilizados por IACP (`certificada` y `habilitada`), manteniendo las condiciones
de autorización, disponibilidad y compatibilidad del plan. IaCoC no selecciona
hardware ni envía modelos de CPU, NUMA, controladoras, firmware, bridges u otros
overrides.

### Clasificación por capa

- **Svelte/estado de formulario:** causa raíz. El filtro descartaba la imagen y
  calculaba `available=false`.
- **BFF/FastAPI:** no eran la causa del bloqueo. En la reproducción fallida no
  existía `POST /api/crm/commands`, por lo que tampoco había una solicitud a IACP
  que pudiera fallar.
- **Autorización:** `canOperate` seguía exigiendo Administrator local, reader
  validado y operator configurado; la mejora muestra cómo resolver la falta de
  operator en vez de dejar controles inertes.
- **Sesión:** la prueba autenticada de Chromium conservó la sesión de
  Administrator y completó la configuración de ambas conexiones.
- **IACP:** el contrato de catálogo publica la imagen como `certificada`; no se
  atribuyó a IACP un error de runtime.

## Defectos secundarios encontrados en el navegador

El nombre de instancia tenía un atributo HTML `pattern` con un guion sin escapar.
Chromium lo interpretó con la semántica RegExp `v` y registró un error de consola de
expresión regular inválida. Se escaparon los guiones de ese patrón y de las
referencias comerciales opcionales. La regresión ahora exige cero errores de consola
y cero solicitudes fallidas.

Además, cuando el Administrator no tiene una identidad operator configurada,
`canOperate` correctamente impide la mutación, pero la interfaz no ofrecía una
acción directa para resolverlo. La sección comercial ahora muestra un enlace a
Administration → Conexión IACP y explica que la identidad operator se guarda una
sola vez, cifrada en el backend. API Connections también muestra las dependencias
que explican un estado `degraded`, en lugar de presentar solo una etiqueta ambigua.

## Correcciones implementadas

- `src/lib/components/sections/CommercialCatalog.svelte`
  - acepta imágenes certificadas publicadas por IACP;
  - muestra `Crear KVM` y conserva la selección comercial;
  - mantiene el envío limitado al contrato comercial (`plan_id`, `image_id`, red
    publicada, acceso, arranque y referencias opacas opcionales);
  - agrega timeout de admisión y mensaje recuperable con la clave de intención;
  - no reintenta automáticamente ni oculta una admisión incierta.
- `src/routes/administration/connections/+page.svelte`
  - guía la configuración inicial de reader/operator;
  - expone la causa concreta de una conexión degradada;
  - no devuelve secretos al navegador ni los solicita de nuevo por operación.
- `src/routes/crm/+page.svelte`
  - aplica timeouts explícitos a lecturas y mutaciones;
  - presenta errores comprensibles y la duración de la última solicitud.
- `tests/browser/crm.spec.ts`
  - agrega una regresión Chromium con Golden Image `certificada`;
  - captura consola, solicitudes fallidas, respuestas, duración observada,
    screenshots, operation ID, instance ID, estados, timestamps y VMID.

## Prueba específica de navegador

La prueba se ejecuta exclusivamente con Playwright/Chromium dentro de Docker y usa
un upstream local de pruebas, no IACP ni infraestructura real:

```text
docker compose run --rm iacoc-tests \
  npx playwright test tests/browser/crm.spec.ts --grep "CRM regression"
```

Resultado: PASS. La prueba selecciona el plan y la imagen certificada, abre el
formulario, verifica que `Crear KVM` esté habilitado, admite la solicitud en el BFF
de prueba y verifica el seguimiento de la operación y el inventario.

La evidencia se escribe en el volumen Docker `iacoc-local_test_results`:

```text
/out/crm-certified-image-regression.json
/out/crm-certified-before-select.png
/out/crm-certified-ready-to-create.png
/out/crm-certified-admitted.png
```

El JSON incluye respuestas como `GET /api/crm/catalog` 200 y
`POST /api/crm/commands` 202, duración navegador, `operationId`, `instanceId`,
estado admitido, estado final, timestamp de actualización y VMID del fixture.
La ejecución validada produjo cero errores de consola y cero solicitudes fallidas.

La prueba usa la GUI para autenticarse, configurar reader/operator, seleccionar el
plan, abrir el formulario, revisar y crear. Las consultas posteriores de operación
e inventario están marcadas en la evidencia como consultas browser-side al BFF;
no son llamadas directas al backend de IACP.

## Reproducción del portal empresarial

Se ejecutó un probe de lectura con Chromium dentro de Docker contra
`https://iacoc.cyberfuel.com`, sin credenciales ni mutaciones. El resultado fue:

- `GET /` → `303` hacia `/login`;
- `GET /login` → `200` con el título de inicio de sesión;
- assets estáticos → `200`;
- solicitudes fallidas → ninguna;
- errores de consola → ninguno;
- TLS y conectividad → alcanzables desde el contenedor.

Este probe confirma que Docker puede alcanzar el portal. No constituye la
reproducción autenticada de la pantalla empresarial porque en esta sesión no se
proporcionaron credenciales locales de IaCoC. Las credenciales entregadas para
Swagger de IACP no se utilizaron como credenciales del portal IaCoC ni se copiaron
a tests, logs o artefactos.

## Estado de cierre P0

El bloqueo determinista de la GUI quedó corregido y cubierto por una regresión de
navegador que pasa. La reproducción autenticada contra el portal empresarial y el
E2E de infraestructura continúan pendientes de credenciales locales de IaCoC,
autorización de laboratorio y resolución previa de la discrepancia de CPU efectiva
en el contrato de IACP. No se ejecutó ninguna creación ni lifecycle real.
