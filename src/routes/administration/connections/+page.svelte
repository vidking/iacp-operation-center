<script lang="ts">
  import { formatTime, utcTime } from "#lib/time.ts";
  import { invalidateAll } from "$app/navigation";
  import { Plug, RefreshCw, ShieldCheck, KeyRound } from "@lucide/svelte";
  import AdvancedConnections from "#lib/components/AdvancedConnections.svelte";
  import { connectionMessage } from "#lib/types/connection-diagnostics.ts";
  import { stateLabels } from "#lib/types/connection-state.ts";
  let { data } = $props();
  let connection = $derived(
    data.connections.find((c) => c.selected) ??
      data.connections.find((c) => c.endpoint === "https://iac.cyberfuel.com"),
  );
  let busy = $state(false),
    accessForm = $state(false),
    advanced = $state(false);
  let operatorCredential = $state(""),
    dedicatedTenantOperator = $state(false);
  async function saveOperator() {
    if (busy) return;
    busy = true;
    error = "";
    message = "";
    try {
      await post("/api/admin/lifecycle", {
        credential: operatorCredential,
        dedicatedTenantOperator,
      });
      message =
        "Acceso de lifecycle cifrado. IACP autoriza cada solicitud; scopes no publicados.";
    } catch (e) {
      error = e instanceof Error ? e.message : "REQUEST_FAILED";
    } finally {
      operatorCredential = "";
      dedicatedTenantOperator = false;
      await reload();
      busy = false;
    }
  }
  async function retireOperator() {
    if (busy) return;
    busy = true;
    error = "";
    try {
      const response = await fetch("/api/admin/lifecycle", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": data.csrf,
        },
        body: "{}",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "REQUEST_FAILED");
      message =
        "Acceso de lifecycle retirado. Se conserva la conexión de observación.";
    } catch (e) {
      error = e instanceof Error ? e.message : "REQUEST_FAILED";
    } finally {
      await reload();
      busy = false;
    }
  }
  let credential = $state(""),
    message = $state(""),
    error = $state("");
  async function reload() {
    try {
      await invalidateAll();
    } catch {
      error ||= connectionMessage("REQUEST_FAILED");
    }
  }
  async function post(path: string, body: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": data.csrf,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "REQUEST_FAILED");
    return json;
  }
  async function connect(replace = false) {
    if (busy) return;
    const target = connection;
    if (!target && !replace && !data.credentialProvisioned) {
      accessForm = true;
      return;
    }
    busy = true;
    error = "";
    message = "";
    try {
      let checked;
      if (!target)
        checked = (
          await post("/api/admin/setup", replace ? { credential } : {})
        ).connection;
      else {
        if (replace)
          await post("/api/admin/connections/" + target.id, {
            action: "rotate",
            credential,
          });
        if (!target.enabled)
          await post("/api/admin/connections/" + target.id, {
            action: "enable",
          });
        checked = (
          await post("/api/admin/connections/" + target.id, { action: "test" })
        ).connection;
      }
      if (checked.lastCode !== "OK")
        throw new Error(checked.lastCode ?? "VALIDATION_REQUIRED");
      await post("/api/admin/connections/" + checked.id, {
        action: "activate",
      });
      await fetch("/api/observations/sync");
      message =
        "Configuración guardada. Revisa el estado y la última evidencia de IACP.";
      accessForm = false;
    } catch (e) {
      error = connectionMessage(
        e instanceof Error ? e.message : "REQUEST_FAILED",
      );
    } finally {
      credential = "";
      await reload();
      busy = false;
    }
  }
  async function test() {
    if (!connection || busy) return;
    busy = true;
    error = "";
    message = "";
    try {
      const json = await post("/api/admin/connections/" + connection.id, {
        action: "test",
      });
      if (json.connection.lastCode !== "OK")
        throw new Error(json.connection.lastCode);
      await fetch("/api/observations/sync");
      message =
        "Prueba correcta. Se verificaron autenticación, alcance y contratos.";
    } catch (e) {
      error = connectionMessage(
        e instanceof Error ? e.message : "REQUEST_FAILED",
      );
    } finally {
      await reload();
      busy = false;
    }
  }
  async function disconnect() {
    if (busy) return;
    busy = true;
    error = "";
    try {
      await post("/api/admin/disconnect", {});
      message = "IACP desconectado. El acceso cifrado se conserva.";
    } catch (e) {
      error = connectionMessage(
        e instanceof Error ? e.message : "REQUEST_FAILED",
      );
    } finally {
      await reload();
      busy = false;
    }
  }
</script>

<svelte:head><title>Conexión con IACP · IaCoC</title></svelte:head>
<div class="page-heading">
  <div>
    <div class="eyebrow">ADMINISTRATION</div>
    <h1>API Connections</h1>
    <p>Conexión con IACP y administración del acceso operativo.</p>
  </div>
