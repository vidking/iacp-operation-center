<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { uniqueEvents } from "#lib/types/observation.ts";
  import type { AuditEvent } from "#lib/types/observation.ts";
  import { formatTime, utcTime } from "#lib/time.ts";
  import { page } from "$app/state";
  import { Search, X, Fingerprint, ArrowUpRight } from "@lucide/svelte";
  import type { PortalData } from "#lib/types/portal.ts";
  import Badge from "../ui/Badge.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import { selectedOperation } from "#lib/stores/portal.ts";
  let { data }: { data: PortalData } = $props();
  let browsing = $state(false),
    cursor = $state(0);
  let extra = $state<AuditEvent[]>([]),
    loading = $state(false),
    loadError = $state("");
  let merged = $derived(uniqueEvents(browsing ? extra : data.events));
  $effect(() => {
    if (data.blocked) {
      extra = [];
      browsing = false;
      cursor = 0;
    }
  });
  async function nextPage(reset = false) {
    if (loading) return;
    loading = true;
    loadError = "";
    try {
      const maximum = Math.max(0, ...merged.map((e) => e.event_id));
      const after = reset ? 0 : Math.max(0, (browsing ? cursor : maximum) - 20);
      const response = await fetch("/api/observations/events?after=" + after);
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "REQUEST_FAILED");
      extra = uniqueEvents([...(reset ? [] : extra), ...value.events]);
      browsing = true;
      cursor = value.next_after;
    } catch (e) {
      loadError = e instanceof Error ? e.message : "REQUEST_FAILED";
      extra = [];
      if (
        [
          "UPSTREAM_UNAUTHORIZED",
          "UPSTREAM_FORBIDDEN",
          "UPSTREAM_TENANT_MISMATCH",
        ].includes(loadError)
      )
        void invalidateAll();
    } finally {
      loading = false;
    }
  }
  let query = $state("");
  let status = $state("all");
  let correlation = $derived(page.url.searchParams.get("operation") ?? "");
  let filtered = $derived(
    merged.filter(
      (e) =>
        (!page.url.searchParams.get("instance") ||
          e.instance_id === page.url.searchParams.get("instance")) &&
        (!correlation ||
          e.operation_id === correlation ||
          e.correlation_id === correlation) &&
        (status === "all" || e.status === status) &&
        `${e.code} ${e.kind} ${e.instance_id} ${e.operation_id} ${e.correlation_id} ${e.actor} ${e.service}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ),
  );
</script>

<section class="panel">
  <div class="toolbar">
    <label class="search-field"
      ><Search size={16} /><input
        aria-label="Buscar eventos"
        placeholder="Instancia, operación o correlación…"
        bind:value={query}
      /></label
    ><select aria-label="Filtrar eventos por estado" bind:value={status}
      ><option value="all">Todos los estados</option
      >{#each ["queued", "running", "completed", "failed", "uncertain"] as state}<option
          value={state}>{state}</option
        >{/each}</select
    ><span class="micro muted">{filtered.length} eventos</span>
  </div>
  {#if correlation}<div class="active-filters">
      <Fingerprint size={14} /><span class="mono">{correlation}</span><a
        href="/events"
        aria-label="Quitar correlación"><X size={14} /></a
      >
    </div>{/if}
  <div class="timeline-day">
    EVIDENCIA CONSULTADA <span>CST (UTC−06:00)</span>
  </div>
  <div class="event-list">
    {#each filtered as event}<details class="event">
        <summary
          ><span class="timeline-point {event.status}"></span><time
            title={utcTime(event.occurred_at)}
            >{formatTime(event.occurred_at)}</time
          >
          <div class="event-info">
            <strong>{event.kind}</strong><span
              >{event.code}
              <span class="event-service">· {event.service}</span></span
            ><small class="mono">{event.operation_id}</small>
          </div>
          <Badge value={event.status} /><span class="expand-label"
            >Ver detalle +</span
          ></summary
        >
        <div class="event-expanded">
          <dl class="detail-grid">
            <div>
              <dt>Correlation ID</dt>
              <dd class="mono">{event.correlation_id || event.operation_id}</dd>
            </div>
            <div>
              <dt>Operation ID</dt>
              <dd>
                <button
                  class="operation-link mono"
                  onclick={() => selectedOperation.set(event.operation_id)}
                  >{event.operation_id}<ArrowUpRight size={12} /></button
                >
              </dd>
            </div>
            <div>
              <dt>Instancia</dt>
              <dd>
                <a class="text-link" href={`/crm?instance=${event.instance_id}`}
                  >{event.instance_id}</a
                >
              </dd>
            </div>
            <div>
              <dt>Actor</dt>
              <dd>{event.actor}</dd>
            </div>
            <div>
              <dt>Timestamp</dt>
              <dd class="mono" title={utcTime(event.occurred_at)}>
                {formatTime(event.occurred_at)}<small
                  >{utcTime(event.occurred_at)}</small
                >
              </dd>
            </div>
            <div>
              <dt>Event ID</dt>
              <dd>#{event.event_id}</dd>
            </div>
            <div>
              <dt>Tenant</dt>
              <dd>{event.tenant_id}</dd>
            </div>
          </dl>
        </div>
      </details>{:else}<EmptyState
        onreset={() => {
          query = "";
          status = "all";
        }}
      />{/each}
  </div>
  <div class="table-footer">
    <button
      class="button"
      disabled={loading || data.blocked}
      onclick={() => nextPage(true)}>Explorar desde el inicio</button
    >
    <button
      class="button"
      disabled={loading || data.blocked}
      onclick={() => nextPage()}
      >{loading
        ? "Consultando…"
        : "Consultar siguiente ventana (solapada)"}</button
    ><span>{loadError}</span>
  </div>
  <div class="panel-note">
    Feed · deduplicación por event_id · la correlación no garantiza entrega sin
    pérdida.
  </div>
</section>
