<script lang="ts">
  import { ShieldCheck, LogIn } from "@lucide/svelte";
  let { data, form } = $props();
</script>

<svelte:head><title>Iniciar sesión · Infrastructure as Code</title></svelte:head
>
<main class="auth-page">
  <section class="panel auth-card">
    <div class="brand">
      <img
        class="brand-mark-image"
        src="/branding/iacp-mark.svg"
        alt="IACP Operation Center"
      />
      <div>Infrastructure as Code<small>Operation Center</small></div>
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
  <div class="auth-visual" aria-label="IACP Operation Center">
    <img
      src="/branding/iacp-operation-center.webp"
      alt="IACP Operation Center: orquestador, workers, KVM, LXC e infraestructura conectada"
      width="1254"
      height="1254"
      loading="eager"
      decoding="async"
    />
    <div class="auth-visual-caption">
      <strong>Orchestrate · Provision · Observe · Operate</strong>
      <span>Centro de operaciones de infraestructura</span>
    </div>
  </div>
</main>
