<script lang="ts">
  import {
    X,
    Fingerprint,
    Clock3,
    ArrowUpRight,
    CircleCheck,
    CircleDot,
    FileText,
  } from "@lucide/svelte";
  import { connectionMessage } from "#lib/types/connection-diagnostics.ts";
  import { operationSchema } from "#lib/types/observation.ts";
  import Badge from "../ui/Badge.svelte";
  import type { Operation, AuditEvent } from "#lib/types/observation.ts";
  let {
    demo = true,
    operation,
    events,
    onclose,
  }: {
    demo?: boolean;
    operation: Operation | null;
    events: AuditEvent[];
    onclose: () => void;
  } = $props();
  let detail = $state<Operation | null>(null);
  let detailCode = $state("");
  let display = $derived(demo ? operation : detail);
  $effect(() => {
    const id = operation?.operation_id;
    const controller = new AbortController();
    detail = null;
    detailCode = "";
    if (id && !demo) {
      fetch("/api/observations/operations/" + encodeURIComponent(id), {
        signal: controller.signal,
      })
        .then(async (res) => {
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "REQUEST_FAILED");
          const projected = operationSchema.parse(json);
          if (!controller.signal.aborted) detail = projected;
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            detailCode = e instanceof Error ? e.message : "REQUEST_FAILED";
        });
    }
    return () => controller.abort();
  });
  let dialog = $state<HTMLDialogElement>();
  let history = $derived(
    events.filter((e) => e.operation_id === operation?.operation_id),
  );
  $effect(() => {
    if (operation && dialog && !dialog.open) dialog.showModal();
    else if (!operation && dialog?.open) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  class="detail-dialog"
  aria-labelledby="detail-title"
  {onclose}
>
  {#if operation}<div class="drawer-heading">
      <div class="flex items-center gap-3">
        <span class="icon-tile orange"><Fingerprint size={20} /></span>
        <div>
          <span class="eyebrow"
            >DETALLE DE OPERACIÓN · {demo ? "DEMO" : "LIVE"}</span
          >
          <h2 id="detail-title">{operation.operation_id}</h2>
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
            <dd class="mono">{display.instance_id}</dd>
          </div>
          <div>
            <dt>Solicitado por</dt>
            <dd>{display.requested_by}</dd>
          </div>
          <div>
            <dt>Creación · UTC</dt>
            <dd>{display.created_at}</dd>
          </div>
          <div>
            <dt>Última evidencia · UTC</dt>
            <dd>{display.updated_at}</dd>
          </div>
        </dl>
        {#if display.status !== display.normalized_status}<div
            class="callout warning"
          >
            <CircleDot size={18} />
            <p>
              El estado normalizado refleja incertidumbre aunque el registro
              persistido indique failed. La evidencia requiere revisión.
            </p>
          </div>{/if}
        <h3 class="section-subtitle">
          <Clock3 size={16} /> Timeline de ejecución
        </h3>
        <ol class="operation-timeline">
          <li>
            <span class="timeline-dot"><CircleCheck size={14} /></span><strong
              >Intención registrada</strong
            ><small
              >{display.created_at} · {demo
                ? "muestra local"
                : "fecha registrada"}</small
            >
          </li>
          {#each history as event}<li>
              <span class="timeline-dot"><CircleDot size={14} /></span><strong
                >{event.code}</strong
              >
              <p>{event.service} · {event.actor}</p>
              <small>{event.occurred_at}</small>
            </li>{/each}
        </ol>
        <h3 class="section-subtitle">
          <FileText size={16} /> Resultado y evidencia
        </h3>
        <div class="code-panel">
          <span class="code-label"
            >PROYECCIÓN {demo ? "DEMO" : "DE LECTURA"}</span
          >
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
