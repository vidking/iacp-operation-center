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
    Hexagon,
    BookOpen,
    ArrowUpRight,
    Command,
    ShieldCheck,
    Settings2,
    LogOut,
    UserRound,
    UsersRound,
  } from "@lucide/svelte";
  import {
    notification,
    notify,
    selectedOperation,
  } from "#lib/stores/portal.ts";
  import { stateLabels } from "#lib/types/connection-state.ts";
  import { roleLabels } from "#lib/types/security.ts";
  let { children, data } = $props();
  let menu = $state(false);
  let alerts = $state(false);
  let profileOpen = $state(false);
  let paletteOpen = $state(false);
  let search = $state("");
  let searchInput = $state<HTMLInputElement>();
  let searchBusy = $state(false),
    searchError = $state(""),
    searchResults = $state<{
      operations: { id: string; label: string; detail: string; href: string }[];
      events: { id: string; label: string; detail: string; href: string }[];
      links: { href: string; label: string }[];
    }>({ operations: [], events: [], links: [] });
  let searchController: AbortController | null = null;
  const links = [
    { href: "/", icon: LayoutDashboard, label: "Overview" },
    { href: "/operations", icon: Workflow, label: "Operations" },
    { href: "/events", icon: Radio, label: "Events" },
    { href: "/workers", icon: Cpu, label: "Workers & Queues" },
    { href: "/incidents", icon: ShieldAlert, label: "Incidents & Recovery" },
    { href: "/crm", icon: Hexagon, label: "CRM Simulator" },
  ];
  let current = $derived(
    links.find((l) => l.href === page.url.pathname)?.label ??
      "Infrastructure as Code",
  );
  afterNavigate(() => {
    menu = false;
    alerts = false;
    profileOpen = false;
    paletteOpen = false;
    selectedOperation.set(null);
  });
  function initials() {
    const value = data.user?.displayName ?? data.user?.username ?? "CF";
    return value.slice(0, 2).toUpperCase();
  }
  function openPalette() {
    paletteOpen = true;
    profileOpen = false;
    setTimeout(() => searchInput?.focus(), 0);
  }
  async function searchRemote() {
    searchController?.abort();
    if (!search.trim()) {
      searchResults = { operations: [], events: [], links: [] };
      searchError = "";
      return;
    }
    const controller = new AbortController();
    searchController = controller;
    searchBusy = true;
    searchError = "";
    try {
      const response = await fetch(
        "/api/search?q=" + encodeURIComponent(search.trim()),
        {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        },
      );
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "SEARCH_FAILED");
      searchResults = value;
    } catch (error) {
      if (!controller.signal.aborted)
        searchError = error instanceof Error ? error.message : "SEARCH_FAILED";
    } finally {
      if (searchController === controller) searchBusy = false;
    }
  }
  $effect(() => {
    if (!paletteOpen) return;
    const timer = setTimeout(() => void searchRemote(), 180);
    return () => clearTimeout(timer);
  });
  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (search.trim()) {
      paletteOpen = false;
      goto(`/operations?q=${encodeURIComponent(search.trim())}`);
    }
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPalette();
    }
    if (e.key === "Escape") {
      menu = false;
      alerts = false;
      profileOpen = false;
      paletteOpen = false;
    }
  }}
