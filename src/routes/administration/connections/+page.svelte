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
  } from "@lucide/svelte";
  import { invalidateAll } from "$app/navigation";
  import type { ConnectionView } from "#lib/types/security.ts";
  import Badge from "#lib/components/ui/Badge.svelte";
  let { data } = $props();
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
  function edit(c: ConnectionView | null) {
    selected = c;
    showForm = true;
    rotating = null;
    credential = "";
    name = c?.name ?? "";
    environment = c?.environment ?? "development";
    endpoint = c?.endpoint ?? "";
    identity = c?.serviceIdentity ?? "";
    message = "";
    error = "";
  }
  async function request(path: string, payload: unknown) {
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
      await invalidateAll();
      message =
        json.connection?.lastCode && json.connection.lastCode !== "OK"
          ? `Validación: ${json.connection.lastCode}`
          : "Cambio guardado y auditado.";
      return true;
    } catch (e) {
      error = e instanceof Error ? e.message : "REQUEST_FAILED";
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
    error = "";
    const res = await fetch(`/api/admin/connections/${c.id}/history`);
    const json = await res.json();
    if (res.ok) history = json.history;
    else error = json.error;
  }
</script>

<svelte:head><title>API Connections · IaCoC</title></svelte:head>
<div class="page-heading">
  <div>
    <div class="eyebrow">ADMINISTRATION / {data.tenantId}</div>
    <h1>API Connections</h1>
    <p>Identidades de observación, destinos autorizados y trazabilidad.</p>
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
        onclick={() => {
          showForm = false;
          credential = "";
        }}><X size={17} /></button
      >
    </div>
    <form class="form-body connection-form" onsubmit={save}>
      <label>Nombre<input required maxlength="80" bind:value={name} /></label
      ><label
        >Entorno<select bind:value={environment}
          ><option value="development">Development</option><option
            value="staging">Staging</option
          ><option value="production">Production</option></select
        ></label
      ><label
        >Endpoint autorizado HTTPS<input
          required
          type="url"
          maxlength="300"
          bind:value={endpoint}
          placeholder="https://origen-autorizado.example"
        /></label
      ><label
        >Identidad de servicio (etiqueta)<input
          required
          maxlength="80"
          bind:value={identity}
        /></label
      >{#if !selected}<label
          >Credencial de servicio<input
            required
            type="password"
            aria-label="Credencial de servicio"
            autocomplete="new-password"
            minlength="12"
            maxlength="4096"
            bind:value={credential}
          /><small>Se recibe una vez. Nunca se devuelve al navegador.</small
          ></label
        >{/if}
      <div class="callout warning">
        <p>
          El tenant {data.tenantId} procede de tu identidad. Editar o rotar invalida
          la validación anterior; LIVE falla cerrado hasta validar de nuevo.
        </p>
      </div>
      <button class="button primary" disabled={busy} type="submit"
        ><Check size={15} /> Guardar conexión</button
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
                >{c.environment}{c.active ? " · ACTIVA" : ""}</small
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
                  disabled={busy || !c.enabled}
                  onclick={() =>
                    request(`/api/admin/connections/${c.id}`, {
                      action: "test",
                    })}><Plug size={13} /> Test Connection</button
                ><button
                  class="button"
                  disabled={busy ||
                    c.status !== "valid" ||
                    !c.enabled ||
                    !data.liveEnabled}
                  onclick={() =>
                    request(`/api/admin/connections/${c.id}`, {
                      action: "activate",
                    })}>Activar LIVE</button
                ><button
                  class="icon-button"
                  aria-label={`Editar ${c.name}`}
                  disabled={busy}
                  onclick={() => edit(c)}><Settings2 size={15} /></button
                ><button
                  class="icon-button"
                  aria-label={`Rotar ${c.name}`}
                  disabled={busy}
                  onclick={() => {
                    rotating = c;
                    showForm = false;
                    credential = "";
                  }}><KeyRound size={15} /></button
                ><button
                  class="icon-button"
                  aria-label={`Historial ${c.name}`}
                  onclick={() => changes(c)}><History size={15} /></button
                ><button
                  class="icon-button"
                  aria-label={`Deshabilitar ${c.name}`}
                  disabled={busy || !c.enabled}
                  onclick={() =>
                    request(`/api/admin/connections/${c.id}`, {
                      action: "disable",
                    })}><Power size={15} /></button
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
{#if history}<section class="panel">
    <div class="panel-heading">
      <h2>Historial auditable</h2>
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
