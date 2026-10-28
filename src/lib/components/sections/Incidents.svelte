<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { page } from "$app/state";
  import { invalidateAll } from "$app/navigation";
  import { scheduleReads } from "#lib/refresh.ts";
  import { formatTime, utcTime } from "#lib/time.ts";
  import { incidentLabels } from "#lib/types/incidents.ts";
  import type { IncidentPage } from "#lib/server/incidents/service.ts";
  import type { AuditEvent } from "#lib/types/observation.ts";
  import IncidentDetail from "../incidents/IncidentDetail.svelte";
  import IncidentGroups from "../IncidentGroups.svelte";
  let {
    events = [],
    autoRefresh = true,
    refreshNonce = 0,
  }: {
    events?: AuditEvent[];
    autoRefresh?: boolean;
    refreshNonce?: number;
  } = $props();
  $effect(() => {
    if (refreshNonce)
      untrack(() => {
        void load();
      });
  });
  let result = $state<IncidentPage | null>(null),
    loading = $state(false),
    error = $state(""),
    offset = $state(0),
    selected = $state(page.url.searchParams.get("operation") ?? ""),
    revoked = $state(false);
  type IncidentSort = "updated_at" | "created_at";
  type Direction = "asc" | "desc";
  let query = $state(page.url.searchParams.get("q") ?? ""),
    stateFilter = $state(page.url.searchParams.get("state") ?? "all"),
    kind = $state(page.url.searchParams.get("kind") ?? ""),
    code = $state(page.url.searchParams.get("code") ?? ""),
    from = $state(page.url.searchParams.get("from") ?? ""),
    until = $state(page.url.searchParams.get("until") ?? ""),
    pageSize = $state(
      [25, 50, 100].includes(Number(page.url.searchParams.get("pageSize")))
        ? Number(page.url.searchParams.get("pageSize"))
        : 50,
    ),
    sortBy = $state<IncidentSort>(
      page.url.searchParams.get("sortBy") === "created_at"
        ? "created_at"
        : "updated_at",
    ),
    direction = $state<Direction>(
      page.url.searchParams.get("direction") === "asc" ? "asc" : "desc",
    ),
    groupBy = $state<"none" | "instance">(
      page.url.searchParams.get("groupBy") === "instance" ? "instance" : "none",
    );
  let filtered = $derived(result?.incidents ?? []),
    total = $derived(result?.total ?? filtered.length),
    pageCount = $derived(result?.pageCount ?? (total ? 1 : 0)),
    currentPage = $derived(result?.page ?? (filtered.length ? 1 : 0));
  let requestController: AbortController | null = null,
    requestEpoch = 0;
  function pageLinks(totalPages: number, current: number): Array<number | "…"> {
    if (totalPages <= 12)
      return Array.from({ length: totalPages }, (_, index) => index + 1);
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
  let pageNumbers = $derived(pageLinks(pageCount, currentPage));
  let activeFilters = $derived(
    Boolean(query || stateFilter !== "all" || kind || code || from || until),
  );

  function syncUrl() {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const values: Record<string, string | number> = {
      offset,
      pageSize,
      q: query,
      state: stateFilter,
      kind,
      code,
      from,
      until,
      sortBy,
      direction,
      groupBy,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value === "" || value === "all" || (key === "offset" && value === 0))
        url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    }
    window.history.replaceState({}, "", url);
  }
  async function load(next = offset) {
    if (revoked) return false;
    requestController?.abort();
    const controller = new AbortController(),
      epoch = ++requestEpoch;
    requestController = controller;
    loading = true;
    error = "";
    try {
      const params = new URLSearchParams({
        offset: String(next),
        pageSize: String(pageSize),
        sortBy,
        direction,
      });
      if (query) params.set("q", query);
      if (stateFilter !== "all") params.set("state", stateFilter);
      if (kind) params.set("kind", kind);
      if (code) params.set("code", code);
      if (from) params.set("from", from);
      if (until) params.set("until", until);
      if (groupBy === "instance") params.set("groupBy", "instance");
      const r = await fetch("/api/incidents?" + params, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(30000),
          ]),
        }),
        v = await r.json();
      if (!r.ok) throw new Error(v.error ?? "REQUEST_FAILED");
      if (epoch !== requestEpoch) return false;
      result = v;
      offset = v.offset;
      syncUrl();
      return true;
    } catch (e) {
      if (controller.signal.aborted || epoch !== requestEpoch) return false;
      error = e instanceof Error ? e.message : "REQUEST_FAILED";
      if (
        [
          "UPSTREAM_UNAUTHORIZED",
          "UPSTREAM_FORBIDDEN",
          "UPSTREAM_TENANT_MISMATCH",
          "CONNECTION_CHANGED",
          "AUTHENTICATION_REQUIRED",
        ].includes(error)
      ) {
        revoked = true;
        void invalidateAll();
      }
      return false;
    } finally {
      if (epoch === requestEpoch) loading = false;
    }
  }
  function submitFilters() {
    offset = 0;
    syncUrl();
    void load(0);
  }
  function choosePage(value: number) {
    offset = (value - 1) * pageSize;
    syncUrl();
    void load(offset);
  }
  function changePageSize() {
    offset = 0;
    syncUrl();
    void load(0);
  }
  function toggleSort(column: IncidentSort) {
    if (sortBy === column) direction = direction === "asc" ? "desc" : "asc";
    else {
      sortBy = column;
      direction = "desc";
    }
    offset = 0;
    syncUrl();
    void load(0);
  }
  function clearFilters() {
    query = "";
    stateFilter = "all";
    kind = "";
    code = "";
    from = "";
    until = "";
    groupBy = "none";
    offset = 0;
    syncUrl();
    void load(0);
  }
  onMount(() => {
    void load();
    return scheduleReads({
      key: "incidents-list",
      enabled: () => autoRefresh && !revoked,
      interval: () =>
        result?.incidents.some((i) =>
          ["running", "queued", "uncertain"].includes(
            i.operation.normalized_status,
          ),
        )
          ? 4000
          : 30000,
      read: () => load(),
    });
  });
