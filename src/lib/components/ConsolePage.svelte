<script lang="ts">
  import { onMount } from "svelte";
  import { scheduleReads, singleFlight } from "#lib/refresh.ts";
  import { formatTime, utcTime } from "#lib/time.ts";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { RefreshCw, Clock3, ShieldCheck } from "@lucide/svelte";
  import { selectedOperation } from "#lib/stores/portal.ts";
  import type { PortalData } from "#lib/types/portal.ts";
  import { stateLabels } from "#lib/types/connection-state.ts";
  import { connectionMessage } from "#lib/types/connection-diagnostics.ts";
  import LiveEvidence from "./sections/LiveEvidence.svelte";
  import Operations from "./sections/Operations.svelte";
  import Incidents from "./sections/Incidents.svelte";
  import Events from "./sections/Events.svelte";
  import OperationDetail from "./operations/OperationDetail.svelte";
  import EvidenceClock from "./ui/EvidenceClock.svelte";
  import Badge from "./ui/Badge.svelte";
  let { section = "dashboard", data }: { section?: string; data: PortalData } =
    $props();
  const titles: Record<string, string> = {
    dashboard: "Overview",
    operations: "Operations",
    events: "Events",
    workers: "Workers & Queues",
    incidents: "Incidents & Recovery",
  };
  const descriptions: Record<string, string> = {
    dashboard: "Visibilidad operativa. Contexto para cada decisión.",
    operations:
      "Sigue cada intención, desde su admisión hasta la última evidencia.",
    events: "El rastro auditable que conecta cada operación.",
    workers: "Evidencia disponible y límites de instrumentación.",
    incidents:
      "Señales verificables y diagnóstico de las operaciones consultadas.",
  };
  let autoRefresh = $state(true);
  let refreshNonce = $state(0);
  let refreshing = $state(false),
    refreshError = $state("");
  let selected = $derived(
    data.operations.find((o) => o.operation_id === $selectedOperation) ?? null,
  );
  async function refresh() {
    if (["operations", "incidents"].includes(section)) {
      refreshNonce++;
      return;
    }
    if (refreshing) return;
    refreshing = true;
    refreshError = "";
    try {
      await singleFlight("portal-refresh", () => invalidateAll());
    } catch {
      refreshError = connectionMessage("REQUEST_FAILED");
    } finally {
      refreshing = false;
    }
  }
  onMount(() =>
    scheduleReads({
      key: "portal-refresh-loop",
      enabled: () =>
        autoRefresh &&
        section !== "operations" &&
        section !== "incidents" &&
        !data.blocked &&
        !$selectedOperation &&
        data.operations.some((o) =>
          ["queued", "running", "uncertain"].includes(o.normalized_status),
        ),
      interval: () => 4000,
      read: async () => {
        await refresh();
        return !data.partial && !data.blocked;
      },
    }),
  );
</script>

<svelte:head
  ><title>{titles[section]} · IaCoC</title><meta
    name="description"
    content="Centro de operaciones y observabilidad de IACP."
  /></svelte:head
>
<div class="page-heading">
  <div>
    <div class="eyebrow">OPERATIONS CENTER <span>/</span> CYBERFUEL</div>
    <h1>{titles[section]}</h1>
    <p>{descriptions[section]}</p>
  </div>
  <div class="heading-actions">
    <label
      ><input type="checkbox" bind:checked={autoRefresh} /> Actualizar activas (4
      s)</label
    >
    <button class="button" onclick={refresh} disabled={refreshing}
      ><RefreshCw size={14} class={refreshing ? "spin" : ""} />{refreshing
        ? "Actualizando"
        : "Actualizar"}</button
    >
  </div>
</div>
<div class="connection-ribbon">
  <span
    ><ShieldCheck size={14} /><strong>{stateLabels[data.status]}</strong><i
    ></i>Lectura autorizada de IACP</span
  ><span class="ribbon-end">OBSERVACIÓN</span>
</div>
{#if data.partial || data.status === "disconnected"}<div
    class="callout warning"
    role="status"
  >
    <strong>{stateLabels[data.status]}.</strong>
    {data.errorCode
      ? connectionMessage(data.errorCode)
      : data.freshness === "stale"
        ? "Se muestra la última evidencia conocida. No representa el estado actual."
        : "Revisa la evidencia y el estado de las dependencias."}
    {#if page.data.user?.role === "Administrator"}<a
        class="text-link"
        href="/administration/connections">Diagnóstico de conexión</a
      >{:else}<span>Contacta al administrador del espacio.</span>{/if}
  </div>{/if}
{#if refreshError}<div class="callout warning" role="alert">
    {refreshError}
  </div>{/if}
{#if section === "operations"}{#key page.url.search}<Operations
      {data}
      {autoRefresh}
      {refreshNonce}
    />{/key}{:else if section === "incidents"}<Incidents
    events={data.events}
    {autoRefresh}
    {refreshNonce}
  />{:else if section === "events"}<Events {data} />{:else}<LiveEvidence
    {data}
    {section}
  />{/if}
<EvidenceClock observedAt={data.diagnostics?.observed_at} />
<footer class="evidence-footer">
  <span
    ><Clock3 size={12} />Última evidencia: {formatTime(
      data.diagnostics?.observed_at,
    )}<Badge value={data.freshness} /></span
  ><span>Cyberfuel · IaCoC <span class="footer-square"></span>0.6.1</span>
</footer>
<OperationDetail
  operationId={$selectedOperation}
  operation={selected}
  events={data.events}
  onclose={() => selectedOperation.set(null)}
/>
