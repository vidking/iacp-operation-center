# VM 30030 — frontera IaCoC/IACP y auditoría de solicitud

## Conclusión y alcance

La ruta comercial de IaCoC no envía modelo de CPU, flags, NUMA, BIOS, machine/Q35, controladora SCSI, template_id ni arquitectura. No hay defaults `qemu64` en el código productivo. No se añadió `x86-64-v4` como compensación. IaCoC solicita un producto; IACP selecciona/clona/configura la imagen y aplica sus políticas.

La causa de `qemu64` permanece sin determinar. La observación de hardware fue proporcionada por el usuario; no se consultó ni modificó Proxmox directamente para esta auditoría. Tampoco se modificó IACP ni otro repositorio.

## Solicitud reconstruida y evidencia

- Endpoint IACP: `POST https://iac.cyberfuel.com/v1/instances`.
- GUI → BFF: `POST /api/crm/commands`, acción `create`.
- Instancia: `9a48e673-14c5-4ae0-9bbf-bb2e2c9aece2`.
- Operación: `f11b2f27-e19e-423b-87aa-abd08765a824`.
- Idempotency-Key: `4c5c6c56-802f-4886-a868-de690e0c8838`.
- Admisión: `2026-10-26T07:34:23.965Z` (01:34:23 CST).
- Nombre: `iacoc-e2e-061-mvoxxyjx`, VMID 30030, mng01.
- Plan solicitado: `kvm-1`. El driver seleccionó el primer producto de la lista real; la consulta autenticada conservó el orden kvm-1, kvm-2, kvm-3, kvm-4. Sus recursos publicados eran 1 vCPU, 2048 MB y 50 GB.
- Imagen: `ubuntu-2404`, selección del catálogo real y confirmada en la captura de detalle de instancia.

Payload comercial reconstruido del serializador usado por el navegador y de las evidencias existentes, con el secreto redactado:

```json
{
  "name": "iacoc-e2e-061-mvoxxyjx",
  "plan_id": "kvm-1",
  "image_id": "ubuntu-2404",
  "network": { "profile_id": "lab-dhcp" },
  "access": { "root_password": "[REDACTADO]", "ssh_public_keys": [] },
  "start_on_create": true
}
```

No es una captura del paquete HTTP original: por seguridad no se conservó el body con la contraseña. El journal conserva el hash SHA256 canónico `d708fec0cb93f206e4cf2ae75cda667d2609943fdf5e206826fe58c77c94fc5d`, los identificadores y la admisión. El hash incluye el secreto y no puede validarse contra el JSON redactado. No se presenta esa reconstrucción como una captura byte a byte ni se inventa una contraseña para reconstruirla.

## Hardware: responsabilidades y diferencia

| Campo              | Solicitud comercial IaCoC                              | Observación del usuario                              |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------------- |
| Modelo CPU / flags | Ausente                                                | VM 30030 qemu64; Golden 29000 x86-64-v4,flags=+aes   |
| NUMA               | Ausente                                                | Golden habilitado; sin evidencia API para compararlo |
| vCPU / RAM / disco | No enviados en la ruta comercial; los resuelve plan_id | VM 30030 1/2 GiB/50 GB; Golden 2/4 GiB/20 GB         |
| BIOS / machine     | Ausente                                                | Ambas OVMF / Q35                                     |
| SCSI / template_id | Ausente                                                | Sin evidencia remitida                               |

Las diferencias de vCPU, RAM y disco concuerdan con los recursos del plan kvm-1 publicado por IACP; no son prueba de un override técnico de IaCoC. El modelo de CPU y las propiedades certificadas requieren investigación del frente IACP. No se infiere de `image_id` que IACP haya usado efectivamente VMID 29000: la asociación y su preservación necesitan evidencia del Control Plane.

## Correcciones y prevención exclusivas en IaCoC

- Se mantuvo el schema comercial `.strict()` en todos sus niveles. Solo admite los campos comerciales del OpenAPI auditado; rechaza campos técnicos desconocidos.
- Se añadieron pruebas contractuales para cpu_type, cpu_model, cpu, sockets, cores, numa, machine, bios, scsihw, template_id, disk_size, vcpus, memory_mb, disk_gb, node_preference, architecture y flags.
- Se verifica la igualdad de la allowlist comercial con las propiedades del OpenAPI, la selección plan/imagen desde catálogo y la conservación de Idempotency-Key.
- Se bloquearon los drivers de creación, lifecycle y reconciliación reales antes de leer secretos o abrir el navegador. No existe variable ni argumento de desbloqueo. Las suites aisladas usan únicamente fixtures y se ejecutan con Docker `--network none`.
- La limpieza posteriormente autorizada tiene un driver separado, limitado a los UUID exactos de 30029 y 30030, sin create/reboot/reconcile ni force. No forma parte de las suites automatizadas.
- No se modificó el BFF para compensar la CPU de IACP ni se agregó un configurador de hardware.

La compatibilidad histórica de `InstanceCreate` (contrato por perfiles) admite recursos comerciales y node_preference cuando ese schema es el publicado. No fue el contrato utilizado para la VM 30030: el runtime publicó CommercialInstanceCreate. Tampoco esa ruta contiene un modelo de CPU/NUMA/BIOS.

## Investigación solicitada al frente IACP

Rastrear la operación indicada desde `plan_id=kvm-1` e `image_id=ubuntu-2404` hasta la resolución de imagen, clonación y configuración efectiva. Determinar dónde se conservan o sustituyen CPU/flags/NUMA de la Golden certificada, y si el proveedor aplica un default. Verificar la correspondencia efectiva de la imagen certificada. Estos son puntos de investigación, no causas confirmadas. IaCoC no enviará valores técnicos para compensarlos.

No repetir creación real hasta que la discrepancia esté aclarada y se autorice reanudarla. La publicación 0.6.1 y la certificación E2E completa permanecen pendientes; no se acredita conformidad de hardware.
