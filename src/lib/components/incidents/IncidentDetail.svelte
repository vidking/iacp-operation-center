<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { invalidateAll } from "$app/navigation";
  import { selectedOperation } from "#lib/stores/portal.ts";
  import { scheduleReads } from "#lib/refresh.ts";
  import { formatTime, utcTime } from "#lib/time.ts";
  import { freshness } from "#lib/types/observation.ts";
  import { incidentLabels } from "#lib/types/incidents.ts";
  import type { IncidentDetail } from "#lib/server/incidents/service.ts";
  import Badge from "../ui/Badge.svelte";
  let { id, onclose }: { id: string; onclose: () => void } = $props();
  let detail = $state<IncidentDetail | null>(null),
    error = $state(""),
    loading = $state(false),
    busy = $state(false),
    confirmation = $state(""),
    message = $state(""),
    key = $state(""),
    admissionId = $state(""),
    revoked = $state(false);
  let dialog = $state<HTMLDialogElement>();
  $effect(() => {
    if (dialog && !dialog.open) dialog.showModal();
  });
  let generation = 0;
  async function refresh() {
    if (loading || busy || revoked) return false;
    const current = ++generation;
    loading = true;
    error = "";
    try {
      const r = await fetch(
        "/api/incidents/" + encodeURIComponent(admissionId || id),
      );
      const v = await r.json();
      if (!r.ok) throw new Error(v.error ?? "REQUEST_FAILED");
      if (current === generation) detail = v;
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : "REQUEST_FAILED";
      if (
        [
          "UPSTREAM_UNAUTHORIZED",
          "UPSTREAM_FORBIDDEN",
          "UPSTREAM_TENANT_MISMATCH",
          "AUTHENTICATION_REQUIRED",
          "CONNECTION_CHANGED",
        ].includes(error)
      ) {
        detail = null;
        revoked = true;
        void invalidateAll();
      }
      return false;
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    void refresh();
    const stop = scheduleReads({
      key: "incident-detail:" + id,
      enabled: () => !busy && !revoked,
      interval: () =>
        detail &&
        ["queued", "running", "uncertain"].includes(
          detail.operation.normalized_status,
        )
          ? 4000
          : 30000,
      read: refresh,
    });
    return () => {
      generation++;
      stop();
    };
  });
  async function reconcile() {
    if (
      busy ||
      error ||
      !detail?.recovery.allowed ||
      confirmation !== detail.instance?.instance_id
    )
      return;
    busy = true;
    message = "Enviando solicitud de observación a IACP…";
    key ||= crypto.randomUUID();
    try {
      const r = await fetch("/api/incidents/" + id + "/reconcile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": page.data.csrf,
        },
        body: JSON.stringify({
          key,
          confirmInstanceId: confirmation,
          expectedOperationUpdatedAt: detail.operation.updated_at,
          expectedInstanceUpdatedAt: detail.instance.updated_at,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error ?? "REQUEST_FAILED");
      message =
        v.admission === "accepted"
          ? `Solicitud aceptada; operación ${v.operation_id}. Pendiente de resultado efectivo.`
          : `Solicitud ${v.status}: ${v.error ?? "Sin evidencia"}. Intención ${key}; no reenviar.`;
      if (v.operation_id) admissionId = v.operation_id;
      confirmation = "";
    } catch (e) {
      error = e instanceof Error ? e.message : "REQUEST_FAILED";
      message = `Intención ${key}. Una respuesta perdida no autoriza repetir la solicitud.`;
    } finally {
      busy = false;
      await refresh();
    }
  }
</script>

<dialog
  bind:this={dialog}
  class="detail-dialog"
  aria-labelledby="incident-title"
  {onclose}
>
  <div class="drawer-heading">
    <div>
      <span class="eyebrow">INCIDENTS & RECOVERY · EVIDENCIA IACP</span>
      <h2 id="incident-title">Diagnóstico de incidente</h2>
    </div>
    <button class="icon-button" aria-label="Cerrar incidente" onclick={onclose}
      >×</button
    >
  </div>
  <div class="drawer-body">
    <button
      class="button"
      disabled={loading || busy || revoked}
      onclick={refresh}
      >{loading ? "Consultando…" : "Actualizar diagnóstico/estado"}</button
    >
    {#if error}<div class="callout warning" role="alert">
        {error}. Evidencia anterior no habilita acciones.
      </div>{/if}
    {#if message}<div class="callout" role="status">{message}</div>{/if}
    {#if detail}
      <div class="detail-hero">
        <h3>{detail.operation.kind}</h3>
        <Badge value={detail.operation.normalized_status} />
        <p>
          {detail.state
            ? incidentLabels[detail.state]
            : "Seguimiento de operación"} · gravedad {detail.severity}
        </p>
        <p>
          Consulta: {formatTime(detail.observedAt)} · {error
            ? "stale"
            : freshness(detail.observedAt)}
        </p>
      </div>
      <h3>Qué pasó</h3>
      <p><strong>Confirmado por IACP:</strong> {detail.diagnosis.confirmed}</p>
      <p>{detail.diagnosis.hypothesis}</p>
      <p>
        Fase: {detail.operation.power?.phase ??
          detail.operation.fulfillment?.phase ??
          "Sin evidencia"}. Código original: {detail.operation.error_code ??
          "Sin evidencia"}.
      </p>
      <h3>Estado efectivo de la instancia</h3>
      <dl class="detail-grid">
        <div>
          <dt>Operación persistida / normalizada</dt>
          <dd>
            {detail.operation.status} / {detail.operation.normalized_status}
          </dd>
        </div>
        <div>
          <dt>Instancia actual (separada del fallo histórico)</dt>
          <dd>
            {detail.instance?.status ?? "Sin evidencia"}
            {detail.instanceError ?? ""}
          </dd>
        </div>
        <div>
          <dt>VMID / nodo</dt>
          <dd>
            {detail.instance?.vmid ?? "Sin evidencia"} / {detail.instance
              ?.node ?? "Sin evidencia"}
          </dd>
        </div>
        <div>
          <dt>Energía observada</dt>
          <dd>
            {detail.power?.power_state ?? "Sin evidencia"} · {formatTime(
              detail.power?.observed_at,
            )}
            {detail.powerError ?? ""}
          </dd>
        </div>
        <div>
          <dt>Guest Agent / worker / cola</dt>
          <dd>No instrumentado</dd>
        </div>
        <div>
          <dt>Guest readiness</dt>
          <dd>
            {detail.instance?.access?.status === "completed"
              ? "Acceso verificado por IACP en su evidencia registrada; no garantiza readiness actual"
              : "Sin evidencia actual"} · {formatTime(
              detail.instance?.access?.observed_at,
            )}
          </dd>
        </div>
      </dl>
      <h3>Identificadores y correlación</h3>
      <p class="mono">
        Operación {detail.operation.operation_id}<br />Instancia {detail
          .operation.instance_id}
      </p>
      <p>
        Correlation ID: {[
          ...new Set(detail.events.map((e) => e.correlation_id)),
        ].join(", ") || "Sin evidencia en la ventana"}
      </p>
      <button
        class="button"
        onclick={async () => {
          try {
            await navigator.clipboard.writeText(
              JSON.stringify({
                operation_id: detail!.operation.operation_id,
                instance_id: detail!.operation.instance_id,
                correlation_ids: [
                  ...new Set(detail!.events.map((e) => e.correlation_id)),
                ],
              }),
            );
            message = "IDs copiados";
          } catch {
            message = "No fue posible copiar IDs";
          }
        }}>Copiar IDs</button
      >
      <h3>Línea temporal y evidencias</h3>
      <p class="micro muted">{detail.eventScope}</p>
      <ol class="operation-timeline">
        <li>
          <strong>Registro de solicitud</strong><small
            title={utcTime(detail.operation.created_at)}
            >{formatTime(detail.operation.created_at)} · {utcTime(
              detail.operation.created_at,
            )}</small
          >
        </li>
        {#each detail.operation.events ?? [] as event}<li>
            <strong>{event.code}</strong>
            <p>{event.status} · {event.actor}</p>
            <small title={utcTime(event.created_at)}
              >{formatTime(event.created_at)}</small
            >
          </li>{/each}
        {#each detail.events as event}<li>
            <strong>{event.code}</strong>
            <p>{event.service} · {event.actor} · {event.correlation_id}</p>
            <small title={utcTime(event.occurred_at)}
              >{formatTime(event.occurred_at)}</small
            ><a
              class="text-link"
              href={`/events?operation=${event.operation_id}`}
              onclick={onclose}>Ver evento {event.event_id}</a
            >
          </li>{/each}
      </ol>
      <p>
        Última evidencia de operación: <span
          title={utcTime(detail.operation.updated_at)}
          >{formatTime(detail.operation.updated_at)}</span
        >. No se infieren etapas, tareas Proxmox ni workers sin evidencia
        publicada.
      </p>
      <h3>Diagnóstico y siguiente paso</h3>
      <p>{detail.diagnosis.next}</p>
      <h3>Recuperación autorizada</h3>
      <p>{detail.recovery.reason}</p>
      {#if detail.recovery.allowed && detail.instance}<p>
          Reconciliar observa {detail.instance.name} ({detail.instance
            .instance_id}). No vuelve a crear la VM ni repite reboot.
        </p>
        <label
          >Confirma UUID de instancia<input bind:value={confirmation} /></label
        ><button
          class="button primary"
          disabled={busy ||
            loading ||
            !!error ||
            !!key ||
            freshness(detail.observedAt) !== "fresh" ||
            confirmation !== detail.instance.instance_id}
          onclick={reconcile}>Solicitar reconciliación</button
        >{/if}
      <div class="heading-actions">
        <button
          class="button"
          onclick={() => {
            const operation = detail!.operation.operation_id;
            onclose();
            selectedOperation.set(operation);
          }}>Consultar operación</button
        ><a
          class="button"
          href={`/crm?instance=${detail.operation.instance_id}`}
          onclick={onclose}>Ver instancia CRM</a
        ><a
          class="button"
          href={`/events?operation=${detail.operation.operation_id}`}
          onclick={onclose}>Ver eventos</a
        ><a
          class="button"
          href={`/api/reports/operations/${detail.operation.operation_id}`}
          >Exportar evidencia JSON</a
        >
      </div>
    {:else if !error}<p role="status">Consultando evidencia autorizada…</p>{/if}
  </div>
</dialog>
