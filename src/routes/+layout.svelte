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
    ShieldCheck,
    PanelLeftClose,
    Settings2,
    LogOut,
  } from "@lucide/svelte";
  import {
    notification,
    notify,
    selectedOperation,
  } from "#lib/stores/portal.ts";
  import { stateLabels } from "#lib/types/connection-state.ts";
  let { children, data } = $props();
  let menu = $state(false);
  let alerts = $state(false);
  let search = $state("");
  let searchInput = $state<HTMLInputElement>();
  const links = [
    { href: "/", icon: LayoutDashboard, label: "Overview" },
    { href: "/operations", icon: Workflow, label: "Operations" },
    { href: "/events", icon: Radio, label: "Events" },
    { href: "/workers", icon: Cpu, label: "Workers & Queues" },
    { href: "/incidents", icon: ShieldAlert, label: "Incidents & Recovery" },
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
{#if page.url.pathname === "/login"}
  {@render children()}
{:else}
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
        <div>
          Cyberfuel<small>Operations Center</small>
        </div>
        <span class="workspace-tag">IACP</span>
      </div>
      <div class="nav-label">WORKSPACE</div>
      <nav aria-label="Navegación principal">
        {#each links as link}<a
            href={link.href}
            class:selected={page.url.pathname === link.href}
            aria-label={link.label}
            aria-current={page.url.pathname === link.href ? "page" : undefined}
            ><link.icon size={18} strokeWidth={1.65} /><span>{link.label}</span
            ></a
          >{/each}
      </nav>
      {#if data.user?.role === "Administrator"}<div
          class="nav-label integration-label"
        >
          ADMINISTRATION
        </div>
        <nav aria-label="Administración">
          <a
            href="/administration/connections"
            class:selected={page.url.pathname === "/administration/connections"}
            ><Settings2 size={18} /><span>API Connections</span></a
          >
        </nav>{/if}
      <div class="sidebar-bottom">
        <div class="sandbox-note">
          <ShieldCheck size={18} />
          <div>
            <strong>Observación autorizada</strong>
            <p>Acceso de lectura a la evidencia del Control Plane.</p>
          </div>
        </div>
        <button
          class="sidebar-help"
          onclick={() =>
            notify(
              "Guía local: consulta README.md y docs/PRODUCTION_050.md en el repositorio.",
            )}
          ><BookOpen size={16} /><span>Guía del workspace</span><ArrowUpRight
            size={13}
          /></button
        >
        <div class="sidebar-user">
          <span class="avatar">CF</span>
          <div>
            {data.user?.username}<small>{data.user?.role}</small>
          </div>
          <form method="POST" action="/logout">
            <input type="hidden" name="_csrf" value={data.csrf} /><button
              class="icon-button"
              aria-label="Cerrar sesión"><LogOut size={15} /></button
            >
          </form>
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
          <span class="environment-label"
            ><i></i>
            {stateLabels[data.status]}
          </span>
          <div class="notification-anchor">
            <button
              class="icon-button notification-button"
              aria-label="Ver notificaciones"
              aria-expanded={alerts}
              onclick={() => (alerts = !alerts)}><Bell size={18} /></button
            >
            {#if alerts}<section
                class="notification-panel"
                aria-label="Notificaciones"
              >
                <div><strong>Señales observadas</strong></div>
                {#each data.operations.filter( (o) => ["failed", "uncertain"].includes(o.normalized_status) ) as operation}
                  <a href="/incidents"
                    ><ShieldAlert size={17} /><span
                      >{operation.error_code ?? operation.kind}<small
                        >{operation.operation_id}</small
                      ></span
                    ></a
                  >
                {:else}<p class="panel-note">
                    No hay señales en la página consultada.
                  </p>{/each}
              </section>{/if}
          </div>
          <span class="avatar header-avatar">CF</span>
        </div>
      </header>
      <main>{@render children()}</main>
    </div>
  </div>
  {#if $notification}<div class="toast" role="status">
      <span class="toast-icon"><ShieldCheck size={18} /></span>
      <p>{$notification}</p>
      <button
        class="icon-button"
        aria-label="Cerrar notificación"
        onclick={() => notification.set(null)}><X size={15} /></button
      >
    </div>{/if}
{/if}
