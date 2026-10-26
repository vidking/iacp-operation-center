<script lang="ts">
  import { diagnosis } from "#lib/diagnostics.ts";
  import { formatTime, utcTime } from "#lib/time.ts";
  import {
    Activity,
    CircleHelp,
    Clock3,
    ShieldAlert,
    ArrowUpRight,
  } from "@lucide/svelte";
  import type { PortalData } from "#lib/types/portal.ts";
  import InventorySummary from "./InventorySummary.svelte";
  import StatCard from "../ui/StatCard.svelte";
  import Badge from "../ui/Badge.svelte";
  import OperationsTable from "../OperationsTable.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import { selectedOperation } from "#lib/stores/portal.ts";
  let { data, section }: { data: PortalData; section: string } = $props();
  let signals = $derived(
    data.operations.filter(
      (o) =>
        ["failed", "uncertain"].includes(o.normalized_status) ||
        diagnosis(o).category === "Sin evidencia reciente",
    ),
  );
</script>

{#if section === "dashboard"}<div class="stat-grid">
    <StatCard
      href="/operations?status=active"
      label="Operaciones activas"
      value={data.diagnostics?.active_operations ?? "No disponible"}
      detail="Estado persistido del tenant"
      >{#snippet icon()}<Activity size={18} />{/snippet}</StatCard
    ><StatCard
      href="/operations?status=uncertain"
      label="Operaciones inciertas"
      value={data.diagnostics?.uncertain_operations ?? "No disponible"}
      detail="Evidencia de IACP, no alarma sintética"
      tone="orange"
      >{#snippet icon()}<ShieldAlert size={18} />{/snippet}</StatCard
    ><StatCard
      label="Worker liveness"
      value="No disponible"
      detail="Sin instrumentación de procesos vivos"
      >{#snippet icon()}<CircleHelp size={18} />{/snippet}</StatCard
    ><StatCard
      label="Vigencia"
      value={data.freshness === "fresh"
        ? "Actual"
        : data.freshness === "stale"
          ? "Anterior"
          : "No disponible"}
      detail="Última observación disponible"
      >{#snippet icon()}<Clock3 size={18} />{/snippet}</StatCard
    >
  </div>
  {#if !data.blocked}{#key data.diagnostics?.observed_at}<InventorySummary
      />{/key}{/if}
  <section class="panel">
    <div class="panel-heading">
      <h2>Dependencias observadas</h2>
      <Badge
        value={data.freshness}
        label={data.freshness === "fresh"
          ? "Actual"
          : data.freshness === "stale"
            ? "Anterior"
            : "No disponible"}
      />
    </div>
    {#each Object.entries(data.diagnostics?.dependencies ?? {}) as [name, state]}<div
        class="service-row"
      >
        <strong>{name}</strong><Badge
          value={data.freshness === "fresh" ? state : "unknown"}
          label={state +
            (data.freshness === "fresh" ? "" : " · evidencia anterior")}
        />
      </div>{:else}<EmptyState
        title="Sin diagnóstico disponible"
        description="No se infiere conectividad a partir de datos ausentes."
      />{/each}
  </section>
  <section class="panel">
    <div class="panel-heading">
      <h2>Operaciones consultadas</h2>
      <a class="text-link" href="/operations?status=failed"
        >{data.operations.filter((o) => o.normalized_status === "failed")
          .length} fallidas en esta ventana</a
      >
      <span class="micro muted">Ventana reciente · hasta 50 registros</span>
    </div>
    <OperationsTable operations={data.operations} />
  </section>
{:else if section === "workers"}<div class="stat-grid">
    <StatCard
      label="Workers disponibles"
      value="No disponible"
      detail="Sin instrumentación de liveness"
    /><StatCard
      label="Heartbeat"
      value="No disponible"
      detail="Sin instrumentación; no se infiere desde eventos"
    /><StatCard
      label="Profundidad de colas"
      value={data.diagnostics?.queue_depth
        ? Object.entries(data.diagnostics.queue_depth)
            .map(([queue, depth]) => `${queue}: ${depth}`)
            .join(" · ")
        : "No disponible"}
      detail={data.diagnostics?.queue_depth
        ? "Evidencia publicada por IACP"
        : "IACP no publica profundidad de colas"}
    /><StatCard
      label="Edad activa más antigua"
      value={data.diagnostics
        ? `${data.diagnostics.oldest_active_age_seconds} s`
        : "No disponible"}
      detail="Desde admisión; no es latencia de cola"
    />
  </div>
  <div class="callout">
    <CircleHelp size={18} />
    <p>
      {data.diagnostics?.queue_depth
        ? "IACP publica profundidad de cola para esta evidencia; no acredita por sí sola liveness de workers."
        : "IACP no acredita procesos worker vivos ni publica profundidad de colas. No se infiere disponibilidad a partir de operaciones persistidas."}
    </p>
  </div>
{:else}
  {#if data.diagnostics && Object.values(data.diagnostics.dependencies).some((s) => !["ready", "ok", "up", "healthy"].includes(s.toLowerCase()))}<div
      class="callout warning"
    >
      Dependencias que requieren verificación: {Object.entries(
        data.diagnostics.dependencies,
      )
        .filter(
          ([, s]) =>
            !["ready", "ok", "up", "healthy"].includes(s.toLowerCase()),
        )
        .map(([name, state]) => `${name}: ${state}`)
        .join(" · ")}. Un estado desconocido no acredita una avería.
    </div>{/if}
  <section class="panel">
    <div class="panel-heading">
      <h2>Señales de la página consultada</h2>
      <span class="micro muted">Diagnóstico de evidencia consultada</span>
    </div>
    {#each signals as operation}<div class="live-signal">
        <div class="flex items-center justify-between">
          <h3>{operation.error_code ?? operation.kind}</h3>
          <Badge value={operation.normalized_status} />
        </div>
        <p>
          {diagnosis(operation).category}. {diagnosis(operation).next} Persistido:
          {operation.status} · Última evidencia: {formatTime(
            operation.updated_at,
          )}
        </p>
        <button
          class="text-link"
          onclick={() => selectedOperation.set(operation.operation_id)}
          >Consultar {operation.operation_id}<ArrowUpRight size={14} /></button
        ><a class="text-link" href="/events?operation={operation.operation_id}"
          >Eventos correlacionados <ArrowUpRight size={14} /></a
        >
      </div>{:else}<EmptyState
        title="Sin señales disponibles"
        description="La ventana consultada no certifica ausencia global de incidentes."
      />{/each}
  </section>{/if}
