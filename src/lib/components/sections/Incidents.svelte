<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { page } from "$app/state";
  import { invalidateAll } from "$app/navigation";
  import { scheduleReads } from "#lib/refresh.ts";
  import { formatTime, utcTime, instant } from "#lib/time.ts";
  import { incidentLabels } from "#lib/types/incidents.ts";
  import type { IncidentPage } from "#lib/server/incidents/service.ts";
  import type { AuditEvent } from "#lib/types/observation.ts";
  import IncidentDetail from "../incidents/IncidentDetail.svelte";
  let {
    events = [],
    autoRefresh = true,
    refreshNonce = 0,
  }: {
    events?: AuditEvent[];
    autoRefresh?: boolean;
    refreshNonce?: number;
  } = $props();
  $effect(() => {
    if (refreshNonce)
      untrack(() => {
        void load();
      });
  });
  let result = $state<IncidentPage | null>(null),
    loading = $state(false),
    error = $state(""),
    offset = $state(0),
    selected = $state(page.url.searchParams.get("operation") ?? ""),
    revoked = $state(false);
  let query = $state(""),
    stateFilter = $state("all"),
    kind = $state("all"),
    code = $state(""),
    from = $state(""),
    until = $state("");
  const filtered = $derived(
    (result?.incidents ?? [])
      .filter(
        (i) =>
          (stateFilter === "all" || i.state === stateFilter) &&
          (kind === "all" || i.operation.kind === kind) &&
          (!code || (i.operation.error_code ?? "").includes(code)) &&
          (!from ||
            Date.parse(i.operation.updated_at) >=
              Date.parse(from + "T00:00:00-06:00")) &&
          (!until ||
            Date.parse(i.operation.updated_at) <
              Date.parse(until + "T23:59:59.999-06:00")) &&
          `${i.operation.operation_id} ${i.operation.instance_id} ${i.instance?.name ?? ""} ${i.instance?.vmid ?? ""} ${i.instance?.node ?? ""} ${events
            .filter((e) => e.operation_id === i.operation.operation_id)
            .map((e) => e.correlation_id)
            .join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      )
      .sort(
        (a, b) =>
          (instant(b.operation.updated_at) ?? 0) -
          (instant(a.operation.updated_at) ?? 0),
      ),
  );
  async function load(next = offset) {
    if (loading || revoked) return false;
    loading = true;
    error = "";
    try {
      const r = await fetch("/api/incidents?offset=" + next),
        v = await r.json();
      if (!r.ok) throw new Error(v.error ?? "REQUEST_FAILED");
      result = v;
      offset = next;
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : "REQUEST_FAILED";
      result = null;
      if (
        [
          "UPSTREAM_UNAUTHORIZED",
          "UPSTREAM_FORBIDDEN",
          "UPSTREAM_TENANT_MISMATCH",
          "CONNECTION_CHANGED",
          "AUTHENTICATION_REQUIRED",
        ].includes(error)
      ) {
        revoked = true;
        void invalidateAll();
      }
      return false;
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    void load();
    return scheduleReads({
      key: "incidents-list",
      enabled: () => autoRefresh && !selected && !revoked,
      interval: () =>
        result?.incidents.some((i) =>
          ["running", "queued", "uncertain"].includes(
            i.operation.normalized_status,
          ),
        )
          ? 4000
          : 30000,
      read: () => load(),
    });
  });
</script>

<section class="panel">
  <div class="panel-heading">
    <h2>Incidentes derivados de operaciones reales</h2>
    <button class="button" disabled={loading || revoked} onclick={() => load()}
      >Actualizar incidentes</button
    >
  </div>
  <p class="panel-note">
    Sin sistema de tickets persistente. {result?.scope ?? "Sin evidencia"}. {result
      ?.incidents.length ?? 0} señales / {result?.operationsQueried ?? 0} operaciones
    de la página; ningún contador es global. Consulta: {formatTime(
      result?.queriedAt,
    )} · última evidencia: {formatTime(result?.observedAt)}
  </p>
  <div class="toolbar">
    <input
      aria-label="Buscar incidentes"
      placeholder="UUID, VMID, nodo o correlación en ventana"
      bind:value={query}
    /><select aria-label="Estado de incidente" bind:value={stateFilter}
      ><option value="all">Todos los estados</option
      >{#each Object.entries(incidentLabels) as [id, label]}<option value={id}
          >{label}</option
        >{/each}</select
    ><select aria-label="Tipo de incidente" bind:value={kind}
      ><option value="all">Todos los tipos</option
      >{#each [...new Set(result?.incidents.map((i) => i.operation.kind) ?? [])] as type}<option
          value={type}>{type}</option
        >{/each}</select
    ><input
      aria-label="Código de error"
      placeholder="Código IACP"
      bind:value={code}
    /><label
      >Desde CR<input
        aria-label="Desde CR"
        type="date"
        bind:value={from}
      /></label
    ><label
      >Hasta CR<input
        aria-label="Hasta CR"
        type="date"
        bind:value={until}
      /></label
    >
  </div>
  {#if error}<div class="callout warning" role="alert">
      {error}. Sin evidencia actual.
    </div>{/if}
  <div class="table-wrap">
    <table>
      <thead
        ><tr
          ><th>Estado / gravedad</th><th>Operación</th><th
            >Instancia / VMID / nodo</th
          ><th>Código y diagnóstico</th><th>Última evidencia</th></tr
        ></thead
      ><tbody
        >{#each filtered as i}<tr
            ><td
              >{i.state ? incidentLabels[i.state] : "Histórico"}<small
                >{i.severity}</small
              ></td
            ><td
              ><button
                class="operation-link"
                onclick={() => (selected = i.operation.operation_id)}
                >{i.operation.kind}</button
              ><small>{i.operation.operation_id}</small></td
            ><td
              >{i.instance?.name ?? i.operation.instance_id}<small
                >{i.instance?.vmid ?? "Sin evidencia"} / {i.instance?.node ??
                  "Sin evidencia"} · {i.instance?.status ??
                  "Sin evidencia"}</small
              ></td
            ><td
              >{i.operation.error_code ?? "Sin código"}<small
                >{i.diagnosis.category}</small
              ></td
            ><td title={utcTime(i.operation.updated_at)}
              >{formatTime(i.operation.updated_at)}</td
            ></tr
          >{:else}<tr
            ><td colspan="5"
              >{loading
                ? "Consultando IACP…"
                : "Sin incidentes coincidentes en esta página. No certifica ausencia global."}</td
            ></tr
          >{/each}</tbody
      >
    </table>
  </div>
  <div class="table-footer">
    <button
      class="button"
      disabled={loading || !offset}
      onclick={() => load(Math.max(0, offset - 50))}>Anterior</button
    ><span>Offset {offset} · filtros sobre página consultada</span><button
      class="button"
      disabled={loading || !result?.hasMore}
      onclick={() => load(offset + 50)}>Siguiente</button
    >
  </div>
</section>
{#if selected}{#key selected}<IncidentDetail
      id={selected}
      onclose={() => {
        selected = "";
        void load();
      }}
    />{/key}{/if}
