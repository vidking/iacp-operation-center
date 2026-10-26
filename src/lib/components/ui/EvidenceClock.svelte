<script lang="ts">
  import { onMount } from "svelte";
  import { formatTime, instant } from "#lib/time.ts";
  let { observedAt = null }: { observedAt?: string | null } = $props();
  let now = $state<string | null>(null);
  let age = $derived(
    now && instant(observedAt) !== null
      ? Math.max(0, Math.floor((Date.parse(now) - instant(observedAt)!) / 1000))
      : null,
  );
  onMount(() => {
    now = new Date().toISOString();
    const timer = setInterval(() => {
      now = new Date().toISOString();
    }, 1000);
    return () => clearInterval(timer);
  });
</script>

<span class="micro muted"
  >Hora local: {formatTime(now)} · reloj local, sin consultar infraestructura. {#if age !== null}Edad
    de evidencia: {age} s.{/if}</span
>
