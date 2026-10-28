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
    currentPage = $derived(result?.page ?? (filtered.length ? 1 : 0)),
    attentionCount = $derived(
      filtered.filter((incident) =>
        ["attention", "investigating"].includes(incident.state ?? ""),
      ).length,
    ),
    historicalCount = $derived(
      filtered.filter((incident) =>
        ["closed", "historical"].includes(incident.state ?? ""),
      ).length,
    );
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

<section class="panel incidents-surface">
  <div class="section-heading incident-heading">
    <div>
      <span class="section-kicker">SEÑALES DERIVADAS DE OPERACIONES REALES</span
      >
      <h2>Incidents & Recovery</h2>
      <p class="section-note">
        Sin sistema de tickets persistente. {result?.scope ?? "Sin evidencia"}
      </p>
    </div>
    <button class="button" disabled={loading || revoked} onclick={() => load()}
      >Actualizar</button
    >
  </div>
  <div class="incident-summary" aria-label="Resumen de incidentes">
    <div>
      <span>Visibles</span><strong>{filtered.length}</strong><small
        >de {total} consultados</small
      >
    </div>
    <div>
      <span>Requieren atención</span><strong>{attentionCount}</strong><small
        >en esta página</small
      >
    </div>
    <div>
      <span>Históricos / cerrados</span><strong>{historicalCount}</strong><small
        >no son activos</small
      >
    </div>
    <div>
      <span>Última evidencia</span><strong
        >{formatTime(result?.observedAt)}</strong
      ><small>consulta {formatTime(result?.queriedAt)}</small>
    </div>
  </div>
  <div class="incident-toolbar">
    <label class="search-field universal-search">
      <input
        aria-label="Buscar incidentes"
        placeholder="Buscar por nombre, VMID, UUID, nodo o código…"
        bind:value={query}
        onkeydown={(event) => event.key === "Enter" && submitFilters()}
      />
    </label>
    <select
      class="toolbar-select"
      aria-label="Estado de incidente"
      bind:value={stateFilter}
      onchange={submitFilters}
    >
      <option value="all">Todos los estados</option>
      {#each Object.entries(incidentLabels) as [id, label]}<option value={id}
          >{label}</option
        >{/each}
    </select>
    <div class="view-switch" role="group" aria-label="Vista de incidentes">
      <button
        class:active={groupBy === "none"}
        aria-pressed={groupBy === "none"}
        onclick={() => {
          groupBy = "none";
          syncUrl();
          void load(0);
        }}>Lista</button
      >
      <button
        class:active={groupBy === "instance"}
        aria-pressed={groupBy === "instance"}
        onclick={() => {
          groupBy = "instance";
          syncUrl();
          void load(0);
        }}>Por instancia</button
      >
    </div>
    <button
      class="button primary"
      disabled={loading || revoked}
      onclick={submitFilters}>Buscar historial</button
    >
    {#if activeFilters}<button class="quiet-button" onclick={clearFilters}
        >Limpiar filtros</button
      >{/if}
    <details class="advanced-filter">
      <summary class="button"
        >Más filtros <span aria-hidden="true">⌄</span></summary
      >
      <div class="advanced-filter-content">
        <label
          >Tipo de operación<input
            aria-label="Tipo de operación"
            placeholder="instance.delete"
            bind:value={kind}
          /></label
        >
        <label
          >Código IACP<input
            aria-label="Código de error"
            placeholder="PLAN_INTEGRITY_FAILED"
            bind:value={code}
          /></label
        >
        <label
          >Desde CR<input
            aria-label="Desde CR"
            type="date"
            bind:value={from}
          /></label
        >
        <label
          >Hasta CR<input
            aria-label="Hasta CR"
            type="date"
            bind:value={until}
          /></label
        >
        <label
          >Orden<select
            aria-label="Ordenar incidentes"
            bind:value={sortBy}
            onchange={submitFilters}
            ><option value="updated_at">Última evidencia</option><option
              value="created_at">Creación</option
            ></select
          ></label
        >
      </div>
    </details>
  </div>
  {#if error}<div class="callout warning" role="alert">
      {error}. Sin evidencia actual.
    </div>{/if}
  {#if groupBy === "instance" && result?.grouped}
    <IncidentGroups groups={result.grouped} />
  {:else}<div class="table-wrap incidents-table-wrap">
      <table class="incidents-table">
        <thead
          ><tr
            ><th>Estado / gravedad</th><th>Recurso</th><th
              >Código y diagnóstico</th
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
            ><th><span class="sr-only">Detalle</span></th></tr
          ></thead
        >
        <tbody>
          {#each filtered as i}
            <tr>
              <td
                ><span class="incident-state"
                  >{i.state ? incidentLabels[i.state] : "Histórico"}</span
                ><small>{i.severity}</small></td
              >
              <td
                ><strong>{i.instance?.name ?? i.operation.instance_id}</strong
                ><small
                  >{#if i.instance?.vmid !== null && i.instance?.vmid !== undefined}VM
                    {i.instance.vmid} ·
                  {/if}{i.instance?.node ?? "Nodo no publicado"}</small
                ><button
                  class="operation-link mono"
                  onclick={() => (selected = i.operation.operation_id)}
                  >{i.operation.kind}</button
                ></td
              >
              <td
                ><strong
                  >{i.operation.error_code ?? "Sin código publicado"}</strong
                ><small>{i.diagnosis.category}</small></td
              >
              <td title={utcTime(i.operation.updated_at)}
                ><time>{formatTime(i.operation.updated_at)}</time><small
                  >Creado {formatTime(i.operation.created_at)}</small
                ></td
              >
              <td
                ><button
                  class="icon-button"
                  aria-label={`Abrir diagnóstico de ${i.operation.operation_id}`}
                  onclick={() => (selected = i.operation.operation_id)}
                  >→</button
                ></td
              >
            </tr>
          {:else}<tr
              ><td colspan="5"
                >{loading
                  ? "Consultando IACP…"
                  : "Sin incidentes coincidentes en esta página. No certifica ausencia global."}</td
              ></tr
            >{/each}
        </tbody>
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
