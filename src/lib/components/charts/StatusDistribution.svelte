<script lang="ts">
  import type { Operation } from "#lib/types/observation.ts";
  let { operations }: { operations: Operation[] } = $props();
  const statuses = [
    { id: "completed", label: "Completadas", color: "#76c6ac" },
    { id: "running", label: "En ejecución", color: "#a89aef" },
    { id: "queued", label: "En espera", color: "#d6b770" },
    { id: "uncertain", label: "Inciertas", color: "#f29a59" },
    { id: "failed", label: "Fallidas", color: "#e48287" },
  ];
  let counts = $derived(
    statuses.map((s) => ({
      ...s,
      count: operations.filter((o) => o.normalized_status === s.id).length,
    })),
  );
  let gradient = $derived.by(() => {
    let at = 0;
    return `conic-gradient(${counts
      .map((s) => {
        const start = at;
        at += (s.count / Math.max(operations.length, 1)) * 100;
        return `${s.color} ${start}% ${at}%`;
      })
      .join(",")})`;
  });
</script>

<div class="chart-heading">
  <div>
    <h2>Distribución de estados</h2>
    <p>Operaciones de la muestra local</p>
  </div>
  <span class="demo-tag">DEMO</span>
</div>
<div class="distribution">
  <div
    class="donut"
    style:background={operations.length ? gradient : "#2a303b"}
    role="img"
    aria-label={counts.map((s) => `${s.label}: ${s.count}`).join(", ")}
  >
    <div><strong>{operations.length}</strong><small>operaciones</small></div>
  </div>
  <div class="distribution-legend">
    {#each counts as s}<a href="/operations?status={s.id}"
        ><i style:background={s.color}></i><span>{s.label}</span><strong
          >{s.count}</strong
        ></a
      >{/each}
  </div>
</div>
