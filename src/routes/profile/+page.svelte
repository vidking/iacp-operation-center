<script lang="ts">
  import { UserRound, KeyRound, ShieldCheck } from "@lucide/svelte";
  import { roleLabels } from "#lib/types/security.ts";
  let { data, form } = $props();
</script>

<svelte:head><title>Mi perfil · Infrastructure as Code</title></svelte:head>
<div class="page-heading">
  <div>
    <div class="eyebrow">CUENTA / PERFIL</div>
    <h1>Mi perfil</h1>
    <p>Administra tu identidad local y las sesiones de este workspace.</p>
  </div>
</div>
{#if form?.error}<div class="callout warning" role="alert">
    {form.error}
  </div>{/if}
{#if form?.saved}<div class="callout" role="status">
    Perfil actualizado.
  </div>{/if}
<div class="profile-grid">
  <section class="panel profile-card">
    <div class="panel-heading">
      <h2>Identidad</h2>
      <UserRound size={18} />
    </div>
    <div class="profile-summary">
      <span class="avatar profile-avatar"
        >{data.profile.displayName.slice(0, 2).toUpperCase()}</span
      >
      <div>
        <strong>{data.profile.displayName}</strong><small
          >{roleLabels[data.profile.role]}</small
        >
      </div>
    </div>
    <dl class="setup-facts">
      <div>
        <dt>Usuario</dt>
        <dd>{data.profile.username}</dd>
      </div>
      <div>
        <dt>Rol</dt>
        <dd>{roleLabels[data.profile.role]}</dd>
      </div>
      <div>
        <dt>Workspace</dt>
        <dd>{data.profile.tenantId}</dd>
      </div>
      <div>
        <dt>Estado</dt>
        <dd>{data.profile.disabled ? "Desactivada" : "Activa"}</dd>
      </div>
      <div>
        <dt>Última actividad</dt>
        <dd>{data.profile.lastActivity ?? "No disponible"}</dd>
      </div>
    </dl>
  </section>
  <section class="panel">
    <div class="panel-heading"><h2>Datos visibles</h2></div>
    <form method="POST" class="form-body">
      <input type="hidden" name="_csrf" value={data.csrf} />
      <label
        >Nombre visible<input
          name="displayName"
          value={data.profile.displayName}
          minlength="1"
          maxlength="100"
          required
        /></label
      >
      <label
        >Nombre de usuario<input
          name="username"
          value={data.profile.username}
          minlength="3"
          maxlength="64"
          required
        /></label
      >
      <button class="button primary" type="submit">Guardar perfil</button>
    </form>
  </section>
  <section class="panel">
    <div class="panel-heading">
      <h2>Cambiar contraseña</h2>
      <KeyRound size={18} />
    </div>
    <form method="POST" class="form-body">
      <input type="hidden" name="_csrf" value={data.csrf} />
      <label
        >Contraseña actual<input
          name="currentPassword"
          type="password"
          autocomplete="current-password"
          required
        /></label
      >
      <label
        >Nueva contraseña<input
          name="newPassword"
          type="password"
          autocomplete="new-password"
          minlength="14"
          maxlength="256"
          required
        /></label
      >
      <button class="button" type="submit">Actualizar contraseña</button>
      <p class="micro muted">
        <ShieldCheck size={14} /> Se revocan las sesiones anteriores y deberás iniciar
        sesión nuevamente.
      </p>
    </form>
  </section>
</div>
