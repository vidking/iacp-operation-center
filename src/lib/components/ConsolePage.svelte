<script lang="ts">
  import { page } from "$app/state";
  import {
    RefreshCw,
    ChevronDown,
    FlaskConical,
    Clock3,
    ArrowUpRight,
  } from "@lucide/svelte";
  import { viewState, notify, selectedOperation } from "#lib/stores/portal.ts";
  import type { PortalData, ViewState } from "#lib/types/portal.ts";
  import Overview from "./sections/Overview.svelte";
  import Operations from "./sections/Operations.svelte";
  import Events from "./sections/Events.svelte";
  import Workers from "./sections/Workers.svelte";
  import Incidents from "./sections/Incidents.svelte";
  import Crm from "./sections/Crm.svelte";
  import EmptyState from "./ui/EmptyState.svelte";
  import OperationDetail from "./operations/OperationDetail.svelte";
  import Badge from "./ui/Badge.svelte";
  let { section = "dashboard", data }: { section?: string; data: PortalData } =
    $props();
  const titles: Record<string, string> = {
    dashboard: "Overview",
    operations: "Operations",
    events: "Events",
    workers: "Workers & Queues",
    incidents: "Incidents & Recovery",
    crm: "CRM Simulator",
  };
  const descriptions: Record<string, string> = {
    dashboard: "Visibilidad operativa. Contexto para cada decisión.",
    operations:
      "Sigue cada intención, desde su admisión hasta la última evidencia.",
    events: "El rastro auditable que conecta cada operación.",
    workers: "Explora la actividad de procesamiento y las colas de ejemplo.",
    incidents: "Conecta señales, comprende evidencias y prepara la revisión.",
    crm: "La experiencia comercial, conectada visualmente a IaCoC.",
  };
  let refreshing = $state(false);
  let selected = $derived(
    data.operations.find((o) => o.operation_id === $selectedOperation) ?? null,
  );
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    await new Promise((resolve) => setTimeout(resolve, 550));
    viewState.set("ready");
    refreshing = false;
    notify(
      "Muestra DEMO recargada. La fecha de evidencia original se conserva.",
    );
  }
</script>

<svelte:head
  ><title>{titles[section]} · IaCoC</title><meta
    name="description"
    content="IaCoC, centro de operaciones visual del ecosistema IACP de Cyberfuel. Entorno de demostración."
  /></svelte:head
>
<div class="page-heading">
  <div>
    <div class="eyebrow">
      {section === "crm" ? "INTEGRACIONES" : "OPERATIONS CENTER"} <span>/</span> CYBERFUEL
    </div>
    <h1>{titles[section]}</h1>
    <p>{descriptions[section]}</p>
  </div>
  <div class="heading-actions">
    <label class="view-select"
      ><FlaskConical size={14} /><select
        aria-label="Simular estado de interfaz"
        value={$viewState}
        onchange={(e) => viewState.set(e.currentTarget.value as ViewState)}
        ><option value="ready">Vista DEMO</option><option value="loading"
          >Simular carga</option
        ><option value="error">Simular error</option><option value="empty"
          >Simular vacío</option
        ></select
      ></label
    ><button class="button" onclick={refresh} disabled={refreshing}
      ><RefreshCw size={14} class={refreshing ? "spin" : ""} />{refreshing
        ? "Actualizando"
        : "Actualizar"}</button
    >
  </div>
</div>
<div class="demo-ribbon">
  <span
    ><FlaskConical size={14} /><strong>MOCK WORKSPACE</strong><i></i>Datos
    simulados · sin conexión a IACP</span
  ><span class="ribbon-end">SOLO DEMOSTRACIÓN <ArrowUpRight size={12} /></span>
</div>
{#if $viewState === "loading" || refreshing}<section
    class="panel loading-panel"
  >
    <EmptyState
      kind="loading"
      title="Preparando la vista de ejemplo"
      description="Estado de carga simulado. No se está consultando infraestructura."
    />{#if !refreshing}<button
        class="button"
        onclick={() => viewState.set("ready")}>Finalizar carga DEMO</button
      >{/if}
    <div class="skeleton-grid" aria-hidden="true">
      {#each [1, 2, 3] as i}<div></div>{/each}
    </div>
  </section>{:else if $viewState === "error"}<section class="panel">
    <EmptyState
      kind="error"
      title="No pudimos cargar la evidencia"
      description="Error simulado para explorar la recuperación visual. No ocurrió una consulta real."
      onreset={() => viewState.set("ready")}
    />
  </section>{:else if $viewState === "empty"}<section class="panel">
    <EmptyState
      title="Aún no hay evidencia en esta vista"
      description="Escenario vacío DEMO. Una vista sin registros no certifica ausencia de actividad."
      onreset={() => viewState.set("ready")}
    />
  </section>{:else if section === "dashboard"}<Overview
    {data}
  />{:else if section === "operations"}{#key page.url.search}<Operations
      {data}
    />{/key}{:else if section === "events"}<Events
    {data}
  />{:else if section === "workers"}<Workers
  />{:else if section === "incidents"}<Incidents />{:else}<Crm />{/if}
<footer class="evidence-footer">
  <span
    ><Clock3 size={12} /> Última evidencia MOCK: {data.diagnostics
      ?.observed_at ?? "unknown"}
    <Badge value={data.freshness} /></span
  ><span
    >Cyberfuel · IaCoC Foundation <span class="footer-square"></span> 001</span
  >
</footer>
<OperationDetail
  operation={selected}
  events={data.events}
  onclose={() => selectedOperation.set(null)}
/>
