<script lang="ts">
  import { Settings2, Bell, Clock3 } from "@lucide/svelte";
  let { data, form } = $props();
</script>

<svelte:head><title>Configuración · Infrastructure as Code</title></svelte:head>
<div class="page-heading">
  <div>
    <div class="eyebrow">ADMINISTRACIÓN / PREFERENCIAS</div>
    <h1>Configuración</h1>
    <p>Preferencias funcionales del workspace y de tu sesión.</p>
  </div>
</div>
{#if form?.error}<div class="callout warning" role="alert">
    {form.error}
  </div>{/if}
{#if form?.saved}<div class="callout" role="status">
    Preferencias guardadas y auditadas.
  </div>{/if}
<section class="panel settings-panel">
  <div class="panel-heading">
    <h2>Preferencias funcionales</h2>
    <Settings2 size={18} />
  </div>
  <form method="POST" class="form-grid">
    <input type="hidden" name="_csrf" value={data.csrf} />
    <label
      >Nombre visible del workspace<input
        name="workspaceName"
        value={data.preferences.workspaceName}
        minlength="2"
        maxlength="80"
        required
      /></label
    >
    <label
      >Zona horaria<select name="timeZone"
        ><option
          value="America/Costa_Rica"
          selected={data.preferences.timeZone === "America/Costa_Rica"}
          >America/Costa_Rica (UTC−06:00)</option
        ><option value="UTC" selected={data.preferences.timeZone === "UTC"}
          >UTC</option
        ><option
          value="America/New_York"
          selected={data.preferences.timeZone === "America/New_York"}
          >America/New_York</option
        ><option
          value="America/Los_Angeles"
          selected={data.preferences.timeZone === "America/Los_Angeles"}
          >America/Los_Angeles</option
        ><option
          value="Europe/Madrid"
          selected={data.preferences.timeZone === "Europe/Madrid"}
          >Europe/Madrid</option
        ></select
      ></label
    >
    <label
      >Tamaño de página predeterminado<select name="pageSize"
        ><option value="25" selected={data.preferences.pageSize === 25}
          >25</option
        ><option value="50" selected={data.preferences.pageSize === 50}
          >50</option
        ><option value="100" selected={data.preferences.pageSize === 100}
          >100</option
        ></select
      ></label
    >
    <label
      >Actualización automática<select name="refreshInterval"
        ><option value="4" selected={data.preferences.refreshInterval === 4}
          >4 segundos</option
        ><option value="10" selected={data.preferences.refreshInterval === 10}
          >10 segundos</option
        ><option value="30" selected={data.preferences.refreshInterval === 30}
          >30 segundos</option
        ><option value="60" selected={data.preferences.refreshInterval === 60}
          >60 segundos</option
        ></select
      ></label
    >
    <label class="checkbox-label"
      ><input
        name="notifications"
        type="checkbox"
        value="true"
        checked={data.preferences.notifications}
      /><Bell size={15} /> Notificaciones visuales activas</label
    >
    <div class="form-actions">
      <button class="button primary" type="submit"
        ><Settings2 size={15} /> Guardar configuración</button
      >
    </div>
  </form>
  <p class="micro muted">
    <Clock3 size={14} /> America/Costa_Rica permanece como valor predeterminado. Endpoints,
    TLS, credenciales y redes se administran únicamente desde Conectores y el despliegue.
  </p>
</section>
