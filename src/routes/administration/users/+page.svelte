<script lang="ts">
  import { UserPlus, UsersRound, Save } from "@lucide/svelte";
  import { roleLabels } from "#lib/types/security.ts";
  let { data, form } = $props();
  let createOpen = $state(false);
</script>

<svelte:head
  ><title>Usuarios y permisos · Infrastructure as Code</title></svelte:head
>
<div class="page-heading">
  <div>
    <div class="eyebrow">ADMINISTRACIÓN / ACCESO</div>
    <h1>Usuarios y permisos</h1>
    <p>
      Gestiona las cuentas del workspace sin salir del centro de operaciones.
    </p>
  </div>
  <button class="button primary" onclick={() => (createOpen = !createOpen)}
    ><UserPlus size={15} /> Nuevo usuario</button
  >
</div>
{#if form?.error}<div class="callout warning" role="alert">
    {form.error}
  </div>{/if}
{#if form?.saved}<div class="callout" role="status">
    Cambios guardados y auditados.
  </div>{/if}
{#if createOpen}<section class="panel user-form-panel">
    <div class="panel-heading">
      <h2>Crear usuario</h2>
      <UsersRound size={18} />
    </div>
    <form method="POST" class="form-grid">
      <input type="hidden" name="_csrf" value={data.csrf} /><input
        type="hidden"
        name="_action"
        value="create"
      />
      <label
        >Usuario<input
          name="username"
          pattern="[a-z0-9._-]+"
          minlength="3"
          maxlength="64"
          required
        /></label
      >
      <label
        >Nombre visible<input
          name="displayName"
          maxlength="100"
          required
        /></label
      >
      <label
        >Rol<select name="role"
          ><option value="Viewer">Lector</option><option value="Operator"
            >Operador</option
          ><option value="Administrator">Administrador</option></select
        ></label
      >
      <label
        >Contraseña inicial<input
          name="password"
          type="password"
          autocomplete="new-password"
          minlength="14"
          maxlength="256"
          required
        /></label
      >
      <div class="form-actions">
        <button class="button primary" type="submit"
          ><Save size={15} /> Crear cuenta</button
        ><button
          class="button"
          type="button"
          onclick={() => (createOpen = false)}>Cancelar</button
        >
      </div>
    </form>
  </section>{/if}
<section class="panel">
  <div class="panel-heading">
    <h2>Cuentas del workspace</h2>
    <span class="micro muted">{data.users.length} cuentas · tenant aislado</span
    >
  </div>
  <div class="table-scroll">
    <table class="admin-table">
      <thead
        ><tr
          ><th>Usuario</th><th>Rol</th><th>Estado</th><th>Última actividad</th
          ><th>Administrar</th></tr
        ></thead
      ><tbody>
        {#each data.users as user}
          <tr>
            <td
              ><strong>{user.displayName}</strong><small>{user.username}</small
              ></td
            >
            <td
              ><span class="role-pill role-{user.role.toLowerCase()}"
                >{roleLabels[user.role]}</span
              ></td
            >
            <td>{user.disabled ? "Desactivada" : "Activa"}</td>
            <td>{user.lastActivity ?? "No disponible"}</td>
            <td
              ><details>
                <summary class="button">Editar</summary>
                <form method="POST" class="inline-user-form">
                  <input type="hidden" name="_csrf" value={data.csrf} /><input
                    type="hidden"
                    name="_action"
                    value="update"
                  /><input type="hidden" name="id" value={user.id} />
                  <label
                    >Usuario<input
                      name="username"
                      value={user.username}
                      pattern="[a-z0-9._-]+"
                      minlength="3"
                      maxlength="64"
                      required
                    /></label
                  >
                  <label
                    >Nombre<input
                      name="displayName"
                      value={user.displayName}
                      maxlength="100"
                      required
                    /></label
                  >
                  <label
                    >Rol<select name="role"
                      ><option value="Viewer" selected={user.role === "Viewer"}
                        >Lector</option
                      ><option
                        value="Operator"
                        selected={user.role === "Operator"}>Operador</option
                      ><option
                        value="Administrator"
                        selected={user.role === "Administrator"}
                        >Administrador</option
                      ></select
                    ></label
                  >
                  <label class="checkbox-label"
                    ><input
                      name="disabled"
                      type="checkbox"
                      value="true"
                      checked={user.disabled}
                    /> Cuenta desactivada</label
                  >
                  <label
                    >Nueva contraseña <span class="micro muted">opcional</span
                    ><input
                      name="password"
                      type="password"
                      autocomplete="new-password"
                      minlength="14"
                      maxlength="256"
                    /></label
                  >
                  <button class="button primary" type="submit"
                    ><Save size={14} /> Guardar</button
                  >
                </form>
              </details></td
            >
          </tr>
        {:else}<tr><td colspan="5">No hay usuarios en este workspace.</td></tr
          >{/each}
      </tbody>
    </table>
  </div>
  <p class="micro muted">
    No puedes desactivar ni degradar al último Administrador activo. No existe
    autorregistro público.
  </p>
</section>
