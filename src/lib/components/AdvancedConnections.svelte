<script lang="ts">
  import { formatTime, utcTime } from "#lib/time.ts";
  import {
    Plus,
    ShieldCheck,
    KeyRound,
    RefreshCw,
    Plug,
    History,
    X,
    Check,
    Power,
    Settings2,
    Trash2,
  } from "@lucide/svelte";
  import { tick } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import type { ConnectionView } from "#lib/types/security.ts";
  import {
    displayStateLabel,
    stateLabels,
  } from "#lib/types/connection-state.ts";
  import Badge from "#lib/components/ui/Badge.svelte";
  import { connectionMessage } from "#lib/types/connection-diagnostics.ts";
  let {
    data,
    onScopeConfirmationRequested,
    onFocusScopeConfirmation,
    onConnectionChanged,
  }: {
    data: {
      connections: ConnectionView[];
      tenantId: string;
      connectionStatus: import("#lib/types/connection-state.ts").ConnectionState;
      liveEnabled: boolean;
      csrf: string;
    };
    onScopeConfirmationRequested: (
      connection: ConnectionView,
      resetExisting?: boolean,
    ) => void;
    onFocusScopeConfirmation: () => boolean;
    onConnectionChanged: (
      connectionId: string,
      connection?: ConnectionView,
    ) => void;
  } = $props();
  let focusedId = $state("");
  let formElement = $state<HTMLFormElement>();
  let deletingId = $state("");
  let deleteTarget = $derived(
    data.connections.find((c) => c.id === deletingId),
  );
  let historyName = $state("");
  function cancelEdit() {
    showForm = false;
    selected = null;
    credential = "";
  }
  async function refresh() {
    if (busy) return;
    busy = true;
    error = "";
    try {
      await invalidateAll();
      message = "Estado actualizado.";
    } catch {
      error = connectionMessage("REQUEST_FAILED");
    } finally {
      busy = false;
    }
  }
  let selected = $state<ConnectionView | null>(null);
  let showForm = $state(false);
  let rotating = $state<ConnectionView | null>(null);
  let credential = $state("");
  let name = $state("");
  let environment = $state("development");
  let endpoint = $state("");
  let identity = $state("");
  let busy = $state(false);
  let message = $state("");
  let error = $state("");
  let history = $state<
    | {
        id: string;
        occurred_at: string;
        actor: string;
        action: string;
        detail: string;
      }[]
    | null
  >(null);
  async function edit(c: ConnectionView | null) {
    if (c) focusedId = c.id;
    selected = c;
    showForm = true;
    rotating = null;
    credential = "";
    name = c?.name ?? "";
    environment = c?.environment ?? "production";
    endpoint = c?.endpoint ?? "https://iac.cyberfuel.com";
    identity = c?.serviceIdentity ?? "Infrastructure as Code";
    message = "";
    error = "";
    await tick();
    formElement?.querySelector("input")?.focus();
  }
  async function request(path: string, payload: unknown) {
    if (busy) return false;
    busy = true;
    error = "";
    message = "";
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": data.csrf,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "REQUEST_FAILED");
      if (json.authorized === false)
        throw new Error(json.code ?? "ENDPOINT_NOT_ALLOWED");
      if (json.connection?.id) focusedId = json.connection.id;
      const action = (payload as { action?: string }).action;
      if (action === "activate") await fetch("/api/observations/sync");
      await invalidateAll();
      const connectionId =
        json.connection?.id ??
        json.id ??
        path.match(/\/api\/admin\/connections\/([^/]+)/)?.[1];
      if (connectionId)
        onConnectionChanged(connectionId, json.connection as ConnectionView);
      const pendingScopeConfirmation =
        action === "test" &&
        json.connection?.apiProfile === "controlplane-v2" &&
        !json.connection.scopeConfirmed;
      if (pendingScopeConfirmation) {
        onScopeConfirmationRequested(json.connection, true);
        message = "";
        return json;
      }
      if (action === "test" && json.connection?.lastCode !== "OK") {
        error =
          "Prueba fallida: " + connectionMessage(json.connection?.lastCode);
        return false;
      } else {
        const messages: Record<string, string> = {
          update: "Cambios guardados y auditados.",
          rotate:
            "Credencial reemplazada. Prueba la conexión antes de activar la conexión productiva.",
          activate: "Conexión seleccionada para la conexión productiva.",
          disable: "Conexión desactivada. Las demás conexiones se conservan.",
          enable:
            "Conexión habilitada. Ejecuta Probar conexión antes de activar la conexión productiva.",
          delete:
            "Conexión eliminada. Su auditoría se conserva sin credenciales.",
          test: "Validación correcta. La conexión puede activarse en la conexión productiva.",
        };
        message = messages[action ?? ""] ?? "Cambio guardado y auditado.";
      }
      return json;
    } catch (e) {
      error = connectionMessage(
        e instanceof Error ? e.message : "REQUEST_FAILED",
      );
      return false;
    } finally {
      credential = "";
      busy = false;
    }
  }
  async function save(e: SubmitEvent) {
    e.preventDefault();
    const path = selected
      ? "/api/admin/connections/" + selected.id
      : "/api/admin/connections";
    const payload = selected
      ? {
          action: "update",
          name,
          environment,
          endpoint,
          serviceIdentity: identity,
          expectedUpdatedAt: selected.updatedAt,
          ...(credential ? { credential } : {}),
        }
      : { name, environment, endpoint, serviceIdentity: identity, credential };
    if (await request(path, payload)) showForm = false;
  }
  async function rotate(e: SubmitEvent) {
    e.preventDefault();
    if (
      rotating &&
      (await request("/api/admin/connections/" + rotating.id, {
        action: "rotate",
        credential,
      }))
    )
      rotating = null;
  }
  async function connectRecord(c: ConnectionView) {
    if (onFocusScopeConfirmation()) return;
    if (
      !c.enabled &&
      !(await request("/api/admin/connections/" + c.id, { action: "enable" }))
    )
      return;
    const testedResponse = await request("/api/admin/connections/" + c.id, {
      action: "test",
    });
    if (!testedResponse) return;
    const tested = testedResponse.connection ?? c;
    if (tested.apiProfile === "controlplane-v2" && !tested.scopeConfirmed)
      return;
    await request("/api/admin/connections/" + c.id, { action: "activate" });
  }
  async function changes(c: ConnectionView) {
    if (busy) return;
    busy = true;
    error = "";
    history = null;
    historyName = c.name;
    try {
      const res = await fetch("/api/admin/connections/" + c.id + "/history");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "REQUEST_FAILED");
      history = json.history;
    } catch (e) {
      error = connectionMessage(
        e instanceof Error ? e.message : "REQUEST_FAILED",
      );
    } finally {
      busy = false;
    }
  }
  async function remove(c: ConnectionView) {
    if (
      await request("/api/admin/connections/" + c.id, {
        action: "delete",
        confirmId: c.id,
      })
    ) {
      deletingId = "";
      if (selected?.id === c.id) cancelEdit();
      if (rotating?.id === c.id) {
        rotating = null;
        credential = "";
      }
      await changes(c);
    }
  }
