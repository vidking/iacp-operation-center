<script lang="ts">
  import { evidenceSeconds } from "#lib/diagnostics.ts";
  import { formatTime, utcTime } from "#lib/time.ts";
  import {
    ArrowDownUp,
    ArrowUpRight,
    Server,
    ChevronRight,
  } from "@lucide/svelte";
  import Badge from "./ui/Badge.svelte";
  import EmptyState from "./ui/EmptyState.svelte";
  import { selectedOperation } from "#lib/stores/portal.ts";
  import type { Operation } from "#lib/types/observation.ts";

  type SortColumn =
    "updated_at" | "created_at" | "operation_id" | "kind" | "status";
  type SortDirection = "asc" | "desc";
  let {
    operations = [],
    sortBy = "updated_at",
    direction = "desc",
    onSort,
  }: {
    operations?: Operation[];
    sortBy?: SortColumn;
    direction?: SortDirection;
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
    const left = valueFor(a, sortBy),
      right = valueFor(b, sortBy);
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

{#if operations.length}<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th aria-sort={ariaSort("operation_id")}>
            <button
              class="sort-button"
              onclick={() => toggle("operation_id")}
              aria-label="Ordenar por operación"
              >Operación <ArrowDownUp size={12} /></button
            >
          </th>
          <th aria-sort={ariaSort("kind")}>
            <button
              class="sort-button"
              onclick={() => toggle("kind")}
              aria-label="Ordenar por tipo"
              >Tipo / recurso <ArrowDownUp size={12} /></button
            >
          </th>
          <th>Estado persistido</th>
          <th aria-sort={ariaSort("status")}>
            <button
              class="sort-button"
              onclick={() => toggle("status")}
              aria-label="Ordenar por estado"
              >Normalizado <ArrowDownUp size={12} /></button
            >
          </th>
          <th>Intervalo observado</th>
          <th aria-sort={ariaSort("updated_at")}>
            <button
              class="sort-button"
              onclick={() => toggle("updated_at")}
              aria-label="Ordenar por última evidencia"
              >Última evidencia <ArrowDownUp size={12} /></button
            >
          </th>
          <th aria-label="Detalle"></th>
        </tr>
      </thead>
      <tbody>
        {#each sorted as op}
          <tr>
            <td>
              <button
                class="operation-link mono"
                onclick={() => selectedOperation.set(op.operation_id)}
                >{op.operation_id}<ArrowUpRight size={12} /></button
              ><small>Evidencia autorizada</small>
            </td>
            <td>
              <span class="table-kind"><Server size={14} />{op.kind}</span>
              <small
                ><a class="text-link" href={`/crm?instance=${op.instance_id}`}
                  >{op.instance_id}</a
                ></small
              >
            </td>
            <td><Badge value={op.status} /></td>
            <td><Badge value={op.normalized_status} /></td>
            <td
              title="Intervalo entre admisión y última evidencia; no mide tiempo de worker"
              >{evidenceSeconds(op.created_at, op.updated_at) ?? "desconocido"} s</td
            >
            <td>
              <span class="mono">{formatTime(op.updated_at)}</span>
              <small>{utcTime(op.updated_at)} · IACP</small>
            </td>
            <td>
              <button
                class="icon-button"
                aria-label={`Ver detalle ${op.operation_id}`}
                onclick={() => selectedOperation.set(op.operation_id)}
                ><ChevronRight size={17} /></button
              >
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>{:else}<EmptyState />{/if}
