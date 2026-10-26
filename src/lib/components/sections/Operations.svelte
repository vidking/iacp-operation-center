<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { scheduleReads } from "#lib/refresh.ts";
  import { selectedOperation } from "#lib/stores/portal.ts";
  import { page } from "$app/state";
  import { Search, SlidersHorizontal, X, ListFilter } from "@lucide/svelte";
  import { invalidateAll } from "$app/navigation";
  import type { Operation } from "#lib/types/observation.ts";
  import type { PortalData } from "#lib/types/portal.ts";
  import ContractReferences from "./ContractReferences.svelte";
  import OperationsTable from "../OperationsTable.svelte";
  let {
    data,
    autoRefresh = true,
    refreshNonce = 0,
  }: {
    data: PortalData;
    autoRefresh?: boolean;
    refreshNonce?: number;
  } = $props();
  $effect(() => {
    if (refreshNonce)
      untrack(() => {
        void loadPage(offset);
      });
  });
  let offset = $state(0),
    pageOperations = $state<Operation[] | null>(null),
    loading = $state(false),
    pageError = $state("");
  let operations = $derived(pageOperations ?? data.operations);
  $effect(() => {
    if (data.blocked) pageOperations = [];
  });
  let directId = $state(""),
    instanceFilter = $state(""),
    persistedStatus = $state(""),
    observedAt = $state(""),
    queriedAt = $state("");
  onMount(() => {
    void loadPage(0, true);
    const id = page.url.searchParams.get("operation");
    if (id) selectedOperation.set(id);
    return scheduleReads({
      key: "operations-page-loop",
      enabled: () => autoRefresh && !$selectedOperation && !data.blocked,
      interval: () =>
        operations.some((o) =>
          ["queued", "running", "uncertain"].includes(o.normalized_status),
        )
          ? 4000
          : 30000,
      read: async () => {
        await loadPage(offset);
        return !pageError;
      },
    });
  });
  async function loadPage(next: number, recent = false) {
    if (loading) return;
    loading = true;
    pageError = "";
    try {
      const response = await fetch(
        "/api/operation-pages?offset=" +
          next +
          "&recent=" +
          recent +
          (instanceFilter
            ? "&instance=" + encodeURIComponent(instanceFilter)
            : "") +
          (persistedStatus ? "&status=" + persistedStatus : "") +
          (query ? "&q=" + encodeURIComponent(query) : ""),
        { signal: AbortSignal.timeout(20000) },
      );
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "REQUEST_FAILED");
      pageOperations = value.operations;
      offset = value.offset;
      observedAt = value.observedAt;
      queriedAt = value.queriedAt ?? "";
    } catch (e) {
      pageOperations = [];
      pageError = e instanceof Error ? e.message : "REQUEST_FAILED";
      void invalidateAll();
    } finally {
      loading = false;
    }
  }
  let query = $state(page.url.searchParams.get("q") ?? "");
  let status = $state(page.url.searchParams.get("status") ?? "all");
  let kind = $state("all");
  let filtered = $derived(
    operations.filter(
      (o) =>
        (status === "all" ||
          (status === "active" &&
            ["queued", "running", "uncertain"].includes(o.normalized_status)) ||
          o.normalized_status === status) &&
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
    void loadPage(0, true);
  }
  function searchAll() {
    void loadPage(0);
  }
</script>

<div class="filter-tabs">
  {#each [{ id: "all", label: "Todas" }, { id: "running", label: "En ejecución" }, { id: "completed", label: "Completadas" }, { id: "uncertain", label: "Inciertas" }, { id: "failed", label: "Fallidas" }] as tab}<button
      class:chosen={status === tab.id}
      onclick={() => {
        status = tab.id;
        void loadPage(0, true);
      }}
      >{tab.label}<span
        >{operations.filter(
          (o) => tab.id === "all" || o.normalized_status === tab.id,
        ).length}</span
      ></button
    >{/each}
</div>
<section class="panel">
  <div class="toolbar">
    <label
      >Estado persistido en IACP<select
        aria-label="Estado persistido en todo el historial"
        bind:value={persistedStatus}
        onchange={() => loadPage(0, true)}
        ><option value="">Todos</option
        >{#each ["queued", "running", "completed", "failed", "uncertain"] as value}<option
            {value}>{value}</option
          >{/each}</select
      ></label
    >
    <button class="button" disabled={loading} onclick={() => loadPage(0, true)}
      >Más recientes</button
    >
    <label
      >Instancia UUID<input
        aria-label="Buscar historial de instancia"
        bind:value={instanceFilter}
      /></label
    >
    <button class="button" disabled={loading} onclick={() => loadPage(0, true)}
      >Consultar historial completo de instancia</button
    >
    <label
      >Operación UUID<input
        aria-label="Localizar operación por UUID"
        bind:value={directId}
      /></label
    >
    <button
      class="button"
      disabled={!/^[a-f0-9-]{36}$/.test(directId)}
      onclick={() => selectedOperation.set(directId)}>Abrir operación</button
    >
  </div>
  <p class="micro muted">
    El selector de estado persistido e instancia consultan todo el historial en
    IACP. Estado normalizado, texto y tipo filtran la página. Para correlation
    ID, consulta Events. Última consulta: {queriedAt || "Pendiente"} · última evidencia:
    {observedAt || "No publicada"} · offset {offset}.
  </p>
  <div class="toolbar">
    <label class="search-field"
      ><Search size={16} /><input
        aria-label="Buscar operaciones"
        placeholder="Buscar por ID, instancia o tipo…"
        bind:value={query}
        onkeydown={(event) => {
          if (event.key === "Enter") searchAll();
        }}
      />{#if query}<button
          class="icon-button"
          aria-label="Limpiar búsqueda"
          onclick={() => (query = "")}><X size={13} /></button
        >{/if}</label
    ><button class="button" disabled={loading} onclick={searchAll}>
      Buscar en todo IACP
    </button><label class="select-field"
      ><SlidersHorizontal size={14} /><select
        aria-label="Filtrar normalized_status"
        bind:value={status}
        onchange={() => loadPage(0, true)}
        ><option value="all">Todos los estados</option><option value="active"
          >Activas</option
        >{#each ["queued", "running", "completed", "failed", "uncertain"] as s}<option
            value={s}>{s}</option
          >{/each}</select
      ></label
    ><select aria-label="Filtrar tipo" bind:value={kind}
      ><option value="all">Todos los tipos</option
      >{#each [...new Set(operations.map((o) => o.kind))] as type}<option
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
    <button
      class="button"
      disabled={loading || offset === 0}
      onclick={() => loadPage(Math.max(0, offset - 50))}>Anterior</button
    ><button
      class="button"
      disabled={loading || operations.length < 50}
      onclick={() => loadPage(offset + 50)}>Siguiente</button
    ><span>{pageError}</span>

    <span
      >{filtered.length} de {operations.length} operaciones de la página consultada</span
    ><span>Selecciona una operación para consultar la evidencia</span>
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

<ContractReferences />
