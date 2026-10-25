<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";
  import { goto, afterNavigate } from "$app/navigation";
  import {
    LayoutDashboard,
    Workflow,
    Radio,
    Cpu,
    ShieldAlert,
    ShoppingBag,
    Menu,
    X,
    Search,
    Bell,
    ChevronRight,
    ChevronDown,
    Hexagon,
    BookOpen,
    ArrowUpRight,
    Command,
    FlaskConical,
    PanelLeftClose,
  } from "@lucide/svelte";
  import {
    notification,
    notify,
    selectedOperation,
  } from "#lib/stores/portal.ts";
  let { children } = $props();
  let menu = $state(false);
  let alerts = $state(false);
  let search = $state("");
  let searchInput: HTMLInputElement;
  const links = [
    { href: "/", icon: LayoutDashboard, label: "Overview" },
    { href: "/operations", icon: Workflow, label: "Operations" },
    { href: "/events", icon: Radio, label: "Events" },
    { href: "/workers", icon: Cpu, label: "Workers & Queues" },
    { href: "/incidents", icon: ShieldAlert, label: "Incidents & Recovery" },
    { href: "/crm", icon: ShoppingBag, label: "CRM Simulator" },
  ];
  let current = $derived(
    links.find((l) => l.href === page.url.pathname)?.label ?? "IaCoC",
  );
  afterNavigate(() => {
    menu = false;
    alerts = false;
    selectedOperation.set(null);
  });
  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (search.trim())
      goto(`/operations?q=${encodeURIComponent(search.trim())}`);
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      searchInput?.focus();
    }
    if (e.key === "Escape") {
      menu = false;
      alerts = false;
    }
  }}
/>
<div class="shell">
  {#if menu}<button
      class="nav-backdrop"
      aria-label="Cerrar navegación"
      onclick={() => (menu = false)}
    ></button>{/if}
  <aside class:open={menu}>
    <a href="/" class="brand"
      ><span class="brand-mark"
        ><Hexagon size={31} strokeWidth={1.5} /><span></span></span
      >
      <div>IaCoC<small>INFRASTRUCTURE OPERATIONS</small></div></a
    >
    <div class="workspace">
      <span class="workspace-avatar">CF</span>
      <div>Cyberfuel<small>Sandbox workspace</small></div>
      <span class="demo-tag">DEMO</span>
    </div>
    <div class="nav-label">WORKSPACE</div>
    <nav aria-label="Navegación principal">
      {#each links as link, i}{#if i === 5}<div
            class="nav-label integration-label"
          >
            ECOSISTEMA
          </div>{/if}<a
          href={link.href}
          class:selected={page.url.pathname === link.href}
          aria-label={link.label}
          aria-current={page.url.pathname === link.href ? "page" : undefined}
          ><link.icon size={18} strokeWidth={1.65} /><span>{link.label}</span
          >{#if i === 4}<span class="nav-count">2</span>{/if}{#if i === 5}<span
              class="nav-demo">DEMO</span
            >{/if}</a
        >{/each}
    </nav>
    <div class="sidebar-bottom">
      <div class="sandbox-note">
        <FlaskConical size={18} />
        <div>
          <strong>Explora con confianza</strong>
          <p>Un entorno visual sin acciones sobre infraestructura.</p>
        </div>
      </div>
      <button
        class="sidebar-help"
        onclick={() =>
          notify(
            "Guía local: consulta README.md y docs/FRONTEND.md en el repositorio.",
          )}
        ><BookOpen size={16} /><span>Guía del workspace</span><ArrowUpRight
          size={13}
        /></button
      >
      <div class="sidebar-user">
        <span class="avatar">CF</span>
        <div>Cyberfuel Team<small>Sesión de demostración</small></div>
        <span class="tiny-dot"></span>
      </div>
    </div>
  </aside>
  <div class="main-shell">
    <header>
      <div class="flex items-center gap-3">
        <button
          class="icon-button menu-toggle"
          aria-label="Abrir navegación"
          aria-expanded={menu}
          onclick={() => (menu = !menu)}><Menu size={21} /></button
        ><span class="desktop-brand">Workspace</span><ChevronRight
          size={13}
          class="muted"
        /><strong class="breadcrumb-current">{current}</strong>
      </div>
      <div class="header-right">
        <form class="global-search" onsubmit={submit}>
          <Search size={14} /><input
            bind:this={searchInput}
            bind:value={search}
            aria-label="Buscar en operaciones"
            placeholder="Buscar operaciones…"
          /><kbd>⌘ K</kbd>
        </form>
        <span class="environment-label"><i></i> Sandbox <span>MOCK</span></span>
        <div class="notification-anchor">
          <button
            class="icon-button notification-button"
            aria-label="Ver notificaciones DEMO"
            aria-expanded={alerts}
            onclick={() => (alerts = !alerts)}
            ><Bell size={18} /><span></span></button
          >{#if alerts}<section
              class="notification-panel"
              aria-label="Notificaciones"
            >
              <div>
                <strong>Notificaciones</strong><span class="demo-tag">DEMO</span
                >
              </div>
              <a href="/incidents"
                ><ShieldAlert size={17} /><span
                  >Una operación incierta<small
                    >Revisa la evidencia de demo-op-003</small
                  ></span
                ></a
              ><a href="/incidents"
                ><Radio size={17} /><span
                  >Error de planificación<small
                    >Muestra local · demo-op-006</small
                  ></span
                ></a
              >
            </section>{/if}
        </div>
        <span class="avatar header-avatar">CF</span>
      </div>
    </header>
    <main>{@render children()}</main>
  </div>
</div>
{#if $notification}<div class="toast" role="status">
    <span class="toast-icon"><FlaskConical size={18} /></span>
    <p>{$notification}</p>
    <button
      class="icon-button"
      aria-label="Cerrar notificación"
      onclick={() => notification.set(null)}><X size={15} /></button
    >
  </div>{/if}
