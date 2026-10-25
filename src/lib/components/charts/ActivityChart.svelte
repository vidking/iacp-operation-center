<script lang="ts">
  import { volume } from "#lib/mocks/experience.ts";
  let { compact = false }: { compact?: boolean } = $props();
  let range = $state("24h");
  let active = $state<number | null>(null);
  let values = $derived(
    range === "6h"
      ? volume.slice(-6)
      : range === "12h"
        ? volume.slice(-12)
        : volume,
  );
  let points = $derived(
    values
      .map((v, i) => `${(i * 600) / (values.length - 1)},${172 - v * 1.7}`)
      .join(" "),
  );
</script>

<div class="chart-heading">
  <div>
    <h2>{compact ? "Actividad reciente" : "Actividad de operaciones"}</h2>
    <p>Volumen ilustrativo · serie sintética DEMO</p>
  </div>
  {#if !compact}<div class="segmented" aria-label="Ventana de actividad">
      {#each ["6h", "12h", "24h"] as period}<button
          class:chosen={range === period}
          aria-pressed={range === period}
          onclick={() => {
            range = period;
            active = null;
          }}>{period}</button
        >{/each}
    </div>{/if}
</div>
<div class="chart-summary">
  <strong
    >{active === null
      ? values.reduce((a, b) => a + b, 0)
      : values[active]}</strong
  ><span
    >{active === null
      ? "registros ilustrativos"
      : `muestra ${active + 1} · DEMO`}</span
  ><span class="chart-legend"
    ><i></i> Operaciones <i class="secondary"></i> Capacidad ilustrativa</span
  >
</div>
<div class="activity-chart">
  <div class="chart-axis">
    <span>100</span><span>75</span><span>50</span><span>25</span><span>0</span>
  </div>
  <div class="chart-canvas">
    <svg
      viewBox="0 0 600 190"
      preserveAspectRatio="none"
      role="img"
      aria-label="Serie sintética de volumen de operaciones, sin datos reales"
      ><defs
        ><linearGradient id="activity-fill" x1="0" x2="0" y1="0" y2="1"
          ><stop stop-color="#f58b54" stop-opacity=".25" /><stop
            offset="1"
            stop-color="#f58b54"
            stop-opacity="0"
          /></linearGradient
        ></defs
      >{#each [15, 55, 95, 135, 175] as y}<line
          x1="0"
          y1={y}
          x2="600"
          y2={y}
          stroke="#2b303b"
          stroke-dasharray="3 5"
        />{/each}<path
        d="M0 50 Q150 20 300 45 T600 30"
        stroke="#667084"
        stroke-dasharray="5 6"
        fill="none"
      /><polygon
        points={`0,190 ${points} 600,190`}
        fill="url(#activity-fill)"
      /><polyline
        {points}
        fill="none"
        stroke="#f58b54"
        stroke-width="2.5"
        vector-effect="non-scaling-stroke"
      />{#each values as v, i}<circle
          cx={(i * 600) / (values.length - 1)}
          cy={172 - v * 1.7}
          r={active === i ? 5 : 0}
          fill="#fcb28b"
        />{/each}</svg
    >
    <div class="chart-targets">
      {#each values as v, i}<button
          aria-label={`Muestra ${i + 1}: ${v} registros DEMO`}
          onfocus={() => (active = i)}
          onmouseenter={() => (active = i)}
          onmouseleave={() => (active = null)}
          onclick={() => (active = i)}
        ></button>{/each}
    </div>
    <div class="chart-labels">
      <span
        >{range === "24h" ? "08:00" : range === "12h" ? "20:00" : "02:00"}</span
      ><span>DEMO · {range}</span><span>08:00 UTC</span>
    </div>
  </div>
</div>
