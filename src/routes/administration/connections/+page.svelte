<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { Plug, RefreshCw, ShieldCheck, KeyRound } from "@lucide/svelte";
  import AdvancedConnections from "#lib/components/AdvancedConnections.svelte";
  import { connectionMessage } from "#lib/types/connection-diagnostics.ts";
  let { data } = $props();
  let connection = $derived(
    data.connections.find(
      (c) => c.endpoint === "https://iac.cyberfuel.com" && c.active,
    ) ??
      data.connections.find((c) => c.endpoint === "https://iac.cyberfuel.com"),
  );
  let busy = $state(false),
    accessForm = $state(false),
    advanced = $state(false);
  let credential = $state(""),
    message = $state(""),
    error = $state("");
  let verified = $derived(
    connection?.status === "valid" && connection.activationCode === "OK",
  );
  let connectionState = $derived(
    connection?.active && data.liveEnabled && connection.status === "valid"
      ? "Conectado"
      : connection
        ? "Requiere atención"
        : "Desconectado",
  );
  async function send(path: string, body: unknown) {
    busy = true;
    message = "";
    error = "";
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": data.csrf,
        },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "REQUEST_FAILED");
      await invalidateAll();
      if (result.connection?.lastCode && result.connection.lastCode !== "OK")
        error = connectionMessage(result.connection.lastCode);
      else
        message = result.connection?.active
          ? "IACP conectado. El centro de operaciones utilizará datos reales."
          : result.connection
            ? "Acceso y contratos verificados. Confirma la conexión para activar LIVE."
            : "MOCK activado. La conexión queda guardada.";
    } catch (e) {
      error = connectionMessage(
        e instanceof Error ? e.message : "REQUEST_FAILED",
      );
    } finally {
      credential = "";
      busy = false;
    }
  }
  async function connect() {
    if (connection?.enabled)
      return send("/api/admin/connections/" + connection.id, {
        action: "test",
      });
    if (data.credentialProvisioned)
      return send("/api/admin/setup", {
        ...(connection ? { connectionId: connection.id } : {}),
      });
    accessForm = true;
  }
  async function register(event: SubmitEvent) {
    event.preventDefault();
    await send("/api/admin/setup", {
      credential,
      ...(connection ? { connectionId: connection.id } : {}),
    });
    accessForm = false;
  }
</script>

<svelte:head><title>Conectar IACP · IaCoC</title></svelte:head>
<div class="page-heading">
  <div>
    <div class="eyebrow">ADMINISTRATION</div>
    <h1>API Connections</h1>
    <p>Conecta el Control Plane una vez. Observa su actividad desde IaCoC.</p>
  </div>
