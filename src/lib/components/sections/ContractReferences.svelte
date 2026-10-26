<script lang="ts">
  import { formatTime, utcTime } from "#lib/time.ts";
  let id = $state(""),
    kind = $state("jobs"),
    loading = $state(false),
    error = $state(""),
    result = $state<Record<string, unknown> | null>(null);
  async function lookup() {
    loading = true;
    result = null;
    error = "";
    try {
      const r = await fetch(`/api/crm/${kind}/${encodeURIComponent(id)}`);
      const v = await r.json();
      if (!r.ok) throw new Error(v.error ?? "REQUEST_FAILED");
      result = v;
    } catch (e) {
      error = e instanceof Error ? e.message : "REQUEST_FAILED";
    } finally {
      loading = false;
    }
  }
</script>

<details class="panel">
  <summary>Consultar trabajo o política por referencia IACP</summary>
  <div class="form-body">
    <p>
      Lectura limitada al tenant autorizado. No crea trabajos ni propone o
      aprueba políticas.
    </p>
    <div class="toolbar">
      <select aria-label="Tipo de referencia" bind:value={kind}
        ><option value="jobs">Trabajo</option><option value="policies"
          >Política</option
        ></select
      ><input aria-label="UUID de referencia IACP" bind:value={id} /><button
        class="button"
        disabled={loading || !/^[a-f0-9-]{36}$/.test(id)}
        onclick={lookup}>Consultar referencia</button
      >
    </div>
    {#if error}<p role="alert">{error}</p>{/if}{#if result}<dl
        class="detail-grid"
      >
        {#each Object.entries(result) as [key, value]}<div>
            <dt>{key}</dt>
            <dd>
              {#if key.endsWith("_at") && typeof value === "string"}<span
                  title={utcTime(value)}>{formatTime(value)}</span
                >{:else}{typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value ?? "Sin evidencia")}{/if}
            </dd>
          </div>{/each}
      </dl>{/if}
  </div>
</details>