/>
{#if page.url.pathname === "/login"}
  {@render children()}
{:else}
  <a class="skip-link" href="#main-content">Saltar al contenido principal</a>
  <div class="shell">
    {#if menu}<button
        class="nav-backdrop"
        aria-label="Cerrar navegación"
        onclick={() => (menu = false)}
      ></button>{/if}
    <aside class:open={menu} aria-label="Navegación del Operation Center">
      <a href="/" class="brand"
        ><img
          class="brand-mark-image"
          src="/branding/iacp-mark.svg"
          alt=""
          aria-hidden="true"
        />
        <div>Infrastructure as Code<small>Operation Center</small></div></a
      >
      <div class="sidebar-scroll">
        <div class="workspace">
          <span class="workspace-avatar">CF</span>
          <div>
            Cyberfuel<small>Operation Center</small>
          </div>
          <span class="workspace-tag">CONECTORES</span>
        </div>
        <div class="nav-label">WORKSPACE</div>
        <nav aria-label="Navegación principal">
          {#each links as link}<a
              href={link.href}
              class:selected={page.url.pathname === link.href}
              aria-label={link.label}
              aria-current={page.url.pathname === link.href
                ? "page"
                : undefined}
              ><link.icon size={18} strokeWidth={1.65} /><span
                >{link.label}</span
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
              class:selected={page.url.pathname ===
                "/administration/connections"}
              ><Settings2 size={18} /><span>Conectores</span></a
            ><a
              href="/administration/users"
              class:selected={page.url.pathname === "/administration/users"}
              ><UsersRound size={18} /><span>Usuarios y permisos</span></a
            ><a
              href="/administration/settings"
              class:selected={page.url.pathname === "/administration/settings"}
              ><Settings2 size={18} /><span>Configuración</span></a
            >
          </nav>{/if}
      </div>
      <div class="sidebar-bottom">
        <div class="sandbox-note">
          <ShieldCheck size={18} />
          <div>
            <strong>{stateLabels[data.status]}</strong>
            <p>Estado de la conexión y evidencia del workspace.</p>
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
          <span class="avatar">{initials()}</span>
          <div>
            {data.user?.displayName ?? data.user?.username}<small
              >{data.user ? roleLabels[data.user.role] : ""}</small
            >
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
          ><span class="desktop-brand">Operation Center</span><ChevronRight
            size={13}
            class="muted"
          /><strong class="breadcrumb-current">{current}</strong>
        </div>
        <div class="header-right">
          <span
            class="topbar-brand"
            aria-label="Infrastructure as Code Operation Center"
            ><span>IaC</span>OC</span
          >
          <form class="global-search" onsubmit={submit}>
            <Search size={14} /><input
              bind:this={searchInput}
              bind:value={search}
              aria-label="Buscar en el workspace"
              placeholder="Buscar…"
              onfocus={() => (paletteOpen = true)}
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
          <div class="profile-anchor">
            <button
              class="avatar-button"
              aria-label="Abrir menú de perfil"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              onclick={() => {
                profileOpen = !profileOpen;
                paletteOpen = false;
              }}><span class="avatar header-avatar">{initials()}</span></button
            >
            {#if profileOpen}<div
                class="profile-menu"
                role="menu"
                aria-label="Menú de perfil"
              >
                <div class="profile-menu-heading">
                  <strong
                    >{data.user?.displayName ?? data.user?.username}</strong
                  ><small>{data.user ? roleLabels[data.user.role] : ""}</small>
                </div>
                <a href="/profile"><UserRound size={15} /> Mi perfil</a>
                {#if data.user?.role === "Administrator"}<a
                    href="/administration/users"
                    ><UsersRound size={15} /> Usuarios y permisos</a
                  ><a href="/administration/settings"
                    ><Settings2 size={15} /> Configuración</a
                  >{/if}
                <form method="POST" action="/logout">
                  <input type="hidden" name="_csrf" value={data.csrf} /><button
                    type="submit"><LogOut size={15} /> Cerrar sesión</button
                  >
                </form>
              </div>{/if}
          </div>
        </div>
      </header>
      {#if paletteOpen}<div
          class="palette-backdrop"
          role="presentation"
          onclick={(event) =>
            event.target === event.currentTarget && (paletteOpen = false)}
        >
          <div
            class="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Búsqueda global"
            tabindex="-1"
          >
            <div class="palette-search">
              <Command size={17} /><input
                bind:this={searchInput}
                bind:value={search}
                aria-label="Buscar en el workspace"
                placeholder="Operación, instancia, evento o sección…"
              />
            </div>
            {#if searchBusy}<p class="panel-note">
                Buscando en el tenant autorizado…
              </p>{:else if searchError}<p class="callout warning">
                {searchError}
              </p>{:else if !search.trim()}<p class="panel-note">
                Busca UUID, instancia, correlación o una sección. Escape cierra
                esta paleta.
              </p>{:else}
              {#if searchResults.links.length}<div class="palette-group">
                  <span>Secciones</span>{#each searchResults.links as result}<a
                      href={result.href}
                      onclick={() => (paletteOpen = false)}
                      ><ArrowUpRight size={14} />{result.label}</a
                    >{/each}
                </div>{/if}
              {#if searchResults.operations.length}<div class="palette-group">
                  <span>Operaciones</span
                  >{#each searchResults.operations as result}<a
                      href={result.href}
                      onclick={() => (paletteOpen = false)}
                      ><Workflow size={14} /><strong>{result.label}</strong
                      ><small>{result.detail}</small></a
                    >{/each}
                </div>{/if}
              {#if searchResults.events.length}<div class="palette-group">
                  <span>Eventos</span>{#each searchResults.events as result}<a
                      href={result.href}
                      onclick={() => (paletteOpen = false)}
                      ><Radio size={14} /><strong>{result.label}</strong><small
                        >{result.detail}</small
                      ></a
                    >{/each}
                </div>{/if}
              {#if !searchResults.links.length && !searchResults.operations.length && !searchResults.events.length}<p
                  class="panel-note"
                >
                  No se encontraron resultados en este workspace.
                </p>{/if}
            {/if}
          </div>
        </div>{/if}
      <main id="main-content" tabindex="-1">{@render children()}</main>
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
