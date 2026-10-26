<script lang="ts">
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
  import Badge from "#lib/components/ui/Badge.svelte";
  import ConnectionWizard from "#lib/components/ConnectionWizard.svelte";
  import { connectionMessage } from "#lib/types/connection-diagnostics.ts";
  let {
    data,
  }: {
    data: {
      connections: ConnectionView[];
      tenantId: string;
      currentMode: string;
      liveEnabled: boolean;
      csrf: string;
    };
  } = $props();
  let formStep = $state(1);
  let focusedId = $state("");
  let focused = $derived(
    data.connections.find((c) => c.id === focusedId) ??
      data.connections.find((c) => c.selectedForLive) ??
      data.connections[0],
  );
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
    formStep = 1;
    if (c) focusedId = c.id;
    selected = c;
    showForm = true;
    rotating = null;
    credential = "";
    name = c?.name ?? "";
    environment = c?.environment ?? "production";
    endpoint = c?.endpoint ?? "https://iac.cyberfuel.com";
    identity = c?.serviceIdentity ?? "";
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
      await invalidateAll();
      const action = (payload as { action?: string }).action;
      if (action === "test" && json.connection?.lastCode !== "OK") {
        error =
          "Prueba fallida: " + connectionMessage(json.connection?.lastCode);
      } else {
        const messages: Record<string, string> = {
          update: "Cambios guardados y auditados.",
          rotate:
            "Credencial reemplazada. Prueba la conexión antes de activar LIVE.",
          activate: "Conexión seleccionada para LIVE.",
          disable: "Conexión desactivada. Las demás conexiones se conservan.",
          enable:
            "Conexión habilitada. Ejecuta Test Connection antes de activar LIVE.",
          delete:
            "Conexión eliminada. Su auditoría se conserva sin credenciales.",
          test: "Validación correcta. La conexión puede activarse en LIVE.",
        };
        message = messages[action ?? ""] ?? "Cambio guardado y auditado.";
      }
      return true;
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
    if (!selected && formStep === 1) {
      if (await request("/api/admin/connections/preflight", { endpoint }))
        formStep = 2;
      return;
    }
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
    <p>
      Conecta IACP paso a paso: destino, reader del tenant, validación y LIVE.
    </p>
  </div>
  <button class="button primary" disabled={busy} onclick={() => edit(null)}
    ><Plus size={15} /> Nueva conexión</button
  >
</div>
<div class="callout">
  <ShieldCheck size={19} />
  <p>
    <strong>Solo Administrator.</strong> Los secretos se cifran y nunca se recuperan
    desde esta interfaz. El permiso de destino se administra fuera de IaCoC. LIVE
    requiere validación y habilitación del servidor.
  </p>
</div>
{#if !data.liveEnabled}<div class="callout warning" role="status">
    {connectionMessage("LIVE_DISABLED")}
  </div>{/if}
<div class="section-line">
  <h2>
    Modo actual <Badge
      value={data.currentMode === "LIVE" ? "running" : "idle"}
      label={data.currentMode}
    />
  </h2>
  <button
    class="button"
    disabled={busy}
    onclick={() => request("/api/admin/mode", { mode: "MOCK" })}
    >Usar MOCK</button
  >
</div>
<p class="micro muted">
  Usar MOCK conserva las conexiones y sus credenciales cifradas. Volver a LIVE
  exige validación reciente y una acción explícita.
</p>
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
      {#if !selected}<p>
          Paso {formStep} de 2 · {formStep === 1
            ? "Registrar destino HTTPS"
            : "Asociar reader del tenant"}
        </p>{/if}
      {#if selected || formStep === 1}
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
            placeholder="https://origen-autorizado.example"
          /></label
        >
      {/if}
      {#if selected || formStep === 2}
        <label
          >Identidad de servicio (etiqueta)<input
            required
            minlength="2"
            maxlength="80"
            bind:value={identity}
          /></label
        >
        <label
          >{selected
            ? "Nueva credencial (opcional)"
            : "Credencial de servicio"}<input
            required={!selected}
            type="password"
            aria-label={selected
              ? "Nueva credencial (opcional)"
              : "Credencial de servicio"}
            autocomplete="new-password"
            minlength="12"
            maxlength="4096"
            bind:value={credential}
          />
          <small
            >{selected
              ? "Déjala vacía para conservar la credencial almacenada. Nunca se recupera su valor."
              : "Se recibe una vez. Nunca se devuelve al navegador."}</small
          >
        </label>
      {/if}
      <div class="callout warning">
        <p>
          Cambiar el destino o la credencial exige una nueva prueba. Los cambios
          de nombre, entorno o etiqueta conservan la autorización y no
          interrumpen LIVE.
        </p>
      </div>
      <button class="button primary" disabled={busy} type="submit"
        ><Check size={15} />{selected
          ? "Guardar cambios"
          : formStep === 1
            ? "Continuar: credencial reader"
            : "Guardar conexión"}</button
      >
      <button class="button" type="button" disabled={busy} onclick={cancelEdit}
        >Cancelar edición</button
      >
      {#if !selected && formStep === 2}<button
          class="button"
          type="button"
          disabled={busy}
          onclick={() => {
            formStep = 1;
            credential = "";
          }}>Volver al destino</button
        >{/if}
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
        >Nueva credencial<input
          required
          type="password"
          minlength="12"
          maxlength="4096"
          autocomplete="new-password"
          bind:value={credential}
        /></label
      ><button class="button primary" disabled={busy}
        ><KeyRound size={15} /> Reemplazar credencial</button
      >
    </form>
  </section>{/if}
{#if focused}<ConnectionWizard
    connection={focused}
    {busy}
    run={(action) => {
      void request("/api/admin/connections/" + focused.id, { action });
    }}
  />{/if}
<section class="panel">
  <div class="panel-heading">
    <h2>Conexiones de {data.tenantId}</h2>
    <span class="micro muted"
      >{data.connections.length} conexiones · LIVE {data.liveEnabled
        ? "habilitable"
        : "deshabilitado en servidor"}</span
    >
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
                >{c.environment}{c.selectedForLive
                  ? c.active
                    ? " · LIVE ACTIVA"
                    : " · LIVE BLOQUEADA"
                  : " · INACTIVA"}</small
              ></td
            ><td class="mono">{c.endpoint}</td><td
              >{c.serviceIdentity}<small>Tenant: {c.tenantId}</small></td
            ><td
              ><Badge value={c.status} /><small
                >{c.lastValidation ?? "Sin validar"}</small
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
                    })}><Plug size={13} /> Test Connection</button
                ><button
                  class="button"
                  disabled={busy || c.activationCode !== "OK"}
                  onclick={() =>
                    request(`/api/admin/connections/${c.id}`, {
                      action: "activate",
                    })}>Activar LIVE</button
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
              >Sin conexiones. MOCK permanece disponible.</td
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
      {#if deleteTarget.selectedForLive}<div
          class="callout warning"
          role="status"
        >
          Esta conexión está seleccionada para LIVE. Debes desactivarla antes de
          eliminarla. Para mantener LIVE, activa primero otra conexión validada.
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
        disabled={busy || deleteTarget.selectedForLive}
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
            >{entry.occurred_at} · actor {entry.actor}</small
          ><code>{entry.detail}</code>
        </article>{/each}
    </div>
  </section>{/if}
