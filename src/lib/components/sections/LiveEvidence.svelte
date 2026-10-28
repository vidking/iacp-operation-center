<script lang="ts">
  import { onMount } from "svelte";
  import { diagnosis } from "#lib/diagnostics.ts";
  import { formatTime, utcTime } from "#lib/time.ts";
  import { humanDuration, humanizeKind } from "#lib/operation-display.ts";
  import type { Operation } from "#lib/types/observation.ts";
  import type { PortalData } from "#lib/types/portal.ts";
  import {
    ArrowUpRight,
    CircleHelp,
    Hexagon,
    ListChecks,
    Server,
  } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import { selectedOperation } from "#lib/stores/portal.ts";

  type InstanceReference = {
    instance_id: string;
    name: string;
    vmid: number | null;
    node: string | null;
  };

  let { data, section }: { data: PortalData; section: string } = $props();
  let instanceRefs = $state<Record<string, InstanceReference>>({});
  let instanceIndexError = $state("");
  let visibleOperations = $derived(
    [...data.operations]
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
      .slice(0, 8),
  );
  let failedVisible = $derived(
    data.operations.filter(
      (operation) => operation.normalized_status === "failed",
    ).length,
  );
  let observedInstances = $derived(
    new Set(data.operations.map((operation) => operation.instance_id)).size,
  );
  let signals = $derived(
    visibleOperations.filter(
      (operation) =>
        ["failed", "uncertain"].includes(operation.normalized_status) ||
        diagnosis(operation).category === "Sin evidencia reciente",
    ),
  );

  onMount(() => {
    if (section !== "dashboard") return;
    let active = true;
    fetch("/api/instance-index", { signal: AbortSignal.timeout(15000) })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error ?? "REQUEST_FAILED");
        if (active)
          instanceRefs = Object.fromEntries(
            (value.instances ?? []).map((instance: InstanceReference) => [
              instance.instance_id,
              instance,
            ]),
          );
      })
      .catch((error) => {
        if (active)
          instanceIndexError =
            error instanceof Error ? error.message : "REQUEST_FAILED";
      });
    return () => {
      active = false;
    };
  });

  function referenceFor(operation: Operation) {
    return instanceRefs[operation.instance_id];
  }
</script>

