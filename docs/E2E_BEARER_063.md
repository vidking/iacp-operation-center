# IaCoC — E2E Bearer único en dos fases

Este procedimiento prepara una única KVM descartable de MNG. No ejecuta
mutaciones durante la validación local ni autoriza recursos preexistentes.

## Fase 1: precondiciones y aprovisionamiento

Ejecutar el runner dentro de Docker/Chromium con una persistencia aislada:

```text
mutating --approve-single-disposable-mng --stop-after-provision
```

El runner configura la conexión desde API Connections y verifica, antes de
enviar `Crear KVM`:

- sesión Administrator y tenant de la sesión igual al tenant publicado por
  IACP en el catálogo;
- plan publicado `kvm-1` y disponibilidad declarada por IACP;
- imagen `ubuntu-2404`, estado `certificada` o `habilitada`, autorización,
  disponibilidad y compatibilidad con el plan;
- perfil `lab-dhcp` y nodos publicados exclusivamente en `mng01`/`mng02`;
- `start_on_create=false`;
- payload comercial sin CPU, modelo CPU, vCPU, RAM, disco, nodo, bridge, VLAN,
  firmware, NUMA, controladora ni otros overrides técnicos;
- nombre de la única corrida con prefijo `iacoc-e2e-063-`;
- exclusión explícita de VMID 104, 106, 29000 y 30029.

La solicitud se origina en la GUI. Playwright intercepta el request del CRM
antes de que salga del navegador para verificar que no contiene overrides; si
detecta uno, aborta la solicitud y no contacta al BFF.

Después de la admisión y del resultado terminal de aprovisionamiento, el runner
consulta la instancia desde la GUI y escribe un checkpoint sin secretos:

`product-mutating/checkpoint.json`

Contiene `tenant_id`, `name`, `instance_id`, `operation_id`, plan, imagen, red,
VMID, nodo, estado y timestamps. No se crea una segunda VM al reanudar.

## Fase 2: evidencia y lifecycle

El runner se detiene después de provisionar si no existe evidencia CPU pública o
si se solicitó `--stop-after-provision`. No acepta `cpu_model: not_published`.

La continuación requiere ambos archivos y la autorización exacta:

```text
continue --approve-single-disposable-mng \
  --checkpoint=/app/test-results/product-mutating/checkpoint.json \
  --hardware-evidence=/fixture/hardware-evidence.json
```

El archivo de hardware debe ser una atestación de solo lectura, sin secretos:

```json
{
  "verified": true,
  "source": "MANUAL_READ_ONLY_ATTESTATION",
  "instance_id": "<instance_id del checkpoint>",
  "operation_id": "<operation_id del checkpoint>",
  "vmid": 30123,
  "node": "mng01",
  "image": "ubuntu-2404",
  "cpu_model": "<modelo efectivo certificado>",
  "vcpus": 1,
  "memory_mb": 2048,
  "disk_gb": 50,
  "observed_at": "2026-10-27T06:00:00Z"
}
```

El runner exige que la evidencia coincida con el mismo `instance_id`,
`operation_id`, VMID, nodo e imagen del checkpoint y que el VMID no esté
protegido. Una fuente futura `IACP_PUBLIC_CONTRACT` también es válida cuando
IACP publique una evidencia equivalente. La ruta pública prevista para el
adaptador es `instance.result.effective_hardware`, con `cpu_model`,
`certified`, `source` y `observed_at`; mientras no exista, el resultado es
`HARDWARE_EVIDENCE_REQUIRED`.

Solo después de la verificación, y siempre sobre la misma instancia, se ejecuta
desde la GUI:

```text
Encender → verificar running → Reiniciar → verificar resultado →
Apagar → verificar stopped → Encender → verificar running →
Apagar → verificar stopped → Eliminar → verificar deleted
```

Cada transición consulta el estado antes de la siguiente. Un 401/403, fallo,
timeout, estado incierto, discrepancia o evidencia no verificable detiene la
corrida. No hay reintentos ciegos, force-stop ni eliminación automática de un
recurso incierto. La limpieza de una instancia lista pero no certificable debe
autorizarse por separado.

## Fuentes de evidencia

Automático desde GUI/BFF: admisión HTTP, operation ID, instance ID, estado de
operación, VMID, nodo, imagen, vCPU/RAM/disco, red, timestamps, eventos y
resultado de lifecycle.

Manual autorizado: modelo CPU efectivo cuando IACP todavía no lo publica en un
contrato público. IaCoC no consulta Proxmox, Docker, Redis ni bases de datos de
IACP para completar esa evidencia.
