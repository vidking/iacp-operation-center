<script lang="ts">
  import { onMount } from "svelte";
  import { scheduleReads } from "#lib/refresh.ts";
  import { selectedOperation } from "#lib/stores/portal.ts";
  import { page } from "$app/state";
  import { Search, SlidersHorizontal, X, ListFilter } from "@lucide/svelte";
  import type { Operation } from "#lib/types/observation.ts";
  import type { PortalData } from "#lib/types/portal.ts";
  import ContractReferences from "./ContractReferences.svelte";
  import OperationsTable from "../OperationsTable.svelte";

  type SortColumn =
    "updated_at" | "created_at" | "operation_id" | "kind" | "status";
  type Direction = "asc" | "desc";
  type PageResult = {
    operations: Operation[];
    offset: number;
    pageSize: number;
    page: number;
    pageCount: number;
    total: number;
    hasMore: boolean;
    sortBy: SortColumn;
    direction: Direction;
    counts: Record<string, number>;
    queriedAt: string;
    observedAt: string | null;
    scope: string;
  };
  let {
    data,
    autoRefresh = true,
    refreshNonce = 0,
  }: {
    data: PortalData;
    autoRefresh?: boolean;
    refreshNonce?: number;
  } = $props();

  const initial = page.url.searchParams;
  let offset = $state(Math.max(0, Number(initial.get("offset") ?? 0) || 0));
  let pageSize = $state(
    [25, 50, 100].includes(Number(initial.get("pageSize")))
      ? Number(initial.get("pageSize"))
      : 50,
  );
  let pageOperations = $state<Operation[] | null>(null),
    pageResult = $state<PageResult | null>(null),
    loading = $state(false),
    pageError = $state(""),
    queriedAt = $state(""),
    observedAt = $state<string | null>(null);
  let query = $state(initial.get("q") ?? ""),
    status = $state(initial.get("status") ?? "all"),
    kind = $state(initial.get("kind") ?? "all"),
    instanceFilter = $state(initial.get("instance") ?? ""),
    directId = $state(""),
    sortBy = $state<SortColumn>(
      (initial.get("sortBy") as SortColumn) || "updated_at",
    ),
    direction = $state<Direction>(
      initial.get("direction") === "asc" ? "asc" : "desc",
    );
  let requestController: AbortController | null = null,
    requestEpoch = 0;
  let operations = $derived(pageOperations ?? data.operations);
  let total = $derived(pageResult?.total ?? operations.length),
    pageCount = $derived(pageResult?.pageCount ?? (total ? 1 : 0)),
    currentPage = $derived(
      pageResult?.page ??
        (operations.length ? Math.floor(offset / pageSize) + 1 : 0),
    ),
    counts = $derived(
      pageResult?.counts ?? {
        all: operations.length,
        active: operations.filter((o) =>
          ["queued", "running", "uncertain"].includes(o.normalized_status),
        ).length,
        queued: operations.filter((o) => o.normalized_status === "queued")
          .length,
        running: operations.filter((o) => o.normalized_status === "running")
          .length,
        completed: operations.filter((o) => o.normalized_status === "completed")
          .length,
        failed: operations.filter((o) => o.normalized_status === "failed")
          .length,
        uncertain: operations.filter((o) => o.normalized_status === "uncertain")
          .length,
      },
    ),
    firstRecord = $derived(total ? offset + 1 : 0),
    lastRecord = $derived(
      total ? Math.min(offset + operations.length, total) : 0,
    ),
    activeFilters = $derived(
      Boolean(query || status !== "all" || kind !== "all" || instanceFilter),
    ),
    pageNumbers = $derived(pageLinks(pageCount, currentPage));

  function pageLinks(totalPages: number, current: number): Array<number | "…"> {
    if (totalPages <= 12)
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    const values = new Set<number>([1, totalPages]);
    for (
      let value = Math.max(1, current - 2);
      value <= Math.min(totalPages, current + 2);
      value++
    )
      values.add(value);
    const sorted = [...values].sort((a, b) => a - b);
    const links: Array<number | "…"> = [];
    sorted.forEach((value, index) => {
      if (index && value - sorted[index - 1] > 1) links.push("…");
      links.push(value);
    });
    return links;
  }

  function syncUrl() {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const values: Record<string, string | number> = {
      offset,
      pageSize,
      q: query,
      status,
      kind,
      instance: instanceFilter,
      sortBy,
      direction,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value === "" || value === "all" || (key === "offset" && value === 0))
        url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    }
    window.history.replaceState({}, "", url);
  }

  function requestParams(nextOffset: number, recent: boolean) {
    const params = new URLSearchParams({
      offset: String(nextOffset),
      pageSize: String(pageSize),
      recent: String(recent),
      sortBy,
      direction,
    });
    if (query) params.set("q", query);
    if (status !== "all") params.set("status", status);
    if (kind !== "all") params.set("kind", kind);
    if (instanceFilter) params.set("instance", instanceFilter);
    return params;
  }

  async function loadPage(next = offset, recent = false) {
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    const epoch = ++requestEpoch;
    loading = true;
    pageError = "";
    try {
      const response = await fetch(
        "/api/operation-pages?" + requestParams(next, recent),
        {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(30000),
          ]),
        },
      );
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "REQUEST_FAILED");
      if (epoch !== requestEpoch) return;
      pageResult = value;
      pageOperations = value.operations;
      offset = value.offset;
      queriedAt = value.queriedAt ?? "";
      observedAt = value.observedAt ?? null;
      syncUrl();
    } catch (error) {
      if (controller.signal.aborted || epoch !== requestEpoch) return;
      pageError = error instanceof Error ? error.message : "REQUEST_FAILED";
      // Preserve the last table and its evidence on transient read failures.
    } finally {
      if (epoch === requestEpoch) loading = false;
    }
  }

  function setFilter(value: string) {
    status = value;
    offset = 0;
    syncUrl();
    void loadPage(0, true);
  }
  function searchAll() {
    offset = 0;
    syncUrl();
    void loadPage(0, true);
  }
  function choosePage(value: number) {
    offset = (value - 1) * pageSize;
    syncUrl();
    void loadPage(offset);
  }
  function changePageSize() {
    offset = 0;
    syncUrl();
    void loadPage(0, true);
  }
  function sort(column: SortColumn) {
    if (sortBy === column) direction = direction === "asc" ? "desc" : "asc";
    else {
      sortBy = column;
      direction =
        column === "updated_at" || column === "created_at" ? "desc" : "asc";
    }
    offset = 0;
    syncUrl();
    void loadPage(0, true);
  }
  function clear() {
    query = "";
    status = "all";
    kind = "all";
    instanceFilter = "";
    offset = 0;
    syncUrl();
    void loadPage(0, true);
  }

  $effect(() => {
    if (data.blocked) pageOperations = [];
    if (refreshNonce) void loadPage(offset);
  });

  onMount(() => {
    void loadPage(offset);
    return scheduleReads({
      key: "operations-page-loop",
      enabled: () => autoRefresh && !data.blocked,
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
</script>

<div class="filter-tabs" aria-label="Filtrar operaciones">
  {#each [["all", "Todas"], ["active", "En ejecución"], ["completed", "Completadas"], ["uncertain", "Inciertas"], ["failed", "Fallidas"]] as tab}
    <button class:chosen={status === tab[0]} onclick={() => setFilter(tab[0])}>
      {tab[1]}<span>{counts[tab[0]] ?? 0}</span>
    </button>
  {/each}
</div>

<section class="panel">
  <div class="toolbar">
    <label class="search-field">
      <Search size={16} />
      <input
        aria-label="Buscar operaciones"
        placeholder="UUID, instancia, tipo, estado o código…"
        bind:value={query}
        onkeydown={(event) => event.key === "Enter" && searchAll()}
      />
      {#if query}<button
          class="icon-button"
          aria-label="Limpiar búsqueda"
          onclick={() => (query = "")}><X size={13} /></button
        >{/if}
    </label>
    <button class="button" disabled={loading} onclick={searchAll}
      >Buscar en todo IACP</button
    >
    <label>
      Página
      <select
        aria-label="Registros por página"
        bind:value={pageSize}
        onchange={changePageSize}
      >
        <option value={25}>25</option><option value={50}>50</option><option
          value={100}>100</option
        >
      </select>
    </label>
    <label>
      Instancia UUID
      <input
        aria-label="Buscar historial de instancia"
        bind:value={instanceFilter}
      />
    </label>
    <button
      class="button"
      disabled={loading || !instanceFilter}
      onclick={searchAll}>Filtrar instancia</button
    >
    <label>
      Tipo
      <select aria-label="Filtrar tipo" bind:value={kind} onchange={searchAll}>
        <option value="all">Todos los tipos</option>
        {#each [...new Set(operations.map((o) => o.kind))] as type}<option
            value={type}>{type}</option
          >{/each}
      </select>
    </label>
    <label>
      Operación UUID
      <input aria-label="Localizar operación por UUID" bind:value={directId} />
    </label>
    <button
      class="button"
      disabled={!/^[a-f0-9-]{36}$/.test(directId)}
      onclick={() => selectedOperation.set(directId)}>Abrir operación</button
    >
  </div>
  <p class="micro muted">
    {pageResult?.scope ??
      "Índice de lectura global del historial IACP; no se limita a la página visible."}
    Última consulta: {queriedAt || "Pendiente"} · última evidencia: {observedAt ||
      "No publicada"}.
  </p>
  {#if pageError}<div class="callout warning" role="alert">
      {pageError}. Se conserva la última tabla y no se habilitan acciones por
      esta lectura.
    </div>{/if}
  {#if activeFilters}<div class="active-filters">
      <ListFilter size={13} /><span>{total} resultados globales</span><button
        onclick={clear}>Limpiar filtros <X size={12} /></button
      >
    </div>{/if}
  <OperationsTable {operations} {sortBy} {direction} onSort={sort} />
  <div class="table-footer pagination-footer">
    <div class="pagination-summary">
      <strong>Página {currentPage || 0} de {pageCount || 0}</strong>
      <span>Registros {firstRecord}–{lastRecord} de {total}</span>
    </div>
    <nav class="pagination" aria-label="Paginación de operaciones">
      <button
        class="button"
        aria-label="Primera página"
        disabled={loading || currentPage <= 1}
        onclick={() => choosePage(1)}>«</button
      >
      <button
        class="button"
        aria-label="Página anterior"
        disabled={loading || currentPage <= 1}
        onclick={() => choosePage(currentPage - 1)}>‹</button
      >
      {#each pageNumbers as item}
        {#if item === "…"}<span class="pagination-ellipsis">…</span
          >{:else}<button
            class:current={item === currentPage}
            class="button"
            aria-label={`Página ${item}`}
            aria-current={item === currentPage ? "page" : undefined}
            onclick={() => choosePage(item)}>{item}</button
          >{/if}
      {/each}
      <button
        class="button"
        aria-label="Página siguiente"
        disabled={loading || currentPage >= pageCount}
        onclick={() => choosePage(currentPage + 1)}>›</button
      >
      <button
        class="button"
        aria-label="Última página"
        disabled={loading || currentPage >= pageCount}
        onclick={() => choosePage(pageCount)}>»</button
      >
    </nav>
    <button class="button" disabled={loading} onclick={() => loadPage(0, true)}
      >Más recientes</button
    >
  </div>
</section>

<div class="callout">
  <SlidersHorizontal size={17} />
  <p>
    <strong>Historial global, ventana visible.</strong>
    Los filtros, el orden y el total se calculan sobre el índice tenant-scoped del
    historial consultado, no solo sobre la página renderizada.
  </p>
</div>

<ContractReferences />
