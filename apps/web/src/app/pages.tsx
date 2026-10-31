import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  CheckCircle2,
  CircleOff,
  LockKeyhole,
  PlugZap,
  Server,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { GlassSurface } from '@iacoc/ui';
import { apiClient } from '@iacoc/api-client';
import { useConnections, useOverview, useSession } from './query';
import { LoginRequired, PageFrame, UnavailableState } from './components';

type LoginForm = { username: string; password: string };

export function HomeRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: '/app/overview', replace: true });
  }, [navigate]);
  return null;
}

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useStateMessage();
  const { register, handleSubmit, formState } = useForm<LoginForm>();

  async function submit(values: LoginForm) {
    setError(null);
    try {
      await apiClient.login(values.username, values.password);
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      await navigate({ to: '/app/overview' });
    } catch {
      setError('No fue posible iniciar sesión. Verifica la identidad local autorizada.');
    }
  }

  return (
    <div className="login-shell">
      <div className="login-brand">
        <img src="/branding/iacp-mark.svg" alt="" className="brand-mark large" />
        <span className="eyebrow">Infrastructure as Code</span>
        <h1>Operation Center</h1>
        <p>Una consola técnica para observar y solicitar acciones autorizadas por IACP.</p>
      </div>
      <GlassSurface className="login-card">
        <div className="card-icon">
          <LockKeyhole size={20} />
        </div>
        <span className="eyebrow">Sesión local</span>
        <h2>Entrar al workspace</h2>
        <p className="muted-copy">
          No existen usuarios predeterminados. Usa una identidad creada por el administrador.
        </p>
        <form onSubmit={handleSubmit(submit)} className="form-stack">
          <label>
            Usuario
            <input {...register('username', { required: true })} autoComplete="username" />
          </label>
          <label>
            Contraseña
            <input
              {...register('password', { required: true })}
              type="password"
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="button button-primary" disabled={formState.isSubmitting} type="submit">
            {formState.isSubmitting ? 'Validando...' : 'Continuar'}
          </button>
        </form>
      </GlassSurface>
    </div>
  );
}

function useStateMessage() {
  const [value, setValue] = useState<string | null>(null);
  return [value, setValue] as const;
}

