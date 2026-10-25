<script lang="ts">
  import { page } from "$app/state";
  import { Search, X, Fingerprint, ArrowUpRight } from "@lucide/svelte";
  import type { PortalData } from "#lib/types/portal.ts";
  import Badge from "../ui/Badge.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import { selectedOperation } from "#lib/stores/portal.ts";
  let { data }: { data: PortalData } = $props();
  let query = $state("");
  let status = $state("all");
  let correlation = $derived(page.url.searchParams.get("operation") ?? "");
  let filtered = $derived(
    data.events.filter(
      (e) =>
        (!correlation ||
          e.operation_id === correlation ||
          e.correlation_id === correlation) &&
        (status === "all" || e.status === status) &&
        `${e.code} ${e.kind} ${e.operation_id} ${e.correlation_id}`
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
        placeholder="Código, operación o correlation ID…"
        bind:value={query}
      /></label
    ><select aria-label="Filtrar eventos por estado" bind:value={status}
      ><option value="all">Todos los estados</option
      >{#each ["queued", "running", "completed", "failed", "uncertain"] as state}<option
          value={state}>{state}</option
        >{/each}</select
    ><span class="micro muted">{filtered.length} eventos {data.mode}</span>
  </div>
  {#if correlation}<div class="active-filters">
      <Fingerprint size={14} /><span class="mono">{correlation}</span><a
        href="/events"
        aria-label="Quitar correlación"><X size={14} /></a
      >
    </div>{/if}
  <div class="timeline-day">
    EVIDENCIA CONSULTADA <span>{data.mode} · UTC</span>
  </div>
  <div class="event-list">
    {#each filtered as event}<details class="event">
        <summary
          ><span class="timeline-point {event.status}"></span><time
            >{event.occurred_at.slice(11, 19)}</time
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
              <dt>Actor</dt>
              <dd>{event.actor}</dd>
            </div>
            <div>
              <dt>Timestamp</dt>
              <dd class="mono">{event.occurred_at}</dd>
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
  <div class="panel-note">
    Feed {data.mode} · deduplicación por event_id · la correlación no garantiza entrega
    sin pérdida.
  </div>
</section>
