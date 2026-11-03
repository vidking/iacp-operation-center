import {
  ArrowUpRight,
  CircleAlert,
  ChevronDown,
  Clock3,
  Command,
  LogIn,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { GlassSurface, StatusDot } from '@iacoc/ui';
import { apiClient } from '@iacoc/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { navigationItems } from './navigation';
import { useSession, useSettings } from './query';

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="app-shell">
      <PreferenceApplier />
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

function PreferenceApplier() {
  const session = useSession();
  const settings = useSettings(Boolean(session.data?.authenticated));

  useEffect(() => {
    const theme = window.localStorage.getItem('iacoc-v2-theme');
    const fontScale = window.localStorage.getItem('iacoc-v2-font-scale');
    const density = window.localStorage.getItem('iacoc-v2-density');
    const reducedMotion = window.localStorage.getItem('iacoc-v2-reduced-motion');
    if (theme === 'graphite' || theme === 'light') document.documentElement.dataset.theme = theme;
    if (
      fontScale === 'compact' ||
      fontScale === 'normal' ||
      fontScale === 'large' ||
      fontScale === 'xlarge'
    ) {
      document.documentElement.dataset.fontScale = fontScale;
    }
    if (density === 'compact' || density === 'comfortable') {
      document.documentElement.dataset.density = density;
    }
    if (reducedMotion === 'true') document.documentElement.dataset.reducedMotion = 'true';
  }, []);

  useEffect(() => {
    if (!settings.data) return;
    document.documentElement.dataset.theme = settings.data.theme;
    document.documentElement.dataset.fontScale = settings.data.fontScale;
    document.documentElement.dataset.density = settings.data.density ?? 'comfortable';
    document.documentElement.dataset.reducedMotion = settings.data.reducedMotion ? 'true' : 'false';
    window.localStorage.setItem('iacoc-v2-theme', settings.data.theme);
    window.localStorage.setItem('iacoc-v2-font-scale', settings.data.fontScale);
    window.localStorage.setItem('iacoc-v2-density', settings.data.density ?? 'comfortable');
    window.localStorage.setItem(
      'iacoc-v2-reduced-motion',
      settings.data.reducedMotion ? 'true' : 'false',
    );
    window.localStorage.setItem(
      'iacoc-v2-refresh-interval',
      settings.data.refreshIntervalSeconds ?? '5',
    );
  }, [settings.data]);
  return null;
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
      <img
        src="/branding/cyberfuel-wordmark.svg"
        alt="Cyberfuel.com"
        className="cyberfuel-wordmark"
      />
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
  const settings = useSettings(Boolean(data?.authenticated));
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

  async function toggleTheme() {
    const next = theme === 'graphite' ? 'light' : 'graphite';
    setTheme(next);
    if (data?.csrfToken) {
      try {
        await apiClient.updateSettings({ theme: next }, data.csrfToken);
        await settings.refetch();
      } catch {
        // The local preference remains usable when the settings write is unavailable.
      }
    }
  }

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
        <button className="popover-action" onClick={() => void toggleTheme()}>
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
  onRefresh,
  children,
}: PropsWithChildren<{
  eyebrow: string;
  title: string;
  description: string;
  onRefresh?: () => void | Promise<unknown>;
}>) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  async function refreshPage() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (onRefresh) await onRefresh();
      else await queryClient.invalidateQueries({ type: 'active' });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="page-frame">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <button
          className="page-heading-mark page-refresh-button"
          type="button"
          aria-label={refreshing ? 'Actualizando datos' : 'Actualizar datos de esta vista'}
          title="Actualizar datos de esta vista"
          disabled={refreshing}
          onClick={() => void refreshPage()}
        >
          <RefreshCw size={16} className={refreshing ? 'refresh-spin' : undefined} />
          <span>{refreshing ? 'Actualizando' : 'Actualizar'}</span>
        </button>
      </div>
      {children}
    </div>
  );
}

export function DetailModal({
  open,
  title,
  subtitle,
  onClose,
  children,
  className = '',
}: PropsWithChildren<{
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  className?: string;
}>) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="detail-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            className={['detail-modal', className].filter(Boolean).join(' ')}
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.985 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div className="detail-modal-header">
              <div>
                <span className="eyebrow">DETALLE OPERATIVO</span>
                <h2 id="detail-modal-title">{title}</h2>
                {subtitle ? <p>{subtitle}</p> : null}
              </div>
              <button
                ref={closeButtonRef}
                className="icon-button"
                type="button"
                aria-label="Cerrar detalle"
                onClick={onClose}
              >
                <X size={17} />
              </button>
            </div>
            <div className="detail-modal-body">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function FreshnessIndicator({
  updatedAt,
  fetching = false,
  label = 'evidencia',
}: {
  updatedAt?: number;
  fetching?: boolean;
  label?: string;
}) {
  const age = updatedAt ? Math.max(0, Math.round((Date.now() - updatedAt) / 1000)) : null;
  const text = fetching
    ? `Actualizando ${label}…`
    : age === null
      ? `Sin ${label}`
      : age < 5
        ? `${label} actualizada ahora`
        : `${label} hace ${age}s`;
  return (
    <span className={['freshness-indicator', fetching ? 'freshness-fetching' : ''].join(' ')}>
      <span aria-hidden="true" />
      {text}
    </span>
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

export function EvidenceState({
  title = 'Sin evidencia publicada',
  reason,
  tone = 'neutral',
}: {
  title?: string;
  reason: string;
  tone?: 'neutral' | 'warning' | 'error';
}) {
  return (
    <div className={['evidence-state', `evidence-state-${tone}`].join(' ')} role="status">
      {tone === 'error' ? <CircleAlert size={18} /> : <Clock3 size={18} />}
      <div>
        <strong>{title}</strong>
        <span>{reason}</span>
      </div>
    </div>
  );
}

export function WorkspaceLayout() {
  return <AppShell />;
}