{#if section === "dashboard"}
  <section class="overview-intro" aria-labelledby="overview-intro-title">
    <div>
      <span class="section-kicker">INFRASTRUCTURE OPERATIONS WORKSPACE</span>
      <h2 id="overview-intro-title">
        Evidencia para decidir. Acciones bajo control.
      </h2>
      <p>
        Observa el Control Plane y sigue recursos autorizados sin confundir
        estado persistido con telemetría que IACP no publica.
      </p>
      <nav class="inline-actions" aria-label="Accesos rápidos del Overview">
        <a class="button primary" href="/operations"
          >Ver operaciones <ArrowUpRight size={14} /></a
        >
        <a class="quiet-link" href="/events"
          >Abrir eventos <ArrowUpRight size={14} /></a
        >
      </nav>
    </div>
    <div
      class="workspace-signature"
      aria-label="Infrastructure as Code Operation Center"
    >
      <Hexagon size={42} strokeWidth={1.25} />
      <span>IaC<span>OC</span></span>
      <small>Connected evidence</small>
    </div>
  </section>

  <section class="summary-strip" aria-labelledby="summary-title">
    <div class="section-heading section-heading-compact">
      <div>
        <span class="section-kicker">LECTURA ACTUAL</span>
        <h2 id="summary-title">Resumen operativo</h2>
      </div>
      <span class="evidence-note">{formatTime(data.evidence?.queriedAt)}</span>
    </div>
    <div class="summary-metrics">
      <a class="summary-metric" href="/operations?status=active">
        <span>En ejecución</span>
        <strong>{data.diagnostics?.active_operations ?? "No publicada"}</strong>
        <small>estado persistido</small>
      </a>
      <a class="summary-metric" href="/operations?status=failed">
        <span>Fallidas visibles</span>
        <strong>{failedVisible}</strong>
        <small>en la ventana consultada</small>
      </a>
      <a class="summary-metric" href="/crm?view=instances">
        <span>Instancias con actividad</span>
        <strong>{observedInstances || "No publicada"}</strong>
        <small>no es el total del tenant</small>
      </a>
      <div class="summary-metric">
        <span>Vigencia</span>
        <strong
          >{data.freshness === "fresh"
            ? "Actual"
            : data.freshness === "stale"
              ? "Anterior"
              : "No publicada"}</strong
        >
        <small>última observación disponible</small>
      </div>
    </div>
  </section>

  <div class="overview-grid">
    <section class="activity-section" aria-labelledby="activity-title">
      <div class="section-heading">
        <div>
          <span class="section-kicker">SEGUIMIENTO</span>
          <h2 id="activity-title">Actividad reciente</h2>
        </div>
        <a class="quiet-link" href="/operations"
          >Ver todas <ArrowUpRight size={14} /></a
        >
      </div>
      <p class="section-note">
        Últimas {visibleOperations.length} operaciones por última evidencia. El historial
        completo y su paginación viven en Operations.
      </p>
      {#if instanceIndexError}
        <p class="sync-note" role="status">
          Nombres y VMID no disponibles para esta lectura; se conserva el
          identificador publicado.
        </p>
      {/if}
      {#if visibleOperations.length}
        <div class="activity-list" role="list">
          {#each visibleOperations as operation}
            {@const reference = referenceFor(operation)}
            <article class="activity-row" role="listitem">
              <span
                class="activity-marker {operation.normalized_status}"
                aria-hidden="true"
              ></span>
              <div class="activity-main">
                <div class="activity-title-row">
                  <strong>{humanizeKind(operation.kind)}</strong>
                  <Badge value={operation.normalized_status} />
                </div>
                <div class="activity-resource">
                  <a href={`/crm?instance=${operation.instance_id}`}>
                    {reference?.name ?? operation.instance_id}
                  </a>
                  {#if reference?.vmid !== null && reference?.vmid !== undefined}<span
                      >VM {reference.vmid}</span
                    >{/if}
                  {#if reference?.node}<span>{reference.node}</span>{/if}
                </div>
                <small class="mono" title={operation.operation_id}
                  >{operation.operation_id}</small
                >
              </div>
              <time title={utcTime(operation.updated_at)}
                >{formatTime(operation.updated_at)}</time
              >
              <div class="activity-actions">
                <button
                  class="quiet-link"
                  onclick={() => selectedOperation.set(operation.operation_id)}
                  >Detalle <ArrowUpRight size={13} /></button
                >
                <a
                  class="icon-button"
                  href={`/events?operation=${encodeURIComponent(operation.operation_id)}`}
                  aria-label={`Ver eventos de ${operation.operation_id}`}
                  ><ListChecks size={15} /></a
                >
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <EmptyState
          title="Sin actividad publicada"
          description="IACP no ha publicado operaciones para esta lectura."
        />
      {/if}
    </section>

    <section class="dependency-rail" aria-labelledby="dependency-title">
      <div class="section-heading">
        <div>
          <span class="section-kicker">DEPENDENCIAS</span>
          <h2 id="dependency-title">Observadas</h2>
        </div>
        <Badge
          value={data.freshness}
          label={data.freshness === "fresh"
            ? "Actual"
            : data.freshness === "stale"
              ? "Anterior"
              : "No disponible"}
        />
      </div>
      <div class="dependency-list">
        {#each Object.entries(data.diagnostics?.dependencies ?? {}) as [name, state]}
          <div class="dependency-row">
            <span
              ><span class="dependency-dot {state.toLowerCase()}"
              ></span>{name}</span
            >
            <Badge
              value={data.freshness === "fresh" ? state : "unknown"}
              label={data.freshness === "fresh"
                ? state
                : `${state} · evidencia anterior`}
            />
          </div>
        {:else}
          <p class="sync-note">
            No hay diagnóstico publicado. No se infiere conectividad a partir de
            datos ausentes.
          </p>
        {/each}
      </div>
      <a class="quiet-link" href="/administration/connections"
        >Ver evidencia de conexión <ArrowUpRight size={14} /></a
      >
    </section>
  </div>

  <section class="inventory-strip" aria-label="Inventario observado">
    <div>
      <Server size={17} /><strong>Inventario del tenant</strong><span
        >Consulta nombres, VMID, energía e IP publicada en el detalle.</span
      >
    </div>
    <a class="quiet-link" href="/crm?view=instances"
      >Abrir inventario <ArrowUpRight size={14} /></a
    >
  </section>
{:else if section === "workers"}
  <section class="architecture-section" aria-labelledby="architecture-title">
    <div class="section-heading">
      <div>
        <span class="section-kicker">MODELO DE EJECUCIÓN</span>
        <h2 id="architecture-title">
          Control Plane → Queues → Workers → Operations → KVM/LXC
        </h2>
      </div>
      <span class="concept-label">Arquitectura conceptual</span>
    </div>
    <p class="section-note">
      La composición explica relaciones del sistema; no representa telemetría
      real ni acredita procesos vivos.
    </p>
    <div
      class="architecture-flow"
      role="img"
      aria-label="Control Plane conduce a colas, workers, operaciones y recursos KVM o LXC"
    >
      <div class="architecture-node evidence">
        <strong>Control Plane</strong><small>contexto IACP</small>
      </div>
      <span class="architecture-arrow" aria-hidden="true">→</span>
      <div class="architecture-node">
        <strong>Queues</strong><small
          >{data.diagnostics?.queue_depth
            ? "profundidad publicada"
            : "sin profundidad publicada"}</small
        >
      </div>
      <span class="architecture-arrow" aria-hidden="true">→</span>
      <div class="architecture-node">
        <strong>Workers</strong><small>liveness no publicado</small>
      </div>
      <span class="architecture-arrow" aria-hidden="true">→</span>
      <div class="architecture-node evidence">
        <strong>Operations</strong><small>estado persistido</small>
      </div>
      <span class="architecture-arrow" aria-hidden="true">→</span>
      <div class="architecture-node">
        <strong>KVM / LXC</strong><small>evidencia por recurso</small>
      </div>
    </div>
  </section>

  <section class="telemetry-section" aria-labelledby="telemetry-title">
    <div class="section-heading">
      <div>
        <span class="section-kicker">OBSERVABILIDAD</span>
        <h2 id="telemetry-title">Qué publica IACP para esta lectura</h2>
      </div>
      <Badge value={data.freshness} />
    </div>
    <div class="telemetry-grid">
      <div class="telemetry-item">
        <span>Worker liveness</span><strong
          >{data.diagnostics?.worker_liveness === "unknown"
            ? "No publicado"
            : (data.diagnostics?.worker_liveness ?? "No publicado")}</strong
        ><small>No se infiere desde eventos.</small>
      </div>
      <div class="telemetry-item">
        <span>Profundidad de colas</span><strong
          >{data.diagnostics?.queue_depth
            ? Object.entries(data.diagnostics.queue_depth)
                .map(([queue, depth]) => `${queue}: ${depth}`)
                .join(" · ")
            : "No publicada"}</strong
        ><small
          >{data.diagnostics?.queue_depth
            ? "Evidencia publicada por IACP."
            : "IACP no publica este dato para la lectura."}</small
        >
      </div>
      <div class="telemetry-item">
        <span>Edad activa más antigua</span><strong
          >{humanDuration(data.diagnostics?.oldest_active_age_seconds)}</strong
        ><small>Desde admisión; no es latencia de cola.</small>
      </div>
    </div>
    <div class="architecture-empty">
      <CircleHelp size={18} />
      <p>
        IACP no acredita procesos worker vivos cuando no publica liveness. La
        ausencia de telemetría queda visible como límite, no como fallo.
      </p>
      <a class="quiet-link" href="/operations?status=active"
        >Ver operaciones activas <ArrowUpRight size={14} /></a
      >
    </div>
  </section>
{:else}
  {#if data.diagnostics && Object.values(data.diagnostics.dependencies).some((state) => !["ready", "ok", "up", "healthy"].includes(state.toLowerCase()))}
    <div class="callout warning" role="status">
      Dependencias que requieren verificación: {Object.entries(
        data.diagnostics.dependencies,
      )
        .filter(
          ([, state]) =>
            !["ready", "ok", "up", "healthy"].includes(state.toLowerCase()),
        )
        .map(([name, state]) => `${name}: ${state}`)
        .join(" · ")}. Un estado desconocido no acredita una avería.
    </div>
  {/if}
  <section class="signal-section" aria-labelledby="signals-title">
    <div class="section-heading">
      <div>
        <span class="section-kicker">EVIDENCIA CONSULTADA</span>
        <h2 id="signals-title">Señales que requieren contexto</h2>
      </div>
      <span class="section-note"
        >No es un sistema de tickets ni un total global.</span
      >
    </div>
    {#each signals as operation}
      <article class="signal-row">
        <div>
          <strong>{humanizeKind(operation.kind)}</strong><span
            >{operation.error_code ?? "Sin código publicado"}</span
          >
        </div>
        <Badge value={operation.normalized_status} />
        <p>{diagnosis(operation).category}. {diagnosis(operation).next}</p>
        <button
          class="quiet-link"
          onclick={() => selectedOperation.set(operation.operation_id)}
          >Consultar operación <ArrowUpRight size={14} /></button
        >
      </article>
    {:else}
      <EmptyState
        title="Sin señales en la ventana"
        description="La lectura consultada no certifica ausencia global de incidentes."
      />
    {/each}
  </section>
{/if}