</div>
<section class="panel" aria-label="Conexión IACP">
  <div class="panel-heading">
    <h2>{connection?.name ?? "IACP Cyberfuel"}</h2>
    <strong>{stateLabels[data.connectionStatus]}</strong>
  </div>
  <div class="setup-body">
    <p class="mono">{connection?.endpoint ?? "https://iac.cyberfuel.com"}</p>
    {#if data.health}<p class="micro muted">
        Autenticación y tenant verificados en IACP: {formatTime(
          data.health.observed_at,
        )}. Dependencias: {Object.entries(data.health.dependencies)
          .map(([component, status]) => `${component}: ${status}`)
          .join(" · ")}. La conectividad y la salud de dependencias se evalúan
        por separado.
      </p>{:else if data.healthError}<p class="callout warning">
        {connectionMessage(data.healthError)} <code>{data.healthError}</code>
      </p>{/if}
    <dl class="setup-facts">
      <div>
        <dt>Estado</dt>
        <dd>{stateLabels[data.connectionStatus]}</dd>
      </div>
      <div>
        <dt>Última conexión exitosa</dt>
        <dd>
          {connection?.lastSync
            ? formatTime(connection.lastSync)
            : "Sin sincronizar"}
        </dd>
      </div>
      <div>
        <dt>Última validación</dt>
        <dd>
          {connection?.lastValidation
            ? formatTime(connection.lastValidation)
            : "Pendiente"}
        </dd>
      </div>
    </dl>
    <div class="callout">
      <ShieldCheck size={18} />
      <p>
        El acceso a IACP se registra una vez, se cifra y permanece separado de
        tu cuenta local. La conexión autoriza únicamente su alcance verificado.
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
    <div class="setup-actions">
      <button class="button primary" disabled={busy} onclick={() => connect()}
        ><Plug size={16} />{busy ? "Procesando…" : "Conectar"}</button
      >
      <button
        class="button"
        disabled={busy || !connection?.enabled}
        onclick={test}><RefreshCw size={15} />Probar conexión</button
      >
      {#if connection?.selected}<button
          class="button"
          disabled={busy}
          onclick={disconnect}>Desconectar</button
        >{/if}
      <button
        class="button"
        disabled={busy}
        onclick={() => {
          accessForm = !accessForm;
          credential = "";
        }}
        ><KeyRound size={15} />{connection
          ? "Actualizar acceso"
          : "Registrar acceso"}</button
      >
    </div>
    {#if accessForm}<form
        class="form-body"
        onsubmit={(e) => {
          e.preventDefault();
          void connect(true);
        }}
      >
        <label
          >Clave de acceso a IACP<input
            required
            type="password"
            autocomplete="new-password"
            minlength="32"
            maxlength="4096"
            bind:value={credential}
          /><small
            >Utiliza el acceso de lectura autorizado. No se volverá a mostrar su
            valor.</small
          ></label
        >
        <p>
          Al conectar autorizas la lectura del alcance que IACP identifique para
          este espacio. No se cambian usuarios ni políticas de seguridad.
        </p>
        <button class="button primary" disabled={busy} type="submit"
          >Guardar y conectar</button
        >
        <button
          class="button"
          type="button"
          disabled={busy}
          onclick={() => {
            accessForm = false;
            credential = "";
          }}>Cancelar</button
        >
      </form>{/if}
    {#if message}<div class="callout" role="status">{message}</div>{/if}
    {#if error}<div class="callout warning" role="alert">{error}</div>{/if}
  </div>
</section>
<section class="panel" aria-label="Acceso de lifecycle">
  <div class="panel-heading">
    <h2>Acceso operator y ciclo de vida</h2>
    <strong
      >{data.lifecycleConfigured ? "Configurado" : "Sin configurar"}</strong
    >
  </div>
  {#if !data.lifecycleConfigured}<p class="panel-note">
      Observación no habilita creación ni energía. Registra aquí la identidad
      operator autorizada del mismo tenant. El acceso se conserva cifrado
      después de reiniciar IaCoC.
    </p>{/if}
  <form
    class="form-body"
    onsubmit={(e) => {
      e.preventDefault();
      void saveOperator();
    }}
  >
    <p>
      Identidad operator dedicada al tenant asociado, separada del reader. No
      utilices bootstrap ni credenciales con administration. IACP no publica
      introspección de scopes: cada acción conserva su autorización en IACP.
    </p>
    <label
      >Clave de acceso de lifecycle<input
        type="password"
        autocomplete="new-password"
        required
        minlength="12"
        maxlength="4096"
        bind:value={operatorCredential}
      /></label
    >
    <label
      ><input type="checkbox" required bind:checked={dedicatedTenantOperator} /> Confirmo
      que es una identidad operator dedicada del tenant, sin administration y autorizada
      para el entorno seleccionado.</label
    >
    <button
      class="button primary"
      disabled={busy || !connection?.active || !dedicatedTenantOperator}
      >Guardar acceso cifrado</button
    >
    {#if data.lifecycleConfigured}<button
        type="button"
        class="button"
        disabled={busy}
        onclick={retireOperator}>Retirar acceso de lifecycle</button
      >{/if}
  </form>
</section>
<details bind:open={advanced}>
  <summary>Administrar conexiones · edición, eliminación e historial</summary
  >{#if advanced}<AdvancedConnections {data} />{/if}
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
