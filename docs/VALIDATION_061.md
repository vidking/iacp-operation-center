# Validación incremental 0.6.1

## Acreditado

- Base 0.6.0 preservada. Versión de desarrollo 0.6.1; ningún cambio en la Stack empresarial.
- Docker exclusivamente para Node/npm/app/build/tests. `iacoc-tests` tiene `network_mode: none`: los tests de navegador levantan servidores/dobles locales y no pueden acceder a IACP/Proxmox.
- Primera validación completa aislada: 160 unitarias/integración, 17 Chromium, check 0 errores/0 advertencias y build PASS. Tras ampliar la cobertura API: **168 unitarias/integración y 18 Chromium**, check sin errores/advertencias y 115 artefactos compilados inspeccionados sin fuentes ficticias.
- Compose local/producción válidos; manifiesto Portainer verificado estructuralmente; Docker buildx --check PASS. Compose completos en raíz y deploy/portainer.
- `IACOC_UPGRADE_FROM=scm.cyberfuel.com/cyberfuel/iacp-operation-center:sha-5af3feaaa5730c91eb5cd2581fe58ed71cf5f6b1 ./scripts/validate-persistence.sh`: PASS. Preservó usuarios, sesiones, conexiones, AAD/ciphertexts, auditoría, keyring, intención incierta y secreto lifecycle separado al migrar 0.6.0→0.6.1 y recrear. SQLite user_version=1. Proyecto desechable, sin tocar volúmenes empresariales.
- OpenAPI real autenticado leído sin mutaciones y contratos Forgejo contrastados (HEAD observado 47f5fd22800900b8f374881657662df78680c07b). Generación offline: 28 operaciones/38 tipos. Matriz completa: API_COVERAGE_061.md.

## Navegador real y límites

Se configuraron observación y operator desde API Connections en una instalación Docker local aislada conectada al tenant autorizado de IACP. Sin tokens en logs/repositorio/browser storage; no se usó bootstrap ni administration. La identidad utilizada para observación tiene rol operator pero se empleó exclusivamente para GET; no se presenta como reader de privilegio mínimo.

Se enviaron creación y observación/reconciliación por GUI para VM30030. El resultado inicial fue uncertain/PROXMOX_OBSERVATION_FAILED. La reconciliación del mismo UUID se completó; la entrega todavía estaba inicializando cuando IACP rechazó shutdown con INSTANCE_BUSY. La eliminación posteriormente autorizada completó con deletion.phase=deleted. La eliminación solicitada para VM30029 fue rechazada por APPROVED_POSTCONDITION_MISMATCH y el usuario asumió su intervención manual; no hubo force/retry. VM30028 ya deleted, sin nueva acción.

La lectura final se conservó en evidence/061/cleanup-final-readonly.json. Ninguna lectura de Proxmox nativa. No se acredita hardware conforme ni ciclo completo de energía en 0.6.1. Nuevas creaciones reales bloqueadas en herramientas de aceptación hasta aclarar CPU y autorizar reanudación. No se publicará una release como MVP certificado basándose solo en dobles.

## Regresiones cubiertas

Fallo histórico de reboot en VM30028 + deleted no permite recuperación (UI/BFF). Incertidumbre explícita, endpoint ausente, recurso cambiado/tenant/RBAC, confirmación e idempotencia, timeout/revocación/401/403/409/429/503, evidencia sanitizada, CR/UTC y medianoche. Se conserva el fallo histórico; Guest Agent timeout no acredita causa primaria.

Drivers mutantes reales (incluida la herramienta puntual de limpieza una vez finalizada) bloqueados antes de acceder a credenciales o lanzar navegador; sin flag/env de bypass. Ninguna suite normal los invoca. Las nuevas capacidades de red/acceso/continuación/retry tienen pruebas aisladas; no se declaran ejecutadas contra infraestructura real.

## Publicación

Pendiente: aceptación real completa tras investigación IACP, commit/push y OCI inmutable. No hay digest 0.6.1 publicado. Se preserva el digest 0.6.0. Upgrade preparado conservando volúmenes SQLite/keyring; rollback por referencia inmutable 0.6.0 según RELEASE_060.md, sin bootstrap/init-key ni borrado de datos. La imagen local de revisión no es una publicación empresarial.

## Cierre de checks locales

`./scripts/validate.sh`: PASS (Docker build check, manifiesto Portainer, Compose, lint, typecheck, 168 unitarias/integración, build, 115 artefactos de producción y 18 Chromium). `./scripts/validate-persistence.sh` con imagen base 0.6.0 inmutable: PASS. `git diff --check`: PASS. Escaneo en Docker sin red de 197 archivos contra los dos valores exactos autorizados recibidos por stdin: PASS; ningún valor impreso. No hubo nuevas creaciones reales durante este cierre. Cambios locales conservados, sin commit/push ni publicación OCI 0.6.1; no se declara aceptación empresarial completa.