export function OverviewPage() {
  const session = useSession();
  const overview = useOverview(Boolean(session.data?.authenticated));
  if (session.isPending)
    return (
      <PageFrame
        eyebrow="COMMAND CENTER"
        title="Overview"
        description="Estado real de la plataforma."
      >
        <div className="module-grid">
          <GlassSurface className="loading-state">
            <span>Verificando sesión...</span>
          </GlassSurface>
        </div>
      </PageFrame>
    );
  if (!session.data?.authenticated)
    return (
      <PageFrame
        eyebrow="COMMAND CENTER"
        title="Overview"
        description="Estado real de la plataforma."
      >
        <LoginRequired />
      </PageFrame>
    );
  if (overview.isPending)
    return (
      <PageFrame
        eyebrow="COMMAND CENTER"
        title="Overview"
        description="Estado real de la plataforma."
      >
        <div className="module-grid">
          <GlassSurface className="loading-state">
            <span>Cargando evidencia autorizada...</span>
          </GlassSurface>
        </div>
      </PageFrame>
    );
  if (overview.isError || !overview.data)
    return (
      <PageFrame
        eyebrow="COMMAND CENTER"
        title="Overview"
        description="Estado real de la plataforma."
      >
        <UnavailableState reason="No fue posible obtener evidencia de IACP. La aplicación no convierte el error en datos simulados." />
      </PageFrame>
    );
  const connected =
    overview.data.connectionState === 'active' ||
    overview.data.connectionState === 'active-partial';
  return (
    <PageFrame
      eyebrow="COMMAND CENTER"
      title="Overview"
      description="Estado real de la plataforma, con carga progresiva y evidencia fechada."
    >
      <div className="overview-layout">
        <GlassSurface className="hero-surface">
          <div className="hero-copy">
            <span className="eyebrow">Estado del workspace</span>
            <h2>{connected ? 'Conexión IACP activa' : 'Workspace desconectado'}</h2>
            <p>{overview.data.message}</p>
          </div>
          <div className={['hero-status', connected ? 'hero-status-live' : ''].join(' ')}>
            {connected ? <CheckCircle2 size={28} /> : <CircleOff size={28} />}
            <span>{connected ? 'Evidencia parcial' : 'Sin alcance remoto'}</span>
          </div>
        </GlassSurface>
        <div className="metric-grid">
          <MetricCard
            icon={<Server size={18} />}
            label="Fuente seleccionada"
            value={overview.data.source?.name ?? 'Ninguna'}
          />
          <MetricCard
            icon={<Sparkles size={18} />}
            label="Operaciones activas"
            value={
              overview.data.activeOperations === null
                ? 'Desconocido'
                : String(overview.data.activeOperations)
            }
          />
          <MetricCard
            icon={<CircleOff size={18} />}
            label="Incidentes"
            value={
              overview.data.incidents === null ? 'Desconocido' : String(overview.data.incidents)
            }
          />
        </div>
        <GlassSurface className="activity-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Evidencia</span>
              <h3>Lectura honesta del sistema</h3>
            </div>
            <ArrowUpRight size={18} />
          </div>
          <div className="evidence-list">
            <EvidenceRow
              label="Dependencias"
              value={
                overview.data.source?.dependencies === 'published' ? 'Publicado' : 'No publicado'
              }
            />
            <EvidenceRow
              label="Tenant remoto"
              value={
                overview.data.source?.tenantPublished
                  ? (overview.data.source.tenantId ?? 'Publicado sin ID')
                  : 'No publicado'
              }
            />
            <EvidenceRow
              label="Última evidencia"
              value={overview.data.lastEvidenceAt ?? 'No publicada'}
            />
          </div>
        </GlassSurface>
      </div>
    </PageFrame>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <GlassSurface className="metric-card" interactive>
      <span className="metric-icon">{icon}</span>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
    </GlassSurface>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="evidence-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const modules = {
  instances: ['INVENTORY', 'Instances', 'Inventario técnico publicado por IACP.'],
  provisioning: [
    'CONTROL PLANE',
    'Provisioning',
    'Solicitudes técnicas sujetas al contrato OpenAPI y a las decisiones de IACP.',
  ],
  operations: ['AUDIT TRAIL', 'Operations', 'Historial global de operaciones, estados y fases.'],
  events: ['EVENT STREAM', 'Events', 'Feed incremental de eventos auditables con correlación.'],
  workers: [
    'TELEMETRY',
    'Workers & Queues',
    'Representación de Control Plane, queues y workers sin inferencias.',
  ],
  incidents: [
    'RECOVERY',
    'Incidents & Recovery',
    'Diagnóstico y recuperación autorizada de estados inciertos.',
  ],
  users: [
    'ADMINISTRATION',
    'Users & Access',
    'Identidades locales y permisos efectivos del tenant.',
  ],
  settings: [
    'PREFERENCES',
    'Settings',
    'Preferencias de usuario y configuración funcional segura.',
  ],
} as const;

export function ModulePage({ module }: { module: keyof typeof modules }) {
  const session = useSession();
  const [eyebrow, title, description] = modules[module];
  return (
    <PageFrame eyebrow={eyebrow} title={title} description={description}>
      {!session.data?.authenticated && !session.isPending ? (
        <LoginRequired />
      ) : (
        <UnavailableState reason="La ruta y el shell ya están disponibles. La capacidad aparece aquí únicamente cuando IACP la publique y la sesión tenga permiso." />
      )}
    </PageFrame>
  );
}

export function ConnectorsPage() {
  const session = useSession();
  const connections = useConnections(Boolean(session.data?.authenticated));
  return (
    <PageFrame
      eyebrow="ADMINISTRATION"
      title="Connectors"
      description="Fuentes IACP seleccionables, validadas y protegidas por el BFF."
    >
      {!session.data?.authenticated && !session.isPending ? (
        <LoginRequired />
      ) : connections.isPending ? (
        <UnavailableState reason="Cargando conexiones autorizadas..." />
      ) : (
        <div className="connector-layout">
          <GlassSurface className="connector-intro">
            <div className="card-icon">
              <PlugZap size={20} />
            </div>
            <h2>Selector de fuente</h2>
            <p>
              Podemos registrar varias conexiones IACP, pero cada vista usa una sola fuente
              seleccionada. No combinamos tenants ni inventamos alcance.
            </p>
          </GlassSurface>
          <GlassSurface className="connector-list">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">FUENTES REGISTRADAS</span>
                <h3>{connections.data?.length ?? 0} conexiones</h3>
              </div>
            </div>
            {(connections.data?.length ?? 0) === 0 ? (
              <div className="empty-inline">
                <PlugZap size={18} />
                <span>No hay una conexión IACP configurada.</span>
              </div>
            ) : (
              connections.data?.map((connection) => (
                <div className="connector-row" key={connection.id}>
                  <span className="connection-avatar">I</span>
                  <div>
                    <strong>{connection.name}</strong>
                    <span>{connection.endpoint}</span>
                  </div>
                  <span className="status-chip">{connection.status}</span>
                </div>
              ))
            )}
          </GlassSurface>
        </div>
      )}
    </PageFrame>
  );
}
