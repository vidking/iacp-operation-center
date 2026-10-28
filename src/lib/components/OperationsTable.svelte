<script lang="ts">
  import { evidenceSeconds } from "#lib/diagnostics.ts";
  import { humanDuration, humanizeKind } from "#lib/operation-display.ts";
  import { formatTime, utcTime } from "#lib/time.ts";
  import { ArrowDownUp, ChevronRight, Server } from "@lucide/svelte";
  import Badge from "./ui/Badge.svelte";
  import EmptyState from "./ui/EmptyState.svelte";
  import { selectedOperation } from "#lib/stores/portal.ts";
  import type { Operation } from "#lib/types/observation.ts";

  type SortColumn =
    "updated_at" | "created_at" | "operation_id" | "kind" | "status";
  type SortDirection = "asc" | "desc";
  type InstanceReference = {
    instance_id: string;
    name: string;
    vmid: number | null;
    node: string | null;
  };
  let {
    operations = [],
    sortBy = "updated_at",
    direction = "desc",
    instanceRefs = {},
    onSort,
  }: {
    operations?: Operation[];
    sortBy?: SortColumn;
    direction?: SortDirection;
    instanceRefs?: Record<string, InstanceReference | null>;
    onSort?: (column: SortColumn) => void;
  } = $props();

  function valueFor(operation: Operation, column: SortColumn) {
    if (column === "operation_id") return operation.operation_id;
    if (column === "kind") return operation.kind;
    if (column === "status") return operation.normalized_status;
    return Date.parse(
      column === "created_at" ? operation.created_at : operation.updated_at,
    );
  }
  function compare(a: Operation, b: Operation) {
    const left = valueFor(a, sortBy);
    const right = valueFor(b, sortBy);
    const result =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "en", {
            numeric: true,
            sensitivity: "base",
          });
    if (result) return direction === "asc" ? result : -result;
    return a.operation_id.localeCompare(b.operation_id, "en", {
      numeric: true,
      sensitivity: "base",
    });
  }
  let sorted = $derived(onSort ? operations : [...operations].sort(compare));
  function toggle(column: SortColumn) {
    if (onSort) {
      onSort(column);
      return;
    }
    if (sortBy === column) direction = direction === "asc" ? "desc" : "asc";
    else {
      sortBy = column;
      direction =
        column === "updated_at" || column === "created_at" ? "desc" : "asc";
    }
  }
  function ariaSort(column: SortColumn) {
    return sortBy === column
      ? direction === "asc"
        ? "ascending"
        : "descending"
      : "none";
  }
</script>

{#if operations.length}
  <div class="table-wrap operations-table-wrap">
    <table class="operations-table">
      <thead>
        <tr>
          <th>Recurso / VMID</th>
          <th aria-sort={ariaSort("kind")}>
            <button
              class="sort-button"
              onclick={() => toggle("kind")}
              aria-label="Ordenar por acción"
            >
              Acción <ArrowDownUp size={12} />
            </button>
          </th>
          <th aria-sort={ariaSort("status")}>
            <button
              class="sort-button"
              onclick={() => toggle("status")}
              aria-label="Ordenar por resultado"
            >
              Resultado <ArrowDownUp size={12} />
            </button>
          </th>
          <th aria-sort={ariaSort("updated_at")}>
            <button
              class="sort-button"
              onclick={() => toggle("updated_at")}
              aria-label="Ordenar por última evidencia"
            >
              Última evidencia <ArrowDownUp size={12} />
            </button>
          </th>
          <th><span class="sr-only">Detalle</span></th>
        </tr>
      </thead>
      <tbody>
        {#each sorted as op}
          {@const instance = instanceRefs[op.instance_id]}
          <tr>
            <td>
              <div class="resource-cell">
                <span class="resource-icon" aria-hidden="true"
                  ><Server size={15} /></span
                >
                <div>
                  <a
                    class="resource-name"
                    href={`/crm?instance=${op.instance_id}`}
                  >
                    {instance?.name ?? op.instance_id}
                  </a>
                  <div class="resource-meta">
                    {#if instance?.vmid !== null && instance?.vmid !== undefined}<span
                        >VM {instance.vmid}</span
                      >{/if}
                    {#if instance?.node}<span>{instance.node}</span>{/if}
                  </div>
                  <small class="mono resource-id" title={op.instance_id}
                    >{op.instance_id}</small
                  >
                </div>
              </div>
            </td>
            <td>
              <strong>{humanizeKind(op.kind)}</strong>
              <small class="operation-code">{op.kind}</small>
              {#if op.error_code}<small class="error-code"
                  >{op.error_code}</small
                >{/if}
            </td>
            <td>
              <Badge value={op.normalized_status} />
              <small class="persisted-status">Persistido: {op.status}</small>
            </td>
            <td>
              <time class="evidence-time" title={utcTime(op.updated_at)}
                >{formatTime(op.updated_at)}</time
              >
              <small
                >Intervalo {humanDuration(
                  evidenceSeconds(op.created_at, op.updated_at),
                )}</small
              >
            </td>
            <td>
              <button
                class="icon-button"
                aria-label={`Ver detalle de ${op.operation_id}`}
                title="Ver detalle"
                onclick={() => selectedOperation.set(op.operation_id)}
              >
                <ChevronRight size={17} />
              </button>
              <span class="sr-only">ID de operación {op.operation_id}</span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <EmptyState
    title="Sin operaciones en esta página"
    description="La ausencia en la página actual no certifica ausencia global."
  />
{/if}
