<script lang="ts">
  import { UserPlus, UsersRound, Save } from "@lucide/svelte";
  import { roleLabels } from "#lib/types/security.ts";
  let { data, form } = $props();
  let createOpen = $state(false);

  function fieldError(name: string) {
    return form?.field === name ? form.message : "";
  }
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
    {form.message ?? "No fue posible guardar los cambios."}
  </div>{/if}
{#if form?.saved}<div class="callout" role="status">
    {form.passwordReset
      ? "Contraseña restablecida. Las sesiones anteriores fueron revocadas."
      : "Cambios guardados y auditados."}
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
        >Usuario{#if fieldError("username")}<small
            class="field-error"
            role="alert">{fieldError("username")}</small
          >{/if}<input
          name="username"
          minlength="3"
          maxlength="64"
          autocomplete="off"
          required
        /></label
      >
      <label
        >Nombre visible{#if fieldError("displayName")}<small
            class="field-error"
            role="alert">{fieldError("displayName")}</small
          >{/if}<input name="displayName" maxlength="100" required /></label
      >
      <label
        >Rol{#if fieldError("role")}<small class="field-error" role="alert"
            >{fieldError("role")}</small
          >{/if}<select name="role"
          ><option value="Viewer">Lector</option><option value="Operator"
            >Operador</option
          ><option value="Administrator">Administrador</option></select
        ></label
      >
      <label
        >Contraseña inicial{#if fieldError("password")}<small
            class="field-error"
            role="alert">{fieldError("password")}</small
          >{/if}<input
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
            <td>
              <details>
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
                      minlength="3"
                      maxlength="64"
                      autocomplete="off"
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
                    ><input type="hidden" name="disabled" value="false" /><input
                      name="disabled"
                      type="checkbox"
                      value="true"
                      checked={user.disabled}
                    /> Cuenta desactivada</label
                  >
                  <button class="button primary" type="submit"
                    ><Save size={14} /> Guardar</button
                  >
                </form>
              </details>
              <details>
                <summary class="button">Restablecer contraseña</summary>
                <form
                  method="POST"
                  class="inline-user-form password-reset-form"
                >
                  <input type="hidden" name="_csrf" value={data.csrf} /><input
                    type="hidden"
                    name="_action"
                    value="reset-password"
                  /><input type="hidden" name="id" value={user.id} />
                  <label
                    >Nueva contraseña{#if fieldError("newPassword")}<small
                        class="field-error"
                        role="alert">{fieldError("newPassword")}</small
                      >{/if}<input
                      name="newPassword"
                      type="password"
                      autocomplete="new-password"
                      minlength="14"
                      maxlength="256"
                      required
                    /></label
                  >
                  <label
                    >Repetir contraseña{#if fieldError("confirmPassword")}<small
                        class="field-error"
                        role="alert">{fieldError("confirmPassword")}</small
                      >{/if}<input
                      name="confirmPassword"
                      type="password"
                      autocomplete="new-password"
                      minlength="14"
                      maxlength="256"
                      required
                    /></label
                  >
                  <label class="checkbox-label"
                    >{#if fieldError("confirmReset")}<small
                        class="field-error"
                        role="alert">{fieldError("confirmReset")}</small
                      >{/if}<input
                      name="confirmReset"
                      type="checkbox"
                      value="true"
                      required
                    /> Confirmo revocar sus sesiones</label
                  >
                  <button class="button" type="submit">Restablecer</button>
                </form>
              </details>
            </td>
          </tr>
        {:else}<tr><td colspan="5">No hay usuarios en este workspace.</td></tr
          >{/each}
      </tbody>
    </table>
  </div>
  <p class="micro muted">
    No puedes desactivar ni degradar al último Administrador activo. El cambio
    de contraseña es una acción separada y siempre revoca las sesiones de la
    cuenta.
  </p>
</section>
