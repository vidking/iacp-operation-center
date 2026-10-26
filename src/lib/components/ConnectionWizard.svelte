<script lang="ts">
  import type { ConnectionView } from "#lib/types/security.ts";
  import {
    checkLabels,
    connectionMessage,
  } from "#lib/types/connection-diagnostics.ts";
  import Badge from "#lib/components/ui/Badge.svelte";
  let {
    connection,
    busy,
    run,
  }: {
    connection: ConnectionView;
    busy: boolean;
    run: (action: "test" | "activate") => void;
  } = $props();
</script>

<section class="panel" aria-label="Asistente de conexión">
  <div class="panel-heading">
    <h2>Asistente · {connection.name}</h2>
    <Badge value={connection.status} />
  </div>
  <div class="wizard-body">
    <ol class="wizard-steps">
      <li>
        <strong>1 · Destino y reader</strong><span>{connection.endpoint}</span
        ><span
          >Tenant: {connection.tenantId} · {connection.serviceIdentity}</span
        ><span>{connectionMessage(connection.destinationCode)}</span>
      </li>
      <li>
        <strong>2 · Validar desde el backend</strong><span
          >Último intento: {connection.lastValidation ?? "Sin validar"}</span
        ><span>{connectionMessage(connection.lastCode)}</span><button
          class="button"
          disabled={busy || !connection.enabled}
          onclick={() => run("test")}
          >{busy ? "Procesando…" : "Test Connection"}</button
        >
      </li>
      <li>
        <strong>3 · Activación explícita</strong><span
          >{connection.active
            ? "Conexión seleccionada para LIVE."
            : connectionMessage(connection.activationCode)}</span
        ><button
          class="button primary"
          disabled={busy || connection.activationCode !== "OK"}
          onclick={() => run("activate")}>Activar LIVE</button
        >
      </li>
    </ol>
    {#if connection.status === "stale"}<div
        class="callout warning"
        role="status"
      >
        Validación stale: tiene más de cinco minutos. Vuelve a probar antes de
        activar. Una conexión LIVE puede conservar evidencia stale ante fallos;
        nunca cambia automáticamente a MOCK.
      </div>{/if}
    {#if connection.checks.length}
      <ul class="check-list" aria-label="Diagnóstico por endpoint">
        {#each connection.checks as check}
          <li>
            <strong>{checkLabels[check.id]}</strong><span
              >{check.status === "passed"
                ? "Correcto"
                : check.status === "failed"
                  ? "Falló"
                  : "No ejecutado"} · {check.code === "NO_OPERATIONS"
                ? "No hay operaciones para consultar un detalle; no bloquea la validación."
                : check.code === "PREVIOUS_CHECK_FAILED"
                  ? "Se detuvo tras un fallo anterior, sin reintentos."
                  : connectionMessage(check.code)}</span
            >
          </li>
        {/each}
      </ul>
    {:else}<p class="muted">
        Sin diagnóstico por endpoint para esta versión. Ejecuta Test Connection.
      </p>{/if}
    <p class="micro muted">
      Las pruebas solo leen IACP. Validar no activa LIVE. La etiqueta de
      identidad es informativa; los permisos reader se entregan y verifican en
      IACP. Actualiza el estado para recalcular stale.
    </p>
  </div>
</section>

<style>
  .wizard-body {
    padding: 20px;
  }
  .wizard-steps {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;
    padding: 0;
    list-style: none;
  }
  .wizard-steps li,
  .check-list li {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .wizard-steps span,
  .check-list span {
    color: var(--text-muted, #9ca9bd);
    font-size: 12px;
    line-height: 1.6;
  }
  .check-list {
    display: grid;
    gap: 16px;
    list-style: none;
    padding: 20px 0;
  }
  @media (max-width: 800px) {
    .wizard-steps {
      grid-template-columns: 1fr;
    }
  }
</style>
