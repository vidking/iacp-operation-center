<script lang="ts">
  let { value, label }: { value: string; label?: string } = $props();
</script>

<span class="badge {value}"
  ><span class="status-dot"></span>{label ?? value}</span
>
