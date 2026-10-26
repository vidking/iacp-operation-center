<script lang="ts">
  import { diagnosis, evidenceSeconds } from "#lib/diagnostics.ts";
  import { formatTime, utcTime } from "#lib/time.ts";
  import {
    X,
    Fingerprint,
    Clock3,
    ArrowUpRight,
    CircleCheck,
    CircleDot,
    FileText,
  } from "@lucide/svelte";
  import { invalidateAll } from "$app/navigation";
  import { connectionMessage } from "#lib/types/connection-diagnostics.ts";
  import { operationSchema } from "#lib/types/observation.ts";
  import Badge from "../ui/Badge.svelte";
  import type { Operation, AuditEvent } from "#lib/types/observation.ts";
  let {
    operation,
    operationId = null,
    events,
    onclose,
  }: {
    operation: Operation | null;
    operationId?: string | null;
    events: AuditEvent[];
    onclose: () => void;
  } = $props();
  let requestedId = $derived(operationId ?? operation?.operation_id ?? null);
  let detail = $state<Operation | null>(null);
  let detailCode = $state("");
  let display = $derived(detail);
  $effect(() => {
    const id = requestedId;
    const controller = new AbortController();
    detail = null;
    detailCode = "";
    let timer: ReturnType<typeof setTimeout>;
    let delay = 1000;
    const started = Date.now();
    async function poll() {
      if (!id || controller.signal.aborted) return;
      try {
        const res = await fetch(
          "/api/observations/operations/" + encodeURIComponent(id),
          { signal: controller.signal },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "REQUEST_FAILED");
        const projected = operationSchema.parse(json);
        if (controller.signal.aborted) return;
        detail = projected;
        detailCode = "";
        const ongoing =
          ["queued", "running", "uncertain"].includes(
            projected.normalized_status,
          ) ||
          (!!projected.fulfillment &&
            ["queued", "running", "uncertain"].includes(
              projected.fulfillment.status,
            ));
        if (ongoing && Date.now() - started < 900000) {
          timer = setTimeout(poll, 4000);
          delay = 1000;
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        detail = null;
        detailCode = e instanceof Error ? e.message : "REQUEST_FAILED";
        if (
          [
            "UPSTREAM_UNAUTHORIZED",
            "UPSTREAM_FORBIDDEN",
            "UPSTREAM_TENANT_MISMATCH",
          ].includes(detailCode)
        ) {
          onclose();
          void invalidateAll();
        } else if (Date.now() - started < 900000) {
          timer = setTimeout(poll, Math.max(15000, delay));
          delay = Math.min(60000, delay * 2);
        }
      }
    }
    void poll();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  });
  let dialog = $state<HTMLDialogElement>();
  let history = $derived(events.filter((e) => e.operation_id === requestedId));
  $effect(() => {
    if (requestedId && dialog && !dialog.open) dialog.showModal();
    else if (!requestedId && dialog?.open) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  class="detail-dialog"
  aria-labelledby="detail-title"
  {onclose}
>
  {#if requestedId}<div class="drawer-heading">
      <div class="flex items-center gap-3">
        <span class="icon-tile orange"><Fingerprint size={20} /></span>
        <div>
          <span class="eyebrow">DETALLE DE OPERACIÓN · IACP</span>
          <h2 id="detail-title">{requestedId}</h2>
        </div>
      </div>
      <button class="icon-button" aria-label="Cerrar detalle" onclick={onclose}
        ><X size={20} /></button
      >
    </div>
    {#if !display}<div class="drawer-body" role="status">
        {detailCode
          ? connectionMessage(detailCode)
          : "Consultando detalle autorizado…"}
      </div>{:else}
      <div class="drawer-body">
        <div class="detail-hero">
          <span>{display.kind}</span><Badge value={display.normalized_status} />
          <p>Una intención técnica, una identidad estable.</p>
        </div>
        <div class="callout">
          <div>
            <strong>{diagnosis(display).category}</strong>
            <p>{diagnosis(display).next}</p>
            <p>
              Código IACP: {display.error_code ?? "sin error publicado"}. Worker
              asignado: no publicado. Intervalo observado: {evidenceSeconds(
                display.created_at,
                display.updated_at,
              ) ?? "desconocido"} s.
            </p>
            <p>
              Correlación: {history
                .map((e) => e.correlation_id)
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(", ") || "no publicada en la ventana"}
            </p>
            <a
              class="button"
              href={`/api/reports/operations/${display.operation_id}`}
              >Exportar reporte JSON</a
            >
          </div>
        </div>
        <dl class="detail-grid">
          <div>
            <dt>Estado persistido</dt>
            <dd><Badge value={display.status} /></dd>
          </div>
          <div>
            <dt>normalized_status</dt>
            <dd><Badge value={display.normalized_status} /></dd>
          </div>
          <div>
            <dt>Instancia</dt>
            <dd class="mono">
              <a class="text-link" href={`/crm?instance=${display.instance_id}`}
                >{display.instance_id}</a
              >
            </dd>
          </div>
          <div>
            <dt>Solicitado por</dt>
            <dd>{display.requested_by}</dd>
          </div>
          <div>
            <dt>Creación · CST</dt>
            <dd title={utcTime(display.created_at)}>
              {formatTime(display.created_at)}<small
                >{utcTime(display.created_at)}</small
              >
            </dd>
          </div>
          <div>
            <dt>Última evidencia · CST</dt>
            <dd title={utcTime(display.updated_at)}>
              {formatTime(display.updated_at)}
            </dd>
          </div>
        </dl>
        {#if display.power || display.fulfillment || display.initialization}<div
            class="callout"
          >
            <div>
              <p>
                Provisión y energía son operaciones separadas. Guest readiness:
                desconocido salvo evidencia específica de acceso.
              </p>
              {#if display.power}<p>
                  Energía observada: {display.power.power_state ??
                    "desconocida"} · fase {display.power.phase} · {display.power
                    .status}
                </p>{/if}
              {#if display.fulfillment}<p>
                  Entrega: {display.fulfillment.status} · fase {display
                    .fulfillment.phase}
                </p>{/if}
              {#if display.initialization}<p>
                  Inicialización: {display.initialization.status} · {display
                    .initialization.mode}
                </p>{/if}
            </div>
          </div>{/if}
        {#if display.status !== display.normalized_status}<div
            class="callout warning"
          >
            <CircleDot size={18} />
            <p>
              El estado persistido conserva el resultado registrado. El estado
              normalizado refleja la interpretación actual de IACP; consulta su
              evidencia.
            </p>
          </div>{/if}
        <h3 class="section-subtitle">
          <Clock3 size={16} /> Timeline de ejecución
        </h3>
        <ol class="operation-timeline">
          <li>
            <span class="timeline-dot"><CircleCheck size={14} /></span><strong
              >Intención registrada</strong
            ><small>{formatTime(display.created_at)} · fecha registrada</small>
          </li>
          {#each history as event}<li>
              <span class="timeline-dot"><CircleDot size={14} /></span><strong
                >{event.code}</strong
              >
              <p>{event.service} · {event.actor}</p>
              <small>{formatTime(event.occurred_at)}</small>
            </li>{/each}
          {#each display.events ?? [] as event}<li>
              <span class="timeline-dot"></span><strong>{event.code}</strong>
              <p>{event.status} · {event.actor}</p>
              <small title={utcTime(event.created_at)}
                >{formatTime(event.created_at)} · historial de operación</small
              >
            </li>{/each}
        </ol>
        <a
          class="button"
          href={`/incidents?operation=${display.operation_id}`}
          onclick={onclose}>Diagnóstico en Incidents & Recovery</a
        >
        <h3 class="section-subtitle">
          <FileText size={16} /> Resultado y evidencia
        </h3>
        <div class="code-panel">
          <span class="code-label">PROYECCIÓN DE LECTURA</span>
          <pre>{JSON.stringify(
              {
                operation_id: display.operation_id,
                status: display.status,
                normalized_status: display.normalized_status,
                error_code: display.error_code,
                result:
                  display.normalized_status === "completed"
                    ? "Estado completado; readiness de aplicación no acreditado."
                    : null,
              },
              null,
              2,
            )}</pre>
        </div>
        <a
          class="button w-full"
          href="/events?operation={display.operation_id}"
          onclick={onclose}>Explorar correlación <ArrowUpRight size={15} /></a
        >
        <p class="micro muted">
          Esta vista no ejecuta, reintenta ni recupera operaciones.
        </p>
      </div>{/if}{/if}
</dialog>
