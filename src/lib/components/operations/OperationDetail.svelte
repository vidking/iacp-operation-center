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
  import Badge from "../ui/Badge.svelte";
  import type { Operation, AuditEvent } from "#lib/types/observation.ts";
  let {
    operation,
    events,
    onclose,
  }: {
    operation: Operation | null;
    events: AuditEvent[];
    onclose: () => void;
  } = $props();
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
          <span class="eyebrow">DETALLE DE OPERACIÓN · DEMO</span>
          <h2 id="detail-title">{operation.operation_id}</h2>
        </div>
      </div>
      <button class="icon-button" aria-label="Cerrar detalle" onclick={onclose}
        ><X size={20} /></button
      >
    </div>
    <div class="drawer-body">
      <div class="detail-hero">
        <span>{operation.kind}</span><Badge
          value={operation.normalized_status}
        />
        <p>Una intención técnica, una identidad estable.</p>
      </div>
      <dl class="detail-grid">
        <div>
          <dt>Estado persistido</dt>
          <dd><Badge value={operation.status} /></dd>
        </div>
        <div>
          <dt>normalized_status</dt>
          <dd><Badge value={operation.normalized_status} /></dd>
        </div>
        <div>
          <dt>Instancia</dt>
          <dd class="mono">{operation.instance_id}</dd>
        </div>
        <div>
          <dt>Solicitado por</dt>
          <dd>{operation.requested_by}</dd>
        </div>
        <div>
          <dt>Creación · UTC</dt>
          <dd>{operation.created_at}</dd>
        </div>
        <div>
          <dt>Última evidencia · UTC</dt>
          <dd>{operation.updated_at}</dd>
        </div>
      </dl>
      {#if operation.status !== operation.normalized_status}<div
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
          ><small>{operation.created_at} · muestra local</small>
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
        <span class="code-label">PROYECCIÓN DEMO</span>
        <pre>{JSON.stringify(
            {
              operation_id: operation.operation_id,
              status: operation.status,
              normalized_status: operation.normalized_status,
              error_code: operation.error_code,
              result:
                operation.normalized_status === "completed"
                  ? "Finalización de ejemplo; readiness de aplicación no acreditado."
                  : null,
            },
            null,
            2,
          )}</pre>
      </div>
      <a
        class="button w-full"
        href="/events?operation={operation.operation_id}"
        onclick={onclose}>Explorar correlación <ArrowUpRight size={15} /></a
      >
      <p class="micro muted">
        Esta vista no ejecuta, reintenta ni recupera operaciones.
      </p>
    </div>{/if}
</dialog>
