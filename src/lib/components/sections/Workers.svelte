<script lang="ts">
  import {
    Cpu,
    Layers,
    Clock3,
    Gauge,
    ArrowUpRight,
    Search,
    CircleHelp,
  } from "@lucide/svelte";
  import { workers, queues } from "#lib/mocks/experience.ts";
  import StatCard from "../ui/StatCard.svelte";
  import Badge from "../ui/Badge.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  let query = $state("");
  let status = $state("all");
  let filtered = $derived(
    workers.filter(
      (w) =>
        (status === "all" || w.status === status) &&
        `${w.name} ${w.service}`.toLowerCase().includes(query.toLowerCase()),
    ),
  );
</script>

<div class="callout warning">
  <CircleHelp size={19} />
  <p>
    <strong>Escenario de supervisión DEMO.</strong> Workers, duración, carga y
    profundidad de colas son fixtures visuales. Liveness real:
    <code>unknown</code>. Profundidad real: <code>not-disclosed</code>.
  </p>
</div>
<div class="stat-grid">
  <StatCard
    label="Workers disponibles · DEMO"
    value="3 / 4"
    detail="2 running · 1 idle · 1 offline"
    tone="violet">{#snippet icon()}<Cpu size={18} />{/snippet}</StatCard
  ><StatCard
    label="En espera · DEMO"
    value="4"
    detail="En las tres colas de ejemplo"
    tone="orange">{#snippet icon()}<Layers size={18} />{/snippet}</StatCard
  ><StatCard
    label="Tarea más larga · DEMO"
    value="142 s"
    detail="Duración ilustrativa, sin telemetría"
    >{#snippet icon()}<Clock3 size={18} />{/snippet}</StatCard
  ><StatCard
    label="Capacidad ocupada · DEMO"
    value="50%"
    detail="2 de 4 workers de ejemplo"
    tone="green">{#snippet icon()}<Gauge size={18} />{/snippet}</StatCard
  >
</div>
<div class="section-line">
  <h2>Workers de procesamiento <span class="count-chip">4</span></h2>
  <div class="flex gap-3">
    <label class="search-field compact"
      ><Search size={15} /><input
        aria-label="Buscar workers"
        placeholder="Buscar worker…"
        bind:value={query}
      /></label
    ><select aria-label="Filtrar workers" bind:value={status}
      ><option value="all">Todos</option><option value="running">Running</option
      ><option value="idle">Idle</option><option value="offline">Offline</option
      ></select
    >
  </div>
</div>
<div class="worker-grid">
  {#each filtered as worker}<article class="panel worker-card">
      <div class="flex items-center justify-between">
        <span class="icon-tile violet"><Cpu size={20} /></span><Badge
          value={worker.status}
        />
      </div>
      <h3>{worker.name}</h3>
      <p>{worker.service} <span class="demo-tag">DEMO</span></p>
      <div class="worker-load">
        <span>Carga ilustrativa</span><strong>{worker.utilization}%</strong>
      </div>
      <svg
        class="worker-spark"
        viewBox="0 0 200 45"
        role="img"
        aria-label={`Carga sintética ${worker.utilization}%`}
        ><polyline
          points={worker.history
            .map((v, i) => `${(i * 200) / 7},${44 - v * 0.6}`)
            .join(" ")}
          fill="none"
          stroke={worker.status === "offline" ? "#667184" : "#b19ff0"}
          stroke-width="2"
        /></svg
      >
      <div class="worker-task">
        <span class="mono">{worker.task}</span><small
          >{worker.duration ? `${worker.duration} s` : "—"}</small
        >
      </div>
      <a class="text-link" href="/events"
        >Consultar actividad <ArrowUpRight size={13} /></a
      >
    </article>{:else}<div class="panel col-span-full">
      <EmptyState
        onreset={() => {
          query = "";
          status = "all";
        }}
      />
    </div>{/each}
</div>
<section class="panel">
  <div class="panel-heading">
    <div>
      <h2>Colas de procesamiento</h2>
      <p>Capacidad y saturación ilustrativas, sin interfaz real conectada</p>
    </div>
    <span class="demo-tag">DEMO</span>
  </div>
  <div class="table-wrap">
    <table>
      <thead
        ><tr
          ><th>Cola</th><th>En espera</th><th>Procesando</th><th
            >Ocupación ilustrativa</th
          ><th>Estado</th></tr
        ></thead
      ><tbody
        >{#each queues as queue}<tr
            ><td
              ><span class="table-kind"
                ><Layers size={15} /><strong>{queue.name}</strong></span
              ></td
            ><td>{queue.waiting}</td><td>{queue.processing}</td><td
              ><div class="queue-meter">
                <div class="meter">
                  <span
                    style:width={`${((queue.waiting + queue.processing) / queue.capacity) * 100}%`}
                  ></span>
                </div>
                <span>{queue.waiting + queue.processing}/{queue.capacity}</span>
              </div></td
            ><td
              ><Badge
                value={queue.waiting ? "queued" : "idle"}
                label={queue.waiting ? "Pendiente · DEMO" : "Sin espera · DEMO"}
              /></td
            ></tr
          >{/each}</tbody
      >
    </table>
  </div>
</section>
