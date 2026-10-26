<script lang="ts">
  import { evidenceSeconds } from "#lib/diagnostics.ts";
  import { formatTime, utcTime } from "#lib/time.ts";
  import {
    ArrowUpRight,
    ArrowDownUp,
    Server,
    ChevronRight,
  } from "@lucide/svelte";
  import Badge from "./ui/Badge.svelte";
  import EmptyState from "./ui/EmptyState.svelte";
  import { selectedOperation } from "#lib/stores/portal.ts";
  import type { Operation } from "#lib/types/observation.ts";
  let { operations = [] }: { operations?: Operation[] } = $props();
  let direction = $state<"asc" | "desc">("desc");
  let sorted = $derived(
    [...operations].sort((a, b) =>
      direction === "asc"
        ? Date.parse(a.created_at) - Date.parse(b.created_at)
        : Date.parse(b.created_at) - Date.parse(a.created_at),
    ),
  );
</script>

{#if operations.length}<div class="table-wrap">
    <table>
      <thead
        ><tr
          ><th
            ><button
              class="sort-button"
              onclick={() => (direction = direction === "asc" ? "desc" : "asc")}
              aria-label="Ordenar por fecha de admisión"
              >Operación <ArrowDownUp size={12} /></button
            ></th
          ><th>Tipo / recurso</th><th>Estado persistido</th><th>Normalizado</th
          ><th>Intervalo observado</th><th>Última evidencia</th><th
            aria-label="Detalle"
          ></th></tr
        ></thead
      ><tbody
        >{#each sorted as op}<tr
            ><td
              ><button
                class="operation-link mono"
                onclick={() => selectedOperation.set(op.operation_id)}
                >{op.operation_id}<ArrowUpRight size={12} /></button
              ><small>Evidencia autorizada</small></td
            ><td
              ><span class="table-kind"><Server size={14} />{op.kind}</span
              ><small
                ><a class="text-link" href={`/crm?instance=${op.instance_id}`}
                  >{op.instance_id}</a
                ></small
              ></td
            ><td><Badge value={op.status} /></td><td
              ><Badge value={op.normalized_status} /></td
            ><td
              title="Intervalo entre admisión y última evidencia; no mide tiempo de worker"
              >{evidenceSeconds(op.created_at, op.updated_at) ?? "desconocido"} s</td
            ><td
              ><span class="mono">{formatTime(op.updated_at)}</span><small
                >{utcTime(op.updated_at)} · IACP</small
              ></td
            ><td
              ><button
                class="icon-button"
                aria-label={`Ver detalle ${op.operation_id}`}
                onclick={() => selectedOperation.set(op.operation_id)}
                ><ChevronRight size={17} /></button
              ></td
            ></tr
          >{/each}</tbody
      >
    </table>
  </div>{:else}<EmptyState />{/if}
