<script lang="ts">
  import {
    ArrowUpRight,
    Activity,
    CircleCheck,
    CircleX,
    Cpu,
    ShieldCheck,
    CircleAlert,
    ArrowRight,
    Layers,
    Radio,
    Workflow,
  } from "@lucide/svelte";
  import type { PortalData } from "#lib/types/portal.ts";
  import StatCard from "../ui/StatCard.svelte";
  import Badge from "../ui/Badge.svelte";
  import ActivityChart from "../charts/ActivityChart.svelte";
  import StatusDistribution from "../charts/StatusDistribution.svelte";
  import OperationsTable from "../OperationsTable.svelte";
  import { workers, volume } from "#lib/mocks/experience.ts";
  let { data }: { data: PortalData } = $props();
  let completed = $derived(
    data.operations.filter((o) => o.normalized_status === "completed").length,
  );
  let running = $derived(
    data.operations.filter((o) => o.normalized_status === "running").length,
  );
  let failed = $derived(
    data.operations.filter((o) => o.normalized_status === "failed").length,
  );
</script>

<section class="overview-brief">
  <div class="brief-main">
    <div class="flex items-center gap-2">
      <span class="orange-text"><Radio size={15} /></span><span class="eyebrow"
        >PANORAMA DEL ENTORNO</span
      ><span class="demo-tag">DEMO</span>
    </div>
    <h2>Todo el contexto.<br /><span>Un solo centro de operaciones.</span></h2>
    <p>
      Explora operaciones, conecta evidencias y comprende el estado de tu
      infraestructura.
    </p>
    <a href="/operations" class="text-link"
      >Explorar operaciones <ArrowRight size={15} /></a
    >
  </div>
  <div class="system-map" aria-label="Diagrama conceptual del ecosistema IACP">
    <div class="map-node">
      <Workflow size={19} /><span>Control Plane<small>Orquestación</small></span
      ><i></i>
    </div>
    <div class="map-branches">
      <div class="map-node">
        <Cpu size={18} /><span>IaC Worker<small>Provisioning</small></span><i
          class="purple"
        ></i>
      </div>
      <div class="map-node">
        <Layers size={18} /><span>Lifecycle<small>Operaciones</small></span><i
          class="purple"
        ></i>
      </div>
    </div>
    <span class="map-caption">TOPOLOGÍA CONCEPTUAL · SIN CONECTIVIDAD REAL</span
    >
  </div>
</section>
<div class="stat-grid">
  <StatCard
    label="Workers activos · DEMO"
    value={workers.filter((w) => w.status !== "offline").length}
    detail="Escenario visual · liveness real unknown"
    tone="orange"
    trend={volume.slice(0, 8)}
    >{#snippet icon()}<Cpu size={17} />{/snippet}</StatCard
  ><StatCard
    label="En ejecución"
    value={running}
    detail="normalized_status · muestra local"
    tone="violet"
    trend={volume.slice(8, 16)}
    >{#snippet icon()}<Activity size={17} />{/snippet}</StatCard
  ><StatCard
    label="Completadas"
    value={completed}
    detail="Finalizadas en la muestra local"
    tone="green"
    trend={volume.slice(16)}
    >{#snippet icon()}<CircleCheck size={17} />{/snippet}</StatCard
  ><StatCard
    label="Fallidas"
    value={failed}
    detail="Más 1 incierta que requiere revisión"
    tone="red">{#snippet icon()}<CircleX size={17} />{/snippet}</StatCard
  >
</div>
<div class="chart-grid">
  <section class="panel"><ActivityChart /></section>
  <section class="panel">
    <StatusDistribution operations={data.operations} />
  </section>
</div>
<div class="overview-lower">
  <section class="panel">
    <div class="panel-heading">
      <div>
        <h2>Operaciones recientes</h2>
        <p>Una intención técnica por cada registro</p>
      </div>
      <a class="text-link" href="/operations"
        >Ver todas <ArrowUpRight size={14} /></a
      >
    </div>
    <OperationsTable operations={data.operations.slice(0, 4)} />
    <div class="panel-note">
      <ShieldCheck size={13} /> Evidencia local de demostración · actualización manual
    </div>
  </section>
  <div class="overview-rail">
    <section class="panel attention-panel">
      <div class="flex items-center justify-between">
        <span class="icon-tile amber"><CircleAlert size={20} /></span><span
          class="severity high">ATENCIÓN</span
        >
      </div>
      <h3>Una intención incierta</h3>
      <p>
        La última evidencia no confirma el resultado. Revisa su historia antes
        de decidir.
      </p>
      <a href="/incidents" class="text-link"
        >Abrir diagnóstico <ArrowRight size={14} /></a
      >
    </section>
    <section class="panel queue-summary">
      <div class="flex items-center justify-between">
        <h2>Estado de colas</h2>
        <span class="demo-tag">DEMO</span>
      </div>
      <div class="queue-line">
        <span>provisioning</span><strong>3 en espera</strong>
      </div>
      <div class="meter"><span style:width="50%"></span></div>
      <a class="text-link" href="/workers"
        >Explorar escenario <ArrowRight size={14} /></a
      ><small>Profundidad real: no divulgada</small>
    </section>
  </div>
</div>
<section class="panel">
  <div class="panel-heading">
    <h2>Últimos eventos</h2>
    <a class="text-link" href="/events"
      >Abrir explorador <ArrowUpRight size={14} /></a
    >
  </div>
  <div class="recent-events">
    {#each data.events.slice(0, 3) as event}<a
        href="/events?operation={event.operation_id}"
        ><span class="timeline-point {event.status}"></span>
        <div>
          <strong>{event.kind}</strong><small
            >{event.operation_id} · {event.service}</small
          >
        </div>
        <Badge value={event.status} /><time
          >{event.occurred_at.slice(11, 16)} UTC</time
        ></a
      >{/each}
  </div>
</section>