</script>

<section class="panel">
  <div class="panel-heading">
    <h2>Incidentes derivados de operaciones reales</h2>
    <button class="button" disabled={loading || revoked} onclick={() => load()}
      >Actualizar incidentes</button
    >
  </div>
  <p class="panel-note">
    Sin sistema de tickets persistente. {result?.scope ?? "Sin evidencia"}. {result
      ?.incidents.length ?? 0} señales visibles / {result?.total ?? 0} incidentes
    globales. Consulta: {formatTime(result?.queriedAt)} · última evidencia: {formatTime(
      result?.observedAt,
    )}
  </p>
  <div class="toolbar">
    <input
      aria-label="Buscar incidentes"
      placeholder="UUID, VMID, nodo, operación o código…"
      bind:value={query}
      onkeydown={(event) => event.key === "Enter" && submitFilters()}
    /><select aria-label="Estado de incidente" bind:value={stateFilter}
      ><option value="all">Todos los estados</option
      >{#each Object.entries(incidentLabels) as [id, label]}<option value={id}
          >{label}</option
        >{/each}</select
    ><label
      >Vista<select
        aria-label="Agrupar incidentes"
        bind:value={groupBy}
        onchange={syncUrl}
        ><option value="none">Todos los incidentes</option><option
          value="instance">Agrupar por instancia</option
        ></select
      ></label
    ><input
      aria-label="Tipo de incidente"
      placeholder="Tipo de operación"
      bind:value={kind}
    /><input
      aria-label="Código de error"
      placeholder="Código IACP"
      bind:value={code}
    /><label
      >Desde CR<input
        aria-label="Desde CR"
        type="date"
        bind:value={from}
      /></label
    ><label
      >Hasta CR<input
        aria-label="Hasta CR"
        type="date"
        bind:value={until}
      /></label
    >
    <button class="button" disabled={loading || revoked} onclick={submitFilters}
      >Buscar en todo el historial</button
    >
    {#if activeFilters}<button class="button" onclick={clearFilters}
        >Limpiar filtros</button
      >{/if}
  </div>
  {#if error}<div class="callout warning" role="alert">
      {error}. Sin evidencia actual.
    </div>{/if}
  {#if groupBy === "instance" && result?.grouped}
    <IncidentGroups groups={result.grouped} />
  {:else}<div class="table-wrap">
      <table>
        <thead
          ><tr
            ><th>Estado / gravedad</th><th>Operación</th><th
              >Instancia / VMID / nodo</th
            ><th>Código y diagnóstico</th><th
              aria-sort={sortBy === "created_at"
                ? direction === "asc"
                  ? "ascending"
                  : "descending"
                : "none"}
              ><button
                class="sort-button"
                onclick={() => toggleSort("created_at")}
                aria-label="Ordenar por creación">Creación</button
              ></th
            ><th
              aria-sort={sortBy === "updated_at"
                ? direction === "asc"
                  ? "ascending"
                  : "descending"
                : "none"}
              ><button
                class="sort-button"
                onclick={() => toggleSort("updated_at")}
                aria-label="Ordenar por última evidencia"
                >Última evidencia</button
              ></th
            ></tr
          ></thead
        ><tbody
          >{#each filtered as i}<tr
              ><td
                >{i.state ? incidentLabels[i.state] : "Histórico"}<small
                  >{i.severity}</small
                ></td
              ><td
                ><button
                  class="operation-link"
                  onclick={() => (selected = i.operation.operation_id)}
                  >{i.operation.kind}</button
                ><small>{i.operation.operation_id}</small></td
              ><td
                >{i.instance?.name ?? i.operation.instance_id}<small
                  >{i.instance?.vmid ?? "Sin evidencia"} / {i.instance?.node ??
                    "Sin evidencia"} · {i.instance?.status ??
                    "Sin evidencia"}</small
                ></td
              ><td
                >{i.operation.error_code ?? "Sin código"}<small
                  >{i.diagnosis.category}</small
                ></td
              ><td title={utcTime(i.operation.created_at)}
                >{formatTime(i.operation.created_at)}</td
              ><td title={utcTime(i.operation.updated_at)}
                >{formatTime(i.operation.updated_at)}</td
              ></tr
            >{:else}<tr
              ><td colspan="6"
                >{loading
                  ? "Consultando IACP…"
                  : "Sin incidentes coincidentes en esta página. No certifica ausencia global."}</td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>{/if}
  <div class="table-footer pagination-footer">
    <div class="pagination-summary">
      <strong>Página {currentPage || 0} de {pageCount || 0}</strong>
      <span
        >Registros {total ? offset + 1 : 0}–{Math.min(
          offset + filtered.length,
          total,
        )} de {total}</span
      >
    </div>
    <nav class="pagination" aria-label="Paginación de incidentes">
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
    <label
      >Registros por página <select
        aria-label="Registros por página"
        bind:value={pageSize}
        onchange={changePageSize}
        ><option value={25}>25</option><option value={50}>50</option><option
          value={100}>100</option
        ></select
      ></label
    >
  </div>
</section>
{#if selected}{#key selected}<IncidentDetail
      id={selected}
      onclose={() => {
        selected = "";
        void load();
      }}
    />{/key}{/if}