</div>
<section class="panel" aria-label="Conexión IACP">
  <div class="panel-heading">
    <h2>IACP Cyberfuel</h2>
    <strong>{connectionState}</strong>
  </div>
  <div class="setup-body">
    <p class="mono">https://iac.cyberfuel.com</p>
    <dl class="setup-facts">
      <div>
        <dt>Modo operativo</dt>
        <dd>{data.currentMode}</dd>
      </div>
      <div>
        <dt>Última sincronización</dt>
        <dd>{connection?.lastSync ?? "Sin sincronizar"}</dd>
      </div>
      <div>
        <dt>Última validación</dt>
        <dd>{connection?.lastValidation ?? "Pendiente"}</dd>
      </div>
    </dl>
    <div class="callout">
      <ShieldCheck size={18} />
      <p>
        El acceso de servicio está separado de tu cuenta local. IaCoC verifica
        automáticamente su alcance y lo mantiene aislado para este espacio.
      </p>
    </div>
    {#if !data.liveEnabled}<div class="callout warning">
        {connectionMessage("LIVE_DISABLED")}
      </div>{/if}
    {#if connection?.lastCode && connection.lastCode !== "OK"}<div
        class="callout warning"
      >
        {connectionMessage(connection.lastCode)}
      </div>{/if}
    {#if connection?.status === "stale"}<div class="callout warning">
        La validación ha caducado. Pulsa Probar conexión antes de activar LIVE.
      </div>{/if}
    {#if connection?.associationState === "unverified"}<p>
        Este acceso anterior necesita una nueva prueba. No se cambiarán
        usuarios, sesiones ni credenciales guardadas.
      </p>{/if}
    <div class="setup-actions">
      <button class="button primary" disabled={busy} onclick={connect}
        ><Plug size={16} />{busy ? "Verificando…" : "Conectar IACP"}</button
      >
      <button
        class="button"
        disabled={busy || !connection?.enabled}
        onclick={() =>
          send("/api/admin/connections/" + connection!.id, { action: "test" })}
        ><RefreshCw size={15} />Probar conexión</button
      >
      {#if data.currentMode === "LIVE"}<button
          class="button"
          disabled={busy}
          onclick={() => send("/api/admin/mode", { mode: "MOCK" })}
          >Volver a MOCK</button
        >{/if}
      <button
        class="button"
        disabled={busy}
        onclick={() => {
          accessForm = !accessForm;
          credential = "";
        }}
        ><KeyRound size={15} />{connection
          ? "Administrar acceso"
          : "Configurar acceso inicial"}</button
      >
    </div>
    {#if verified && !connection?.active}<section
        class="callout"
        aria-label="Confirmar asociación"
      >
        <div>
          <strong>Acceso de lectura verificado</strong>
          <p>
            La identidad de servicio determina qué información se puede
            observar. Al confirmar, autorizas ese alcance para este espacio. Tu
            cuenta local no cambia.
          </p>
          <button
            class="button primary"
            disabled={busy}
            onclick={() =>
              send("/api/admin/connections/" + connection!.id, {
                action: "activate",
              })}>Confirmar conexión y activar LIVE</button
          >
        </div>
      </section>{/if}
    {#if accessForm}<form class="form-body" onsubmit={register}>
        <h3>
          {connection
            ? "Reemplazar acceso de servicio"
            : "Autorizar acceso inicial"}
        </h3>
        <p>
          Si el operador ya provisionó el acceso, no necesitas introducir una
          clave. El contrato actual de IACP requiere una identidad de lectura
          registrada; IaCoC no puede crearla ni recuperarla.
        </p>
        {#if data.credentialProvisioned}<button
            class="button"
            type="button"
            disabled={busy}
            onclick={() =>
              send("/api/admin/setup", {
                ...(connection ? { connectionId: connection.id } : {}),
              })}>Usar acceso provisionado</button
          >{/if}
        <label
          >Clave de conexión<input
            required
            type="password"
            autocomplete="new-password"
            minlength="32"
            maxlength="4096"
            bind:value={credential}
          /><small
            >Se solicita solo para esta autorización o rotación. Se guarda
            cifrada y no vuelve a mostrarse.</small
          ></label
        >
        <button class="button primary" disabled={busy} type="submit"
          >Guardar y verificar acceso</button
        >
      </form>{/if}
    {#if message}<div class="callout" role="status">{message}</div>{/if}
    {#if error}<div class="callout warning" role="alert">{error}</div>{/if}
  </div>
</section>
<details bind:open={advanced}>
  <summary
    >Administración avanzada · diagnóstico, historial y otros destinos</summary
  >
  {#if advanced}<AdvancedConnections {data} />{/if}
</details>

<style>
  .setup-body {
    padding: 24px;
    display: grid;
    gap: 20px;
  }
  .setup-facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;
  }
  dt {
    color: #9ca9bd;
    font-size: 12px;
  }
  dd {
    margin: 8px 0 0;
    overflow-wrap: anywhere;
    font-size: 13px;
  }
  .setup-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  summary {
    cursor: pointer;
    padding: 24px 0;
    color: #9ca9bd;
  }
  @media (max-width: 700px) {
    .setup-facts {
      grid-template-columns: 1fr;
    }
  }
</style>
