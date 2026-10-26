<script lang="ts">
  import { page } from "$app/state";
  import { Search, SlidersHorizontal, X, ListFilter } from "@lucide/svelte";
  import type { PortalData } from "#lib/types/portal.ts";
  import OperationsTable from "../OperationsTable.svelte";
  let { data }: { data: PortalData } = $props();
  let query = $state(page.url.searchParams.get("q") ?? "");
  let status = $state(page.url.searchParams.get("status") ?? "all");
  let kind = $state("all");
  let filtered = $derived(
    data.operations.filter(
      (o) =>
        (status === "all" || o.normalized_status === status) &&
        (kind === "all" || o.kind === kind) &&
        `${o.operation_id} ${o.instance_id} ${o.kind}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ),
  );
  function clear() {
    query = "";
    status = "all";
    kind = "all";
  }
</script>

<div class="filter-tabs">
  {#each [{ id: "all", label: "Todas" }, { id: "running", label: "En ejecución" }, { id: "completed", label: "Completadas" }, { id: "uncertain", label: "Inciertas" }, { id: "failed", label: "Fallidas" }] as tab}<button
      class:chosen={status === tab.id}
      onclick={() => (status = tab.id)}
      >{tab.label}<span
        >{data.operations.filter(
          (o) => tab.id === "all" || o.normalized_status === tab.id,
        ).length}</span
      ></button
    >{/each}
</div>
<section class="panel">
  <div class="toolbar">
    <label class="search-field"
      ><Search size={16} /><input
        aria-label="Buscar operaciones"
        placeholder="Buscar por ID, instancia o tipo…"
        bind:value={query}
      />{#if query}<button
          class="icon-button"
          aria-label="Limpiar búsqueda"
          onclick={() => (query = "")}><X size={13} /></button
        >{/if}</label
    ><label class="select-field"
      ><SlidersHorizontal size={14} /><select
        aria-label="Filtrar normalized_status"
        bind:value={status}
        ><option value="all">Todos los estados</option
        >{#each ["queued", "running", "completed", "failed", "uncertain"] as s}<option
            value={s}>{s}</option
          >{/each}</select
      ></label
    ><select aria-label="Filtrar tipo" bind:value={kind}
      ><option value="all">Todos los tipos</option
      >{#each [...new Set(data.operations.map((o) => o.kind))] as type}<option
          value={type}>{type}</option
        >{/each}</select
    >
  </div>
  {#if query || status !== "all" || kind !== "all"}<div class="active-filters">
      <ListFilter size={13} /><span>{filtered.length} resultados</span><button
        onclick={clear}>Limpiar filtros <X size={12} /></button
      >
    </div>{/if}<OperationsTable operations={filtered} />
  <div class="table-footer">
    <span>{filtered.length} de {data.operations.length} operaciones</span><span
      >Selecciona una operación para consultar la evidencia</span
    >
  </div>
</section>
<div class="callout">
  <SlidersHorizontal size={17} />
  <p>
    <strong>Dos estados, una lectura completa.</strong> El estado persistido
    conserva la historia. <code>normalized_status</code> refleja la interpretación
    operativa del contrato.
  </p>
</div>
