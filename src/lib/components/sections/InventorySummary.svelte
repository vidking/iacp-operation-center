<script lang="ts">
  import { onMount } from "svelte";
  import { formatTime } from "#lib/time.ts";
  let count = $state<number | null>(null),
    observedAt = $state(""),
    error = $state(""),
    hasMore = $state(false),
    counts = $state<Record<string, number>>({});
  onMount(() => {
    let active = true;
    fetch("/api/crm/instances")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (active) {
          count = d.instances.length;
          hasMore = d.hasMore;
          counts = d.instances.reduce(
            (sum: Record<string, number>, i: { status: string }) => {
              sum[i.status] = (sum[i.status] ?? 0) + 1;
              return sum;
            },
            {},
          );
          observedAt = d.observedAt;
        }
      })
      .catch(() => {
        if (active)
          error = "Inventario no disponible; consulta la conexión autorizada.";
      });
    return () => {
      active = false;
    };
  });
</script>

<section class="panel">
  <div class="panel-heading">
    <h2>Inventario del tenant</h2>
    <a class="text-link" href="/crm?view=instances">Mis instancias</a>
  </div>
  <div class="panel-note">
    <p>
      Registros autorizados: {count ?? "No disponible"}{hasMore
        ? " en esta página; hay más registros"
        : " en la consulta"}. Estados persistidos: {Object.entries(counts)
        .map(([s, n]) => `${s}: ${n}`)
        .join(" · ") || "No disponible"}.
    </p>
    <p>
      Energía agregada: no publicada. Consulta la observación de energía en el
      detalle de cada instancia.
    </p>
    <p>{error || `Última consulta: ${formatTime(observedAt)}`}</p>
  </div>
</section>
