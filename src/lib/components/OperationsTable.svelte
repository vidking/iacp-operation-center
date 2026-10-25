<script lang="ts">
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
  let {
    operations = [],
    demo = true,
  }: { operations?: Operation[]; demo?: boolean } = $props();
  let direction = $state<"asc" | "desc">("asc");
  let sorted = $derived(
    [...operations].sort((a, b) =>
      direction === "asc"
        ? a.operation_id.localeCompare(b.operation_id)
        : b.operation_id.localeCompare(a.operation_id),
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
              aria-label="Ordenar por identificador"
              >Operación <ArrowDownUp size={12} /></button
            ></th
          ><th>Tipo / recurso</th><th>Estado persistido</th><th>Normalizado</th
          ><th>Última evidencia</th><th aria-label="Detalle"></th></tr
        ></thead
      ><tbody
        >{#each sorted as op}<tr
            ><td
              ><button
                class="operation-link mono"
                onclick={() => selectedOperation.set(op.operation_id)}
                >{op.operation_id}<ArrowUpRight size={12} /></button
              ><small
                >{demo
                  ? "Tenant de demostración"
                  : "Evidencia autorizada"}</small
              ></td
            ><td
              ><span class="table-kind"><Server size={14} />{op.kind}</span
              ><small>{op.instance_id}</small></td
            ><td><Badge value={op.status} /></td><td
              ><Badge value={op.normalized_status} /></td
            ><td
              ><span class="mono">{op.updated_at.slice(11, 19)} UTC</span><small
                >{op.updated_at.slice(0, 10)} · {demo ? "MOCK" : "LIVE"}</small
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
