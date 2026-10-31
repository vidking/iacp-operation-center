import {
  ArrowUpRight,
  ChevronDown,
  Clock3,
  Command,
  DatabaseZap,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { GlassSurface, StatusDot } from '@iacoc/ui';
import { apiClient } from '@iacoc/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { navigationItems } from './navigation';
import { useSession } from './query';

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="app-shell">
      <button
        className="mobile-menu-button"
        aria-label="Abrir navegación"
        onClick={() => setMobileOpen((open) => !open)}
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>
      <Sidebar mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
      <div className="shell-main">
        <Topbar />
        <main className="page-region">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}

function Sidebar({ mobileOpen, onNavigate }: { mobileOpen: boolean; onNavigate: () => void }) {
  const navigate = useNavigate();
  const grouped = useMemo(
    () => ({
      Workspace: navigationItems.filter((item) => item.section === 'Workspace'),
      Administration: navigationItems.filter((item) => item.section === 'Administration'),
    }),
    [],
  );
  return (
    <aside className={['sidebar', mobileOpen ? 'sidebar-open' : ''].join(' ')}>
      <div className="brand-block">
        <img src="/branding/iacp-mark.svg" alt="" className="brand-mark" />
        <div>
          <strong>Infrastructure as Code</strong>
          <span>Operation Center</span>
        </div>
      </div>
      <div className="connection-card">
        <span className="connection-avatar">CF</span>
        <div>
          <strong>Cyberfuel</strong>
          <span>Operation Center</span>
        </div>
        <span className="eyebrow">V2</span>
      </div>
      {Object.entries(grouped).map(([section, items]) => (
        <nav className="nav-group" aria-label={section} key={section}>
          <span className="nav-label">{section}</span>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to as never}
                activeProps={{ className: 'nav-item nav-item-active' }}
                inactiveProps={{ className: 'nav-item' }}
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate();
                  void navigate({ to: item.to as never });
                }}
              >
                <Icon size={16} strokeWidth={1.8} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      ))}
      <div className="sidebar-footer">
        <div className="integrity-card">
          <ShieldCheck size={16} />
          <div>
            <strong>Runtime real</strong>
            <span>Sin fixtures en producción</span>
          </div>
        </div>
        <span className="version-caption">V2 · API-first</span>
      </div>
    </aside>
  );
}

function Topbar() {
  const { data, isPending } = useSession();
  return (
    <header className="topbar">
      <div className="breadcrumbs">
        <span>Operation Center</span>
        <span className="breadcrumb-separator">/</span>
        <strong>Infrastructure as Code</strong>
      </div>
      <div className="topbar-actions">
        <button
          className="command-trigger"
          onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
        >
          <Search size={15} />
          <span>Buscar...</span>
          <kbd>⌘ K</kbd>
        </button>
        <span className="connection-indicator">
          <StatusDot tone={data?.authenticated ? 'success' : 'muted'} />
          {isPending ? 'Verificando sesión' : data?.authenticated ? 'Sesión activa' : 'Sin sesión'}
        </span>
        <ProfileMenu />
      </div>
    </header>
  );
}

function ProfileMenu() {
  const { data } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'graphite'>(() => {
    if (typeof window === 'undefined') return 'graphite';
    return (window.localStorage.getItem('iacoc-v2-theme') as 'light' | 'graphite') ?? 'graphite';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('iacoc-v2-theme', theme);
  }, [theme]);

  async function logout() {
    if (data?.csrfToken) await apiClient.logout(data.csrfToken);
    await queryClient.invalidateQueries({ queryKey: ['session'] });
    await navigate({ to: '/login' });
  }

  return (
    <details className="profile-menu">
      <summary aria-label="Abrir menú de perfil">
        <span className="profile-avatar">
          {data?.user?.username.slice(0, 2).toUpperCase() ?? '—'}
        </span>
        <ChevronDown size={14} />
      </summary>
      <div className="profile-popover">
        <div className="profile-heading">
          <strong>{data?.user?.username ?? 'Sesión local'}</strong>
          <span>{data?.user?.role ?? 'Autenticación requerida'}</span>
        </div>
        <button
          className="popover-action"
          onClick={() => setTheme(theme === 'graphite' ? 'light' : 'graphite')}
        >
          {theme === 'graphite' ? <Sun size={15} /> : <Moon size={15} />}
          Tema {theme === 'graphite' ? 'Glass Light' : 'Graphite Glass'}
        </button>
        {data?.authenticated ? (
          <button className="popover-action" onClick={logout}>
            <LogOut size={15} />
            Cerrar sesión
          </button>
        ) : (
          <button className="popover-action" onClick={() => navigate({ to: '/login' })}>
            <LogIn size={15} />
            Iniciar sesión
          </button>
        )}
      </div>
    </details>
  );
}

function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const items = navigationItems.filter((item) =>
    item.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );

  useEffect(() => {
    const openPalette = () => setOpen(true);
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('open-command-palette', openPalette);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('open-command-palette', openPalette);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  if (!open) return null;
  return (
    <div className="command-overlay" role="presentation" onMouseDown={() => setOpen(false)}>
      <div
        className="command-dialog"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-search">
          <Command size={17} />
          <input
            autoFocus
            value={search}
            placeholder="Ir a un módulo..."
            onChange={(event) => setSearch(event.target.value)}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="command-results">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.to}
                className="command-result"
                onClick={() => {
                  setOpen(false);
                  setSearch('');
                  navigate({ to: item.to as never });
                }}
              >
                <Icon size={16} />
                <span>{item.label}</span>
                <ArrowUpRight size={14} />
              </button>
            );
          })}
          {items.length === 0 ? <p className="empty-inline">No hay módulos coincidentes.</p> : null}
        </div>
      </div>
    </div>
  );
}

export function PageFrame({
  eyebrow,
  title,
  description,
  children,
}: PropsWithChildren<{ eyebrow: string; title: string; description: string }>) {
  return (
    <div className="page-frame">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="page-heading-mark">
          <DatabaseZap size={20} />
        </div>
      </div>
      {children}
    </div>
  );
}

export function LoginRequired() {
  const navigate = useNavigate();
  return (
    <GlassSurface className="empty-state">
      <ShieldCheck size={30} />
      <h2>Sesión requerida</h2>
      <p>Las rutas operativas requieren una sesión local autenticada.</p>
      <button className="button button-primary" onClick={() => navigate({ to: '/login' })}>
        Iniciar sesión
      </button>
    </GlassSurface>
  );
}

export function LoadingState({ label = 'Cargando estructura...' }: { label?: string }) {
  return (
    <GlassSurface className="loading-state">
      <div className="loading-orb" />
      <span>{label}</span>
    </GlassSurface>
  );
}

export function UnavailableState({ reason }: { reason: string }) {
  return (
    <GlassSurface className="empty-state">
      <Clock3 size={28} />
      <h2>Capacidad no disponible</h2>
      <p>{reason}</p>
      <span className="state-note">No mostramos datos sintéticos ni inferimos salud remota.</span>
    </GlassSurface>
  );
}

export function WorkspaceLayout() {
  return <AppShell />;
}
