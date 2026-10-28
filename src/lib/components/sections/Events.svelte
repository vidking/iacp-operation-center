<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { onMount } from "svelte";
  import { scheduleReads } from "#lib/refresh.ts";
  import { uniqueEvents } from "#lib/types/observation.ts";
  import type { AuditEvent } from "#lib/types/observation.ts";
  import { humanizeKind } from "#lib/operation-display.ts";
  import { formatTime, utcTime } from "#lib/time.ts";
  import { page } from "$app/state";
  import {
    Search,
    X,
    Fingerprint,
    ArrowUpRight,
    ArrowDownUp,
  } from "@lucide/svelte";
  import type { PortalData } from "#lib/types/portal.ts";
  import Badge from "../ui/Badge.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import { selectedOperation } from "#lib/stores/portal.ts";
  import EventGroups from "../EventGroups.svelte";

  type EventPageResponse = {
    events: AuditEvent[];
    next_after: number;
    queriedAt?: string;
    observedAt?: string | null;
    freshness?: string;
  };
  let { data }: { data: PortalData } = $props();
  let recentEvents = $state<AuditEvent[]>([]),
    historyEvents = $state<AuditEvent[]>([]),
    browsing = $state(false),
    historyCursor = $state(0),
    historyWindow = $state(0),
    historyHasMore = $state(true),
    loading = $state(false),
    loadError = $state(""),
    polling = $state(false),
    feedCursor = $state(0),
    lastPollAt = $state(""),
    lastEventAt = $state(""),
    lastEvidenceAt = $state<string | null>(null),
    cursorStalled = $state(false),
    noNewEvents = $state(false),
    direction = $state<"asc" | "desc">("desc"),
    initialized = $state(false);
  let pollController: AbortController | null = null;
  type InstanceReference = {
    instance_id: string;
    name: string;
    vmid: number | null;
    node: string | null;
  };
  let instanceRefs = $state<Record<string, InstanceReference>>({}),
    instanceIndexError = $state("");

  function eventTime(event: AuditEvent) {
    return Date.parse(event.occurred_at);
  }
  function sortEvents(values: AuditEvent[]) {
    return uniqueEvents(values).sort((a, b) => {
      const result = eventTime(a) - eventTime(b) || a.event_id - b.event_id;
      return direction === "asc" ? result : -result;
    });
  }
  let visibleEvents = $derived(browsing ? historyEvents : recentEvents),
    merged = $derived(sortEvents([...visibleEvents]));

  $effect(() => {
    if (data.blocked) {
      if (
        !initialized ||
        recentEvents.length ||
        historyEvents.length ||
        browsing ||
        historyCursor ||
        historyWindow
      ) {
        recentEvents = [];
        historyEvents = [];
        browsing = false;
        historyCursor = 0;
        historyWindow = 0;
        initialized = true;
      }
      return;
    }
    const incoming = data.events ?? [],
      incomingCursor = data.eventCursor ?? 0,
      incomingMax = Math.max(0, ...incoming.map((event) => event.event_id)),
      currentMax = Math.max(0, ...recentEvents.map((event) => event.event_id));
    if (!initialized) {
      recentEvents = sortEvents(incoming);
      feedCursor = Math.max(incomingCursor, incomingMax);
      lastEvidenceAt = data.evidence?.observedAt ?? null;
      lastEventAt = recentEvents[0]?.occurred_at ?? "";
      initialized = true;
    } else if (incomingCursor > feedCursor || incomingMax > currentMax) {
      recentEvents = sortEvents([...recentEvents, ...incoming]).slice(0, 100);
      feedCursor = Math.max(feedCursor, incomingCursor, incomingMax);
      lastEvidenceAt = data.evidence?.observedAt ?? lastEvidenceAt;
    }
  });

  async function historyPage(reset = false) {
    if (loading || data.blocked) return;
    loading = true;
    loadError = "";
    const after = reset ? 0 : historyCursor;
    try {
      const response = await fetch("/api/observations/events?after=" + after, {
        signal: AbortSignal.timeout(15000),
      });
      const value = (await response.json()) as EventPageResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(value.error ?? "REQUEST_FAILED");
      if (
        !Number.isSafeInteger(value.next_after) ||
        value.next_after < after ||
        (value.events.length && value.next_after <= after)
      )
        throw new Error("UPSTREAM_CURSOR_STALLED");
      historyEvents = uniqueEvents([
        ...(reset ? [] : historyEvents),
        ...value.events,
      ]);
      historyCursor = value.next_after;
      historyHasMore = value.events.length >= 100;
      historyWindow = reset ? 1 : historyWindow + 1;
      browsing = true;
      lastPollAt = value.queriedAt ?? new Date().toISOString();
      lastEvidenceAt = value.observedAt ?? lastEvidenceAt;
      cursorStalled = false;
      noNewEvents = value.events.length === 0;
    } catch (error) {
      loadError = error instanceof Error ? error.message : "REQUEST_FAILED";
      cursorStalled = loadError === "UPSTREAM_CURSOR_STALLED";
      noNewEvents = false;
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

  async function pollNewEvents() {
    if (loading || polling || data.blocked) return true;
    polling = true;
    pollController?.abort();
    const controller = new AbortController();
    pollController = controller;
    const after =
      feedCursor || Math.max(0, ...recentEvents.map((event) => event.event_id));
    try {
      const response = await fetch("/api/observations/events?after=" + after, {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10000),
        ]),
      });
      const value = (await response.json()) as EventPageResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(value.error ?? "REQUEST_FAILED");
      if (
        !Number.isSafeInteger(value.next_after) ||
        value.next_after < after ||
        (value.events.length && value.next_after <= after)
      )
        throw new Error("UPSTREAM_CURSOR_STALLED");
      recentEvents = sortEvents([...recentEvents, ...value.events]).slice(
        0,
        100,
      );
      feedCursor = Math.max(feedCursor, value.next_after);
      lastPollAt = value.queriedAt ?? new Date().toISOString();
      lastEvidenceAt = value.observedAt ?? lastEvidenceAt;
      lastEventAt = value.events.reduce(
        (latest, event) =>
          !latest || eventTime(event) > Date.parse(latest)
            ? event.occurred_at
            : latest,
        lastEventAt,
      );
      cursorStalled = false;
      noNewEvents = value.events.length === 0;
      return true;
    } finally {
      if (pollController === controller) pollController = null;
      polling = false;
    }
  }

  onMount(() => {
    void loadInstanceRefs();
    const stop = scheduleReads({
      key: "events-incremental-feed",
      enabled: () => !data.blocked,
      interval: () => 4000,
      read: async () => {
        try {
          loadError = "";
          return await pollNewEvents();
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError")
            return true;
          loadError = error instanceof Error ? error.message : "REQUEST_FAILED";
          cursorStalled = loadError === "UPSTREAM_CURSOR_STALLED";
          noNewEvents = false;
          if (
            [
              "UPSTREAM_UNAUTHORIZED",
              "UPSTREAM_FORBIDDEN",
              "UPSTREAM_TENANT_MISMATCH",
            ].includes(loadError)
          )
            void invalidateAll();
          return false;
        }
      },
    });
    return () => {
      stop();
      pollController?.abort();
    };
  });

  let query = $state(""),
    status = $state("all"),
    correlation = $derived(page.url.searchParams.get("operation") ?? ""),
    groupBy = $state<"none" | "instance">(
      page.url.searchParams.get("groupBy") === "instance" ? "instance" : "none",
    );
  async function loadInstanceRefs() {
    try {
      const response = await fetch("/api/instance-index", {
        signal: AbortSignal.timeout(15000),
      });
      const value = (await response.json()) as {
        instances?: InstanceReference[];
        error?: string;
      };
      if (!response.ok) throw new Error(value.error ?? "REQUEST_FAILED");
      instanceRefs = Object.fromEntries(
        (value.instances ?? []).map((instance) => [
          instance.instance_id,
          instance,
        ]),
      );
      instanceIndexError = "";
    } catch (error) {
      instanceIndexError =
        error instanceof Error ? error.message : "REQUEST_FAILED";
    }
  }
  function syncEventUrl() {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (groupBy === "instance") url.searchParams.set("groupBy", "instance");
    else url.searchParams.delete("groupBy");
    window.history.replaceState({}, "", url);
  }
  let filtered = $derived(
    merged.filter(
      (event) =>
        (!page.url.searchParams.get("instance") ||
          event.instance_id === page.url.searchParams.get("instance")) &&
        (!correlation ||
          event.operation_id === correlation ||
          event.correlation_id === correlation) &&
        (status === "all" || event.status === status) &&
        `${event.code} ${event.kind} ${event.instance_id} ${event.operation_id} ${event.correlation_id} ${event.actor} ${event.service} ${instanceRefs[event.instance_id]?.name ?? ""} ${instanceRefs[event.instance_id]?.vmid ?? ""} ${instanceRefs[event.instance_id]?.node ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ),
  );
  let groupedEvents = $derived(
    [
      ...filtered.reduce((groups, event) => {
        const current = groups.get(event.instance_id) ?? [];
        current.push(event);
        groups.set(event.instance_id, current);
        return groups;
      }, new Map<string, AuditEvent[]>()),
    ]
      .map(([instance_id, events]) => ({
        instance_id,
        instance: instanceRefs[instance_id] ?? null,
        events,
      }))
      .sort(
        (a, b) =>
          Date.parse(b.events[0]?.occurred_at ?? "") -
            Date.parse(a.events[0]?.occurred_at ?? "") ||
          a.instance_id.localeCompare(b.instance_id),
      ),
  );
  function toggleDirection() {
    direction = direction === "desc" ? "asc" : "desc";
  }
</script>

<section class="panel events-surface">
  <div class="events-toolbar">
    <label class="search-field"
      ><Search size={16} /><input
        aria-label="Buscar eventos"
        placeholder="Instancia, operación o correlación…"
        bind:value={query}
      />{#if query}<button
          class="icon-button"
          aria-label="Limpiar búsqueda"
          onclick={() => (query = "")}><X size={13} /></button
        >{/if}</label
    >
    <select
      class="toolbar-select"
      aria-label="Filtrar eventos por estado"
      bind:value={status}
    >
      <option value="all">Todos los estados</option>
      {#each ["queued", "running", "completed", "failed", "uncertain"] as state}<option
          value={state}>{state}</option
        >{/each}
    </select>
    <div class="view-switch" role="group" aria-label="Vista de eventos">
      <button
        class:active={groupBy === "none"}
        aria-pressed={groupBy === "none"}
        onclick={() => {
          groupBy = "none";
          syncEventUrl();
        }}>Actividad</button
      >
      <button
        class:active={groupBy === "instance"}
        aria-pressed={groupBy === "instance"}
        onclick={() => {
          groupBy = "instance";
          syncEventUrl();
        }}>Por instancia</button
      >
    </div>
    <button
      class="button"
      onclick={toggleDirection}
      aria-label="Cambiar orden de eventos"
    >
      <ArrowDownUp size={14} />
      {direction === "desc" ? "Más recientes primero" : "Más antiguos primero"}
    </button>
    <span class="toolbar-count">{filtered.length} eventos en esta ventana</span>
  </div>
  {#if correlation}<div class="active-filters">
      <Fingerprint size={14} /><span class="mono">{correlation}</span><a
        href="/events"
        aria-label="Quitar correlación"><X size={14} /></a
      >
    </div>{/if}
  <div class="timeline-day">
    {browsing
      ? `HISTORIAL · VENTANA ${historyWindow}`
      : "EVIDENCIA MÁS RECIENTE"}
    <span>CST (UTC−06:00)</span>
    <span aria-label="Orden de eventos"
      >· {direction === "desc" ? "descendente" : "ascendente"}</span
    >
  </div>
  {#if noNewEvents && !loadError && !cursorStalled}<p
      class="sync-note"
      role="status"
    >
      Sin eventos nuevos; cursor válido. La sincronización sigue activa.
    </p>{/if}
  {#if loadError}<div class="callout warning" role="alert">
      {loadError}. La ventana anterior se conserva.
    </div>{/if}
  {#if cursorStalled}<div class="callout warning" role="status">
      El cursor remoto no avanzó; no se asumió entrega de eventos nuevos.
    </div>{/if}
  {#if instanceIndexError}<div class="callout warning" role="status">
      No se pudo actualizar el índice de nombres y VMID; la búsqueda por UUID
      continúa disponible.
    </div>{/if}
  {#if groupBy === "instance"}
    <EventGroups groups={groupedEvents} />
  {:else}<div class="event-list">
      {#each filtered as event}
        <details class="event">
          <summary>
            <span class="timeline-point {event.status}"></span>
            <time title={utcTime(event.occurred_at)}
              >{formatTime(event.occurred_at)}</time
            >
            <div class="event-info">
              <strong
                >{event.status === "failed"
                  ? `${humanizeKind(event.kind)} fallida`
                  : humanizeKind(event.kind)}</strong
              >
              <span class="event-resource">
                {instanceRefs[event.instance_id]?.name ?? event.instance_id}
                {#if instanceRefs[event.instance_id]?.vmid !== null && instanceRefs[event.instance_id]?.vmid !== undefined}
                  · VM {instanceRefs[event.instance_id]?.vmid}{/if}
              </span>
              <span class="event-code"
                >{event.code}<span class="event-service">
                  · {event.service}</span
                ></span
              >
              <small class="mono">Operación {event.operation_id}</small>
            </div>
            <Badge value={event.status} /><span class="expand-label"
              >Ver detalle +</span
            >
          </summary>
          <div class="event-expanded">
            <dl class="detail-grid">
              <div>
                <dt>Correlation ID</dt>
                <dd class="mono">
                  {event.correlation_id || event.operation_id}
                </dd>
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
                  <a
                    class="text-link"
                    href={`/crm?instance=${event.instance_id}`}
                  >
                    {instanceRefs[event.instance_id]?.name ?? event.instance_id}
                  </a>
                  {#if instanceRefs[event.instance_id]?.vmid !== null && instanceRefs[event.instance_id]?.vmid !== undefined}<small
                      >VMID {instanceRefs[event.instance_id]?.vmid}</small
                    >{/if}
                </dd>
              </div>
              <div>
                <dt>Actor</dt>
                <dd>{event.actor}</dd>
              </div>
              <div>
                <dt>Servicio</dt>
                <dd>{event.service}</dd>
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
        </details>
      {:else}<EmptyState
          onreset={() => {
            query = "";
            status = "all";
          }}
        />{/each}
    </div>{/if}
  <div class="table-footer pagination-footer">
    <button
      class="button"
      disabled={loading || data.blocked}
      onclick={() => historyPage(true)}>Explorar historial desde inicio</button
    >
    {#if browsing}<button
        class="button"
        disabled={loading || data.blocked || !historyHasMore}
        onclick={() => historyPage(false)}
        >{loading ? "Consultando…" : "Siguiente ventana"}</button
      ><button
        class="button"
        disabled={loading}
        onclick={() => (browsing = false)}>Volver a recientes</button
      >{/if}
    <span
      >{browsing
        ? `Cursor ${historyCursor} · ventana ${historyWindow}`
        : `Cursor de feed ${feedCursor}`}</span
    >
  </div>
  <div class="panel-note">
    Polling incremental y deduplicación por event_id. Última consulta real:
    {formatTime(lastPollAt || data.evidence?.queriedAt)} · última evidencia publicada:
    {formatTime(lastEvidenceAt)} · último evento recibido:
    {formatTime(lastEventAt || (merged[0]?.occurred_at ?? null))}.
  </div>
</section>
