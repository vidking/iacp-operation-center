<script lang="ts">
  import { UserPlus, UsersRound, Save } from "@lucide/svelte";
  import { roleLabels } from "#lib/types/security.ts";
  let { data, form } = $props();
  let createOpen = $state(false);
  let username = $state(""),
    displayName = $state(""),
    password = $state("");
  let usernameIssue = $derived(
    username && !/^[a-z0-9._-]{3,64}$/i.test(username.trim())
      ? "Usa entre 3 y 64 caracteres: letras, números, punto, guion o guion bajo."
      : username && username !== username.toLowerCase()
        ? "Se guardará en minúsculas según la regla del contrato."
        : "",
  );
  let displayNameIssue = $derived(
    displayName && !/^[\p{L}\p{N} ._()\-]{1,100}$/u.test(displayName.trim())
      ? "Usa letras, números, espacios, punto, guion, guion bajo o paréntesis."
      : "",
  );
  let passwordIssue = $derived(
    password && password.length < 14
      ? "La contraseña inicial necesita al menos 14 caracteres."
      : "",
  );

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
      <label for="create-username"
        >Nombre de usuario <span class="field-example">Ejemplo: falvarez</span
        >{#if fieldError("username")}<small class="field-error" role="alert"
            >{fieldError("username")}</small
          >{:else if usernameIssue}<small
            class:field-hint={!usernameIssue.includes("Usa")}
            class="field-error"
            aria-live="polite">{usernameIssue}</small
          >{/if}<input
          id="create-username"
          name="username"
          bind:value={username}
          minlength="3"
          maxlength="64"
          pattern={"[a-zA-Z0-9._-]{3,64}"}
          autocomplete="off"
          aria-describedby="create-username-help"
          aria-invalid={Boolean(
            username && usernameIssue && usernameIssue.includes("Usa"),
          )}
          required
        /><small id="create-username-help" class="field-help"
          >Identificador único del workspace; no es el nombre completo.</small
        ></label
      >
      <label for="create-display-name"
        >Nombre visible <span class="field-example"
          >Ejemplo: Freddy Alvarez</span
        >{#if fieldError("displayName")}<small class="field-error" role="alert"
            >{fieldError("displayName")}</small
          >{:else if displayNameIssue}<small
            class="field-error"
            aria-live="polite">{displayNameIssue}</small
          >{/if}<input
          id="create-display-name"
          name="displayName"
          bind:value={displayName}
          maxlength="100"
          aria-describedby="create-display-name-help"
          aria-invalid={Boolean(displayNameIssue)}
          required
        /><small id="create-display-name-help" class="field-help"
          >Nombre que verá el equipo en el workspace.</small
        ></label
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
      <label for="create-password"
        >Contraseña inicial <span class="field-example"
          >Mínimo 14 caracteres</span
        >{#if fieldError("password")}<small class="field-error" role="alert"
            >{fieldError("password")}</small
          >{:else if passwordIssue}<small class="field-error" aria-live="polite"
            >{passwordIssue}</small
          >{/if}<input
          id="create-password"
          name="password"
          type="password"
          bind:value={password}
          autocomplete="new-password"
          aria-describedby="create-password-help"
          aria-invalid={Boolean(passwordIssue)}
          minlength="14"
          maxlength="256"
          required
        /><small id="create-password-help" class="field-help"
          >No se guardan ni se muestran contraseñas en el navegador.</small
        ></label
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
                    >Nombre de usuario <span class="field-example"
                      >Identificador, por ejemplo falvarez</span
                    ><input
                      name="username"
                      value={user.username}
                      minlength="3"
                      maxlength="64"
                      autocomplete="off"
                      required
                    /></label
                  >
                  <label
                    >Nombre visible <span class="field-example"
                      >Nombre completo</span
                    ><input
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
