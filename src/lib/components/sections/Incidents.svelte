<script lang="ts">
  import {
    CircleAlert,
    ShieldCheck,
    BrainCircuit,
    ArrowUpRight,
    Fingerprint,
    FileSearch,
    BookOpen,
    MessageSquareText,
    Sparkles,
    Clock3,
  } from "@lucide/svelte";
  import { incidents } from "#lib/mocks/experience.ts";
  import Badge from "../ui/Badge.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import { selectedOperation } from "#lib/stores/portal.ts";
  let tab = $state("open");
  let severity = $state("all");
  let chosen = $state(incidents[0].id);
  let assistant = $state(false);
  let filtered = $derived(
    incidents.filter(
      (i) => i.state === tab && (severity === "all" || i.severity === severity),
    ),
  );
  let current = $derived(filtered.find((i) => i.id === chosen) ?? filtered[0]);
</script>

<div class="incident-banner">
  <div class="icon-tile amber"><ShieldCheck size={21} /></div>
  <div>
    <strong>Diagnosticar con evidencia. Actuar con control.</strong>
    <p>
      Centro visual de diagnóstico DEMO. Las recuperaciones pertenecen
      exclusivamente a IACP.
    </p>
  </div>
  <span class="demo-tag">SOLO OBSERVACIÓN</span>
</div>
<div class="section-line">
  <div class="filter-tabs inline">
    <button class:chosen={tab === "open"} onclick={() => (tab = "open")}
      >Abiertos <span>2</span></button
    ><button
      class:chosen={tab === "resolved"}
      onclick={() => (tab = "resolved")}>Historial <span>1</span></button
    >
  </div>
  <select aria-label="Filtrar severidad" bind:value={severity}
    ><option value="all">Todas las severidades</option><option value="high"
      >Alta</option
    ><option value="medium">Media</option><option value="low">Baja</option
    ></select
  >
</div>
<div class="incident-layout">
  <section class="panel incident-list" aria-label="Lista de incidentes">
    {#each filtered as incident}<button
        class:selected={current?.id === incident.id}
        onclick={() => {
          chosen = incident.id;
          assistant = false;
        }}
        ><div class="flex items-center justify-between">
          <span class="severity {incident.severity}"
            >{incident.severity === "high"
              ? "ALTA"
              : incident.severity === "medium"
                ? "MEDIA"
                : "BAJA"} · DEMO</span
          ><time>{incident.time}</time>
        </div>
        <h3>{incident.title}</h3>
        <div class="flex items-center justify-between">
          <span class="mono">{incident.id}</span><span class="incident-arrow"
            >↗</span
          >
        </div></button
      >{:else}<EmptyState onreset={() => (severity = "all")} />{/each}
  </section>
  <section class="panel incident-detail">
    {#if current}<div class="panel-heading">
        <div>
          <span class="eyebrow">{current.id} · EVIDENCIA DEMO</span>
          <h2>{current.title}</h2>
        </div>
        <Badge
          value={current.state === "open" ? "uncertain" : "completed"}
          label={current.state === "open" ? "En revisión" : "Resuelto · DEMO"}
        />
      </div>
      <div class="incident-body">
        <div class="detail-line">
          <Fingerprint size={16} /><span>Operación afectada</span><button
            class="operation-link mono"
            onclick={() => selectedOperation.set(current.operationId)}
            >{current.operationId}<ArrowUpRight size={13} /></button
          >
        </div>
        <h3 class="section-subtitle">
          <FileSearch size={16} /> Diagnóstico orientativo
        </h3>
        <p>{current.description}</p>
        <h3 class="section-subtitle">
          <BookOpen size={16} /> Recomendación de revisión
        </h3>
        <div class="recommendation">
          <span>01</span>
          <p>{current.recommendation}</p>
        </div>
        <h3 class="section-subtitle">
          <Clock3 size={16} /> Evidencia disponible
        </h3>
        <div class="evidence-chips">
          <button onclick={() => selectedOperation.set(current.operationId)}
            >Estado de operación <ArrowUpRight size={13} /></button
          ><a href="/events?operation={current.operationId}"
            >Eventos correlacionados <ArrowUpRight size={13} /></a
          >
        </div>
        <div class="assistant-box">
          <div class="flex items-start gap-3">
            <span class="icon-tile violet"><BrainCircuit size={23} /></span>
            <div>
              <h3>Asistente de diagnóstico</h3>
              <p>Vista conceptual · sin modelo conectado</p>
            </div>
            <span class="demo-tag">CONCEPTO</span>
          </div>
          <p>
            Una futura asistencia podrá organizar evidencias y explicar señales.
            Esta vista muestra una respuesta editorial fija.
          </p>
          <button class="button" onclick={() => (assistant = !assistant)}
            ><Sparkles size={14} />{assistant
              ? "Ocultar ejemplo"
              : "Ver ejemplo de análisis"}</button
          >{#if assistant}<div class="assistant-response" role="status">
              <MessageSquareText size={17} />
              <div>
                <strong>Ejemplo estático para {current.id}</strong>
                <p>
                  La evidencia disponible no acredita una causa raíz. {current.recommendation}
                </p>
                <small
                  >No se ejecutó ninguna acción ni se consultó un servicio de
                  IA.</small
                >
              </div>
            </div>{/if}
        </div>
      </div>{:else}<EmptyState />{/if}
  </section>
</div>
