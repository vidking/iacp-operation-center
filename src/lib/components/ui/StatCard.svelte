<script lang="ts">
  import type { Snippet } from "svelte";
  let {
    label,
    value,
    detail,
    tone = "neutral",
    icon,
    trend,
    href,
  }: {
    label: string;
    value: string | number;
    detail: string;
    tone?: string;
    icon?: Snippet;
    trend?: number[];
    href?: string;
  } = $props();
</script>

<article class="stat-card {tone}">
  <div class="flex items-center justify-between gap-3">
    <span>{label}</span><span class="stat-icon"
      >{#if icon}{@render icon()}{/if}</span
    >
  </div>
  <div class="stat-value-row">
    <strong
      >{#if href}<a class="text-link" {href}>{value}</a
        >{:else}{value}{/if}</strong
    >{#if trend}<svg class="sparkline" viewBox="0 0 100 32" aria-hidden="true"
        ><polyline
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          points={trend
            .map((v, i) => `${(i * 100) / (trend.length - 1)},${31 - v * 0.35}`)
            .join(" ")}
        /></svg
      >{/if}
  </div>
  <small>{detail}</small>
</article>
