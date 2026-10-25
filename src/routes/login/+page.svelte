<script lang="ts">
  import { Hexagon, ShieldCheck, LogIn } from "@lucide/svelte";
  let { data, form } = $props();
</script>

<svelte:head><title>Iniciar sesión · IaCoC</title></svelte:head>
<main class="auth-page">
  <section class="panel auth-card">
    <div class="brand">
      <span class="brand-mark"><Hexagon size={32} /><span></span></span>
      <div>IaCoC<small>INFRASTRUCTURE OPERATIONS</small></div>
    </div>
    <h1>Acceso al workspace</h1>
    <p>Autenticación local segura · Cyberfuel</p>
    <form method="POST">
      <input type="hidden" name="_csrf" value={data.loginCsrf} /><label
        >Usuario<input
          name="username"
          autocomplete="username"
          required
          maxlength="64"
        /></label
      ><label
        >Contraseña<input
          name="password"
          type="password"
          autocomplete="current-password"
          required
          maxlength="256"
        /></label
      >{#if form?.error}<div class="callout warning" role="alert">
          {form.error}
        </div>{/if}<button class="button primary w-full" type="submit"
        ><LogIn size={15} /> Iniciar sesión</button
      >
    </form>
    <div class="auth-note">
      <ShieldCheck size={17} /><span
        >Sin credenciales predeterminadas. La administración inicial se realiza
        desde la consola autorizada.</span
      >
    </div>
  </section>
</main>
