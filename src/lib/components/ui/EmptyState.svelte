<script lang="ts">
  import { SearchX, CircleAlert, LoaderCircle } from "@lucide/svelte";
  let {
    kind = "empty",
    title = "Sin resultados",
    description = "Prueba otros filtros o limpia la búsqueda.",
    onreset,
  }: {
    kind?: "empty" | "error" | "loading";
    title?: string;
    description?: string;
    onreset?: () => void;
  } = $props();
</script>

<div class="empty-state" role="status" aria-live="polite">
  <div class="empty-icon">
    {#if kind === "loading"}<LoaderCircle
        size={25}
        class="spin"
      />{:else if kind === "error"}<CircleAlert size={25} />{:else}<SearchX
        size={25}
      />{/if}
  </div>
  <h3>{title}</h3>
  <p>{description}</p>
  {#if onreset}<button class="button" onclick={onreset}
      >{kind === "error" ? "Restablecer demo" : "Limpiar filtros"}</button
    >{/if}
</div>