</script>

<div class="page-heading">
  <div>
    <div class="eyebrow">ADMINISTRATION / {data.tenantId}</div>
    <h2>Conexiones avanzadas</h2>
    <p>Gestiona el servidor autorizado, su acceso y el historial de cambios.</p>
  </div>
  <button class="button primary" disabled={busy} onclick={() => edit(null)}
    ><Plus size={15} /> Nueva conexión</button
  >
</div>
<div class="callout">
  <ShieldCheck size={19} />
  <p>
    <strong>Solo Administrador.</strong> Los secretos se cifran y nunca se recuperan
    desde esta interfaz. El permiso de destino se administra fuera de este portal.
    La conexión productiva requiere validación y habilitación del servidor.
  </p>
</div>
{#if !data.liveEnabled}<div class="callout warning" role="status">
    {connectionMessage("LIVE_DISABLED")}
  </div>{/if}
<div class="section-line"><h2>Conexiones registradas</h2></div>
<button class="button" disabled={busy} onclick={refresh}
  ><RefreshCw size={14} /> Actualizar estado</button
>
{#if message}<div class="callout" role="status">
    {message}
  </div>{/if}{#if error}<div class="callout warning" role="alert">
    {error}
  </div>{/if}
{#if showForm}<section class="panel">
    <div class="panel-heading">
      <h2>{selected ? "Editar conexión" : "Nueva conexión"}</h2>
      <button
        class="icon-button"
        aria-label="Cerrar formulario"
        disabled={busy}
        onclick={cancelEdit}><X size={17} /></button
      >
    </div>
    <form
      bind:this={formElement}
      class="form-body connection-form"
      onsubmit={save}
    >
      <label
        >Nombre<input
          required
          minlength="2"
          maxlength="80"
          bind:value={name}
        /></label
      >
      <label
        >Entorno<select aria-label="Entorno" bind:value={environment}
          ><option value="development">Development</option><option
            value="staging">Staging</option
          ><option value="production">Production</option></select
        ></label
      >
      <label
        >Endpoint autorizado HTTPS<input
          required
          type="url"
          maxlength="300"
          bind:value={endpoint}
        /></label
      >
      <label
        >{selected
          ? "Nueva clave de acceso (opcional)"
          : "Clave de acceso a IACP"}<input
          required={!selected}
          type="password"
          aria-label={selected
            ? "Nueva clave de acceso (opcional)"
            : "Clave de acceso a IACP"}
          autocomplete="new-password"
          minlength="12"
          maxlength="4096"
          bind:value={credential}
        /><small
          >{selected
            ? "Vacío conserva el acceso almacenado."
            : "Se cifra y no vuelve a mostrarse."}</small
        ></label
      >
      <div class="callout warning">
        <p>
          Cambiar el destino o la clave exige una nueva prueba y conexión. Los
          cambios de nombre y entorno conservan la autorización.
        </p>
      </div>
      <button class="button primary" disabled={busy} type="submit"
        ><Check size={15} />{selected
          ? "Guardar cambios"
          : "Guardar conexión"}</button
      >
      <button class="button" type="button" disabled={busy} onclick={cancelEdit}
        >Cancelar edición</button
      >
    </form>
  </section>{/if}
{#if rotating}<section class="panel">
    <div class="panel-heading">
      <h2>Rotar credencial · {rotating.name}</h2>
      <button
        class="icon-button"
        aria-label="Cerrar rotación"
        onclick={() => {
          rotating = null;
          credential = "";
        }}><X size={17} /></button
      >
    </div>
    <form class="form-body" onsubmit={rotate}>
      <label
        >Nueva clave de acceso<input
          required
          type="password"
          minlength="12"
          maxlength="4096"
          autocomplete="new-password"
          bind:value={credential}
        /></label
      ><button class="button primary" disabled={busy}
        ><KeyRound size={15} /> Reemplazar acceso</button
      >
    </form>
  </section>{/if}
<section class="panel">
  <div class="panel-heading">
    <h2>Conexiones de {data.tenantId}</h2>
    <span class="micro muted">{data.connections.length} conexiones</span>
  </div>
  <div class="table-wrap">
    <table>
      <thead
        ><tr
          ><th>Nombre / entorno</th><th>Endpoint autorizado</th><th
            >Identidad</th
          ><th>Estado / validación</th><th>Credencial</th><th>Acciones</th></tr
        ></thead
      ><tbody
        >{#each data.connections as c}<tr
            ><td
              ><strong>{c.name}</strong><small
                >{c.environment}{c.selected
                  ? c.active
                    ? " · PRODUCTIVA SELECCIONADA"
                    : " · SELECCIONADA · REQUIERE VALIDACIÓN"
                  : " · INACTIVA"}</small
              ><small
                >{c.apiProfile === "controlplane-v2"
                  ? "ControlPlaneV2 · single-tenant"
                  : "IACP legado"}</small
              ></td
            ><td class="mono">{c.endpoint}</td><td
              >{c.serviceIdentity}<small>Tenant local: {c.tenantId}</small
              >{#if c.scopeBinding}<small
                  >{c.scopeConfirmed
                    ? "Alcance confirmado: "
                    : "Alcance pendiente: "}{c.scopeBinding}</small
                >{/if}</td
            ><td
              ><Badge
                value={c.operationalState === "connected"
                  ? "running"
                  : c.operationalState === "disconnected"
                    ? "unknown"
                    : "stale"}
                label={displayStateLabel(c.operationalState, c.active)}
              /><small title={utcTime(c.lastValidation)}
                >{c.lastValidation
                  ? formatTime(c.lastValidation)
                  : "Sin validar"}</small
              ><small
                >{c.lastCode ?? "Sin resultado"}{c.enabled
                  ? ""
                  : " · DESHABILITADA"}</small
              ></td
            ><td
              >{c.credentialsConfigured ? "Almacenada" : "Ausente"}<small
                >Versión {c.credentialVersion}</small
              ></td
            ><td
              ><div class="connection-actions">
                <button
                  class="button"
                  disabled={busy}
                  onclick={() => {
                    void edit(c);
                  }}>Configurar {c.name}</button
                >
                <button
                  class="button"
                  disabled={busy || !c.enabled}
                  onclick={() =>
                    request(`/api/admin/connections/${c.id}`, {
                      action: "test",
                    })}><Plug size={13} /> Probar conexión</button
                ><button
                  class="button"
                  disabled={busy || !data.liveEnabled}
                  onclick={() => connectRecord(c)}>Conectar</button
                ><button
                  class="icon-button"
                  aria-label={`Editar ${c.name}`}
                  title="Editar conexión"
                  disabled={busy}
                  onclick={() => edit(c)}><Settings2 size={15} /></button
                ><button
                  class="icon-button"
                  aria-label={`Rotar ${c.name}`}
                  title="Reemplazar credencial"
                  disabled={busy}
                  onclick={() => {
                    rotating = c;
                    showForm = false;
                    credential = "";
                  }}><KeyRound size={15} /></button
                ><button
                  class="icon-button"
                  aria-label={`Historial ${c.name}`}
                  title="Consultar historial"
                  disabled={busy}
                  onclick={() => changes(c)}><History size={15} /></button
                ><button
                  class="icon-button"
                  aria-label={`Deshabilitar ${c.name}`}
                  title="Desactivar esta conexión"
                  disabled={busy || !c.enabled}
                  onclick={() =>
                    request(`/api/admin/connections/${c.id}`, {
                      action: "disable",
                    })}><Power size={15} /></button
                >
                {#if !c.enabled}<button
                    class="button"
                    disabled={busy}
                    onclick={() =>
                      request("/api/admin/connections/" + c.id, {
                        action: "enable",
                      })}>Habilitar {c.name}</button
                  >{/if}
                <button
                  class="icon-button"
                  aria-label={"Eliminar conexión " + c.name}
                  title="Eliminar conexión"
                  disabled={busy}
                  onclick={() => {
                    deletingId = c.id;
                    error = "";
                    message = "";
                  }}><Trash2 size={15} /></button
                >
              </div></td
            ></tr
          >{:else}<tr
            ><td colspan="6" class="empty-state"
              >Sin conexiones. Registra un acceso autorizado para IACP.</td
            ></tr
          >{/each}</tbody
      >
    </table>
  </div>
</section>
{#if deleteTarget}<section class="panel" aria-label="Confirmar eliminación">
    <div class="panel-heading">
      <h2>Eliminar conexión · {deleteTarget.name}</h2>
    </div>
    <div class="form-body">
      <p>
        Se eliminará «{deleteTarget.name}» ({deleteTarget.environment}) en {deleteTarget.endpoint},
        junto con su credencial cifrada y evidencia guardada. Se conserva la
        auditoría. No se eliminan otras conexiones ni el keyring.
      </p>
      {#if deleteTarget.selected}<div class="callout warning" role="status">
          Esta conexión está seleccionada para la conexión productiva. Debes
          desactivarla antes de eliminarla. Para mantener la conexión
          productiva, activa primero otra conexión validada.
        </div>
        <button
          class="button"
          disabled={busy}
          onclick={() =>
            request("/api/admin/connections/" + deleteTarget!.id, {
              action: "disable",
            })}>Desactivar para eliminar</button
        >
      {/if}
      <button
        class="button primary"
        disabled={busy || deleteTarget.selected}
        onclick={() => remove(deleteTarget!)}
        aria-label={"Confirmar eliminación de " + deleteTarget.name}
        >Confirmar eliminación</button
      >
      <button class="button" disabled={busy} onclick={() => (deletingId = "")}
        >Cancelar eliminación</button
      >
    </div>
  </section>{/if}
{#if history}<section class="panel">
    <div class="panel-heading">
      <h2>Historial auditable · {historyName}</h2>
      <button
        class="icon-button"
        aria-label="Cerrar historial"
        onclick={() => (history = null)}><X size={16} /></button
      >
    </div>
    <div class="audit-history">
      {#each history as entry}<article>
          <strong>{entry.action}</strong><small
            >{formatTime(entry.occurred_at)} · actor {entry.actor}</small
          ><code>{entry.detail}</code>
        </article>{/each}
    </div>
  </section>{/if}
