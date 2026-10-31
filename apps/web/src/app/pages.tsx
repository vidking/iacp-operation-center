import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  Check,
  CheckCircle2,
  CircleOff,
  Clock3,
  Filter,
  LockKeyhole,
  MonitorCog,
  PlugZap,
  RefreshCw,
  Server,
  Settings2,
  Sparkles,
  UserRoundPlus,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { GlassSurface } from '@iacoc/ui';
import { ApiError, apiClient } from '@iacoc/api-client';
import type {
  Connection,
  ConnectionGrant,
  Density,
  FontScale,
  InstanceProvisionRequest,
  Role,
  Theme,
  User,
} from '@iacoc/contracts';
import {
  useConnections,
  useEvents,
  useIncidents,
  useImages,
  useInstances,
  useOperations,
  useOverview,
  usePlans,
  useSession,
  useSettings,
  useUsers,
  useWorkers,
} from './query';
import { EvidenceState, LoginRequired, PageFrame, UnavailableState } from './components';

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
        <EvidenceState
          title="Evidencia no disponible"
          tone="error"
          reason="No fue posible obtener evidencia de IACP. La aplicación no convierte el error en datos simulados."
        />
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
            label="Fuentes activas"
            value={String(overview.data.sources.length)}
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
                overview.data.sources.some((source) => source.dependencies === 'published')
                  ? 'Publicado'
                  : 'No publicado'
              }
            />
            <EvidenceRow
              label="Tenant remoto"
              value={
                overview.data.sources.length > 0
                  ? overview.data.sources.map((source) => source.name).join(', ')
                  : 'No publicada'
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
        <EvidenceState
          title="Datos no publicados"
          reason="La ruta está disponible; esta capacidad aparece cuando IACP la publique y la sesión tenga permiso."
        />
      )}
    </PageFrame>
  );
}

function useActiveConnectionId(connections: Connection[] | undefined) {
  const [connectionId, setConnectionId] = useState<string | null>(null);
  useEffect(() => {
    if (!connectionId || !connections?.some((connection) => connection.id === connectionId)) {
      setConnectionId(connections?.find((connection) => connection.active)?.id ?? null);
    }
  }, [connectionId, connections]);
  return [connectionId, setConnectionId] as const;
}

function ConnectionSelector({
  connections,
  value,
  onChange,
}: {
  connections: Connection[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  const active = connections.filter((connection) => connection.active);
  return (
    <label className="resource-selector">
      Fuente activa
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        <option value="" disabled>
          Selecciona una fuente
        </option>
        {active.map((connection) => (
          <option key={connection.id} value={connection.id}>
            {connection.name} · {connection.endpoint}
          </option>
        ))}
      </select>
    </label>
  );
}

function firstRemoteValue(item: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = item[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

function remoteText(item: Record<string, unknown>, keys: string[], fallback = 'No publicado') {
  const value = firstRemoteValue(item, keys);
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : fallback;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value === null ? fallback : String(value);
}

function formatRemoteDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'No publicado';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-CR');
}

function evidenceTimestamp(item: Record<string, unknown>): number {
  const value = firstRemoteValue(item, [
    'occurred_at',
    'updated_at',
    'finished_at',
    'created_at',
    'observed_at',
  ]);
  if (typeof value !== 'string') return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function newestFirst<T extends Record<string, unknown>>(items: T[]): T[] {
  return [...items].sort((left, right) => evidenceTimestamp(right) - evidenceTimestamp(left));
}

function humanize(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'Ejecución técnica';
  return value.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function operationTitle(item: Record<string, unknown>): string {
  const payload =
    item.payload && typeof item.payload === 'object'
      ? (item.payload as Record<string, unknown>)
      : null;
  const kind = String(
    firstRemoteValue(item, ['kind', 'operation', 'command', 'power_action', 'action']) ??
      firstRemoteValue(payload ?? {}, ['command', 'power_action', 'action']) ??
      '',
  );
  const code = String(firstRemoteValue(item, ['code', 'phase']) ?? '');
  const key = `${kind} ${code}`.toLowerCase();
  if (key.includes('network') && (key.includes('discover') || key.includes('query'))) {
    return 'Consultando red';
  }
  if (key.includes('network') && key.includes('initialize')) return 'Inicializando red';
  if (key.includes('power') && (key.includes('shutdown') || key.includes('stop'))) {
    return 'Apagando instancia';
  }
  if (key.includes('power') && key.includes('start')) return 'Encendiendo instancia';
  if (key.includes('power') && key.includes('reboot')) return 'Reiniciando instancia';
  if (key.includes('delete') || key.includes('destroy') || key.includes('elimin')) {
    return 'Eliminando instancia';
  }
  if (key.includes('create') || key.includes('provision') || key.includes('apply')) {
    return 'Aprovisionando instancia';
  }
  if (key.includes('plan')) return 'Preparando aprovisionamiento';
  if (key.includes('access') || key.includes('verify')) return 'Verificando acceso';
  if (key.includes('wait') || key.includes('pending')) return 'Esperando confirmación';
  if (!kind || ['no publicado', 'not published', 'unknown'].includes(kind.trim().toLowerCase())) {
    return code ? humanize(code) : 'Operación técnica';
  }
  return humanize(kind);
}

function publishedWorkerId(item: Record<string, unknown>): string | null {
  const value = firstRemoteValue(item, ['worker_id', 'workerId', 'worker']);
  return typeof value === 'string' && value ? value : null;
}

function normalizedStatus(item: Record<string, unknown>): string {
  return String(firstRemoteValue(item, ['normalized_status', 'status', 'phase']) ?? 'unknown');
}

function statusLabel(value: unknown): string {
  const status = String(value ?? 'unknown').toLowerCase();
  const labels: Record<string, string> = {
    ready: 'Lista',
    stopped: 'Apagada',
    running: 'Ejecutando',
    provisioning: 'Aprovisionando',
    pending: 'Pendiente',
    deleting: 'Eliminando',
    deleted: 'Eliminada',
    queued: 'En cola',
    completed: 'Completada',
    succeeded: 'Completada',
    success: 'Completada',
    failed: 'Fallida',
    uncertain: 'Incierta',
    stale: 'Obsoleta',
    unknown: 'Desconocida',
    idle: 'Disponible',
    healthy: 'Saludable',
  };
  return labels[status] ?? humanize(status);
}

function statusClass(value: unknown): string {
  const status = String(value ?? 'unknown').toLowerCase();
  if (['ready', 'running', 'completed', 'succeeded', 'success', 'healthy', 'idle'].includes(status))
    return 'state-good';
  if (['failed', 'uncertain', 'stale'].includes(status)) return 'state-bad';
  if (['queued', 'pending', 'provisioning', 'deleting'].includes(status)) return 'state-warn';
  return 'state-neutral';
}

function energyLabel(value: unknown): string {
  if (value === 'running') return 'Encendida';
  if (value === 'stopped') return 'Apagada';
  return statusLabel(value);
}

function ActiveConnectionRequired({
  connections,
  connectionId,
  onChange,
}: {
  connections: Connection[];
  connectionId: string | null;
  onChange: (value: string) => void;
}) {
  const active = connections.some((connection) => connection.active);
  return active ? (
    <ConnectionSelector connections={connections} value={connectionId} onChange={onChange} />
  ) : (
    <EvidenceState
      title="Sin conexión seleccionada"
      reason="Activa y confirma al menos una conexión ControlPlaneV2 desde Connectors."
    />
  );
}

export function InstancesPage() {
  const session = useSession();
  const connections = useConnections(Boolean(session.data?.authenticated));
  const [connectionId, setConnectionId] = useActiveConnectionId(connections.data);
  const [status, setStatus] = useState('active');
  const [name, setName] = useState('');
  const query = {
    limit: 200,
    ...(status !== 'active' && status !== 'all' && status !== 'stopped' ? { status } : {}),
    ...(name.trim() ? { name: name.trim() } : {}),
  };
  const instances = useInstances(connectionId, Boolean(session.data?.authenticated), query);
  const visibleInstances =
    instances.data?.items.filter((item) => {
      const remoteStatus = String(item.status ?? '').toLowerCase();
      if (status === 'active') return remoteStatus !== 'deleted';
      if (status === 'all') return true;
      if (status === 'deleted') return remoteStatus === 'deleted';
      if (status === 'stopped') {
        return remoteStatus !== 'deleted' && item.power_state === 'stopped';
      }
      return true;
    }) ?? [];
  if (!session.data?.authenticated && !session.isPending)
    return (
      <PageFrame
        eyebrow="INVENTORY"
        title="Instances"
        description="Inventario técnico publicado por IACP."
      >
        <LoginRequired />
      </PageFrame>
    );
  return (
    <PageFrame
      eyebrow="INVENTORY"
      title="Instances"
      description="Inventario técnico por fuente IACP, sin inferir datos ausentes."
    >
      <GlassSurface className="module-surface">
        <ActiveConnectionRequired
          connections={connections.data ?? []}
          connectionId={connectionId}
          onChange={setConnectionId}
        />
        <div className="filter-bar">
          <label>
            <Filter size={15} />
            Estado
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="active">Todas no eliminadas</option>
              <option value="ready">Lista / encendida</option>
              <option value="stopped">Apagada / lista</option>
              <option value="pending">Pendiente</option>
              <option value="provisioning">Aprovisionando</option>
              <option value="failed">Fallida</option>
              <option value="deleting">Eliminando</option>
              <option value="deleted">Eliminadas</option>
              <option value="all">Todos, incluidas eliminadas</option>
            </select>
          </label>
          <label className="filter-search">
            Buscar instancia
            <input
              value={name}
              placeholder="nombre técnico"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <span className="live-caption">
            <Activity size={14} /> Evidencia IACP · {visibleInstances.length} registros
          </span>
        </div>
        {instances.isPending ? <p className="muted-copy">Cargando inventario...</p> : null}
        {instances.isError ? (
          <EvidenceState
            title="Inventario no disponible"
            tone="error"
            reason="IACP no publicó el inventario para esta fuente."
          />
        ) : null}
        {visibleInstances.length === 0 && !instances.isPending && !instances.isError ? (
          <EvidenceState
            title="Sin instancias para este filtro"
            reason="La fuente respondió correctamente, pero no publicó registros que coincidan."
          />
        ) : null}
        <div className="data-table" role="table" aria-label="Inventario de instancias">
          <div className="data-table-head instance-grid" role="row">
            <span>Instancia</span>
            <span>Estado</span>
            <span>Energía</span>
            <span>Nodo</span>
            <span>VMID</span>
            <span>IP publicada</span>
            <span>Última ejecución</span>
          </div>
          {visibleInstances.map((item, index) => {
            const latest = item.latest_operation;
            const latestRecord =
              latest && typeof latest === 'object' ? (latest as Record<string, unknown>) : item;
            const instanceStatus = remoteText(item, ['status']);
            return (
              <div
                className="data-table-row instance-grid"
                role="row"
                key={String(item.instance_id ?? index)}
              >
                <div className="primary-cell">
                  <strong>
                    {remoteText(item, ['name', 'instance_name'], 'Instancia sin nombre')}
                  </strong>
                  <span>{remoteText(item, ['instance_id'], 'UUID no publicado')}</span>
                  <small>{remoteText(item, ['image', 'image_id'], 'Imagen no publicada')}</small>
                </div>
                <span className={['state-chip', statusClass(instanceStatus)].join(' ')}>
                  {statusLabel(instanceStatus)}
                </span>
                <span className="value-cell">
                  {energyLabel(firstRemoteValue(item, ['power_state', 'power']))}
                </span>
                <span className="value-cell">{remoteText(item, ['node', 'target_node'])}</span>
                <span className="value-cell">{remoteText(item, ['vmid'], 'No publicado')}</span>
                <span className="value-cell ip-cell">
                  {remoteText(item, ['ip_addresses', 'ips', 'ip'])}
                </span>
                <div className="primary-cell operation-cell">
                  <strong>{operationTitle(latestRecord)}</strong>
                  <span>
                    {formatRemoteDate(
                      firstRemoteValue(latestRecord, ['updated_at', 'finished_at', 'created_at']),
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </GlassSurface>
    </PageFrame>
  );
}

export function ProvisioningPage() {
  const session = useSession();
  const connections = useConnections(Boolean(session.data?.authenticated));
  const [connectionId, setConnectionId] = useActiveConnectionId(connections.data);
  const plans = usePlans(connectionId, Boolean(session.data?.authenticated));
  const images = useImages(connectionId, Boolean(session.data?.authenticated));
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const csrfToken = session.data?.csrfToken;
  const { register, handleSubmit } = useForm<{
    name: string;
    planId: 'kvm-1' | 'kvm-2' | 'kvm-3' | 'kvm-4';
    imageId: string;
  }>({ defaultValues: { planId: 'kvm-1', imageId: 'ubuntu-2404' } });

  async function submit(values: {
    name: string;
    planId: 'kvm-1' | 'kvm-2' | 'kvm-3' | 'kvm-4';
    imageId: string;
  }) {
    if (!connectionId || !csrfToken) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const input: InstanceProvisionRequest = {
        ...values,
        connectionId,
        networkProfile: 'lab-dhcp',
        startOnCreate: true,
        accessMode: 'managed-ssh',
      };
      setResult(await apiClient.provisionInstance(input, csrfToken));
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : 'El aprovisionamiento no pudo iniciarse.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!session.data?.authenticated && !session.isPending)
    return (
      <PageFrame
        eyebrow="CONTROL PLANE"
        title="Provisioning"
        description="Solicitudes técnicas sujetas al contrato OpenAPI."
      >
        <LoginRequired />
      </PageFrame>
    );
  return (
    <PageFrame
      eyebrow="CONTROL PLANE"
      title="Provisioning"
      description="Solicitudes técnicas directas; IACP decide admisión, capacidad y estado final."
    >
      <div className="module-grid">
        <GlassSurface className="module-surface">
          <ActiveConnectionRequired
            connections={connections.data ?? []}
            connectionId={connectionId}
            onChange={setConnectionId}
          />
          <p className="muted-copy">
            La contraseña de acceso se genera efímeramente en el BFF y nunca se muestra ni se
            persiste.
          </p>
          <form className="form-stack" onSubmit={handleSubmit(submit)}>
            <label>
              Nombre técnico
              <input {...register('name', { required: true })} placeholder="iacoc-v2-smoke" />
            </label>
            <label>
              Plan
              <select {...register('planId')}>
                <option value="kvm-1">kvm-1</option>
                <option value="kvm-2">kvm-2</option>
                <option value="kvm-3">kvm-3</option>
                <option value="kvm-4">kvm-4</option>
              </select>
            </label>
            <label>
              Imagen
              <select {...register('imageId')}>
                <option value="ubuntu-2404">ubuntu-2404</option>
                <option value="ubuntu-2604">ubuntu-2604</option>
                <option value="almalinux-9">almalinux-9</option>
                <option value="almalinux-10">almalinux-10</option>
              </select>
            </label>
            <button
              className="button button-primary"
              disabled={busy || !connectionId || session.data?.user?.role === 'Lector'}
              type="submit"
            >
              {busy ? 'Solicitando...' : 'Solicitar KVM'}
            </button>
          </form>
          {plans.data ? (
            <p className="muted-copy">{plans.data.items.length} planes publicados por la fuente.</p>
          ) : null}
          {images.data ? (
            <p className="muted-copy">
              {images.data.items.length} imágenes publicadas por la fuente.
            </p>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}
          {result ? <pre className="result-block">{JSON.stringify(result, null, 2)}</pre> : null}
        </GlassSurface>
      </div>
    </PageFrame>
  );
}

export function OperationsPage() {
  return (
    <RemoteModulePage
      kind="operations"
      eyebrow="AUDIT TRAIL"
      title="Operations"
      description="Historial global por fuente, con estados y fases publicados por IACP."
    />
  );
}

export function EventsPage() {
  return (
    <RemoteModulePage
      kind="events"
      eyebrow="EVENT STREAM"
      title="Events"
      description="Feed incremental de eventos auditables con correlación."
    />
  );
}

function RemoteModulePage({
  kind,
  eyebrow,
  title,
  description,
}: {
  kind: 'operations' | 'events';
  eyebrow: string;
  title: string;
  description: string;
}) {
  const session = useSession();
  const connections = useConnections(Boolean(session.data?.authenticated));
  const [connectionId, setConnectionId] = useActiveConnectionId(connections.data);
  const operations = useOperations(connectionId, Boolean(session.data?.authenticated));
  const events = useEvents(connectionId, Boolean(session.data?.authenticated));
  const remote = kind === 'operations' ? operations : events;
  const [instanceFilter, setInstanceFilter] = useState('');
  const remoteItems = newestFirst(
    remote.data?.items.filter((item) => {
      const needle = instanceFilter.trim().toLowerCase();
      if (!needle) return true;
      return [item.instance_id, item.instance_name, item.vmid, item.operation_id, item.event_id]
        .filter((value) => value !== null && value !== undefined)
        .some((value) => String(value).toLowerCase().includes(needle));
    }) ?? [],
  );
  if (!session.data?.authenticated && !session.isPending)
    return (
      <PageFrame eyebrow={eyebrow} title={title} description={description}>
        <LoginRequired />
      </PageFrame>
    );
  return (
    <PageFrame eyebrow={eyebrow} title={title} description={description}>
      <GlassSurface className="module-surface">
        <ActiveConnectionRequired
          connections={connections.data ?? []}
          connectionId={connectionId}
          onChange={setConnectionId}
        />
        <div className="module-toolbar">
          <span className="live-caption">
            <Activity size={14} /> Actualización progresiva · {remoteItems.length} registros
          </span>
          <label className="filter-search compact-filter">
            Instancia / VMID
            <input
              value={instanceFilter}
              placeholder="filtrar historial"
              onChange={(event) => setInstanceFilter(event.target.value)}
            />
          </label>
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => void remote.refetch()}
          >
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>
        {remote.isPending ? <p className="muted-copy">Cargando evidencia autorizada...</p> : null}
        {remote.isError ? (
          <EvidenceState
            title="Evidencia no publicada"
            tone="warning"
            reason="IACP no publicó esta evidencia para la fuente seleccionada."
          />
        ) : null}
        {remoteItems.length === 0 && !remote.isPending && !remote.isError ? (
          <EvidenceState
            title={kind === 'operations' ? 'Sin operaciones publicadas' : 'Sin eventos publicados'}
            reason={
              remote.data?.evidence?.reason ??
              'La fuente respondió correctamente, pero no publicó registros para esta vista.'
            }
          />
        ) : null}
        <div
          className={['data-table', kind === 'events' ? 'event-table' : 'operation-table'].join(
            ' ',
          )}
        >
          <div className="data-table-head operational-grid">
            <span>Ejecución</span>
            <span>Estado</span>
            <span>Instancia / VMID</span>
            <span>Worker</span>
            <span>Evidencia</span>
          </div>
          {remoteItems.map((item, index) =>
            kind === 'operations' ? (
              <OperationRow item={item} key={String(item.operation_id ?? index)} />
            ) : (
              <EventRow item={item} key={String(item.event_id ?? item.id ?? index)} />
            ),
          )}
        </div>
      </GlassSurface>
    </PageFrame>
  );
}

function OperationRow({ item }: { item: Record<string, unknown> }) {
  const steps = Array.isArray(item.events) ? item.events : [];
  return (
    <details className="data-table-row operational-grid operation-row">
      <summary>
        <div className="primary-cell">
          <strong>{operationTitle(item)}</strong>
          <span>{remoteText(item, ['operation_id'], 'UUID no publicado')}</span>
          <small>{remoteText(item, ['kind', 'command', 'action'], 'Operación técnica')}</small>
        </div>
        <span className={['state-chip', statusClass(normalizedStatus(item))].join(' ')}>
          {statusLabel(normalizedStatus(item))}
        </span>
        <span className="value-cell">
          {remoteText(item, ['instance_name', 'instance_id'])} · VMID {remoteText(item, ['vmid'])}
        </span>
        <span className="value-cell">{remoteText(item, ['worker_id', 'worker'])}</span>
        <span className="value-cell">
          {formatRemoteDate(firstRemoteValue(item, ['updated_at', 'finished_at', 'created_at']))}
        </span>
      </summary>
      <div className="execution-detail">
        <div className="detail-facts">
          <span>
            Fase: <strong>{remoteText(item, ['phase', 'status'])}</strong>
          </span>
          <span>
            Inicio: <strong>{formatRemoteDate(item.created_at)}</strong>
          </span>
          <span>
            Fin:{' '}
            <strong>
              {formatRemoteDate(firstRemoteValue(item, ['finished_at', 'updated_at']))}
            </strong>
          </span>
          <span>
            Código:{' '}
            <strong>{remoteText(item, ['error_code', 'code'], 'Sin error publicado')}</strong>
          </span>
        </div>
        {steps.length > 0 ? (
          <div className="step-list">
            <span className="eyebrow">PASOS PUBLICADOS</span>
            {steps.map((step, index) => {
              const record =
                step && typeof step === 'object' ? (step as Record<string, unknown>) : {};
              return (
                <div className="step-row" key={String(record.id ?? record.event_id ?? index)}>
                  <CheckCircle2 size={15} />
                  <strong>{humanize(firstRemoteValue(record, ['code', 'kind', 'status']))}</strong>
                  <span>
                    {formatRemoteDate(firstRemoteValue(record, ['created_at', 'occurred_at']))}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <span className="muted-copy">IACP no publicó pasos internos para esta ejecución.</span>
        )}
      </div>
    </details>
  );
}

function EventRow({ item }: { item: Record<string, unknown> }) {
  return (
    <div className="data-table-row operational-grid event-row">
      <div className="primary-cell">
        <strong>{operationTitle(item)}</strong>
        <span>{humanize(firstRemoteValue(item, ['kind', 'code', 'action']))}</span>
        <small>{remoteText(item, ['event_id', 'id'], 'Evento sin identificador')}</small>
      </div>
      <span className={['state-chip', statusClass(item.status)].join(' ')}>
        {statusLabel(item.status)}
      </span>
      <span className="value-cell">
        {remoteText(item, ['instance_name', 'instance_id'])} · VMID {remoteText(item, ['vmid'])}
      </span>
      <span className="value-cell">{remoteText(item, ['worker_id', 'actor', 'service'])}</span>
      <span className="value-cell">
        {formatRemoteDate(firstRemoteValue(item, ['occurred_at', 'created_at']))}
      </span>
      {item.detail ? <p className="event-detail">{String(item.detail)}</p> : null}
    </div>
  );
}

export function WorkersPage() {
  const session = useSession();
  const connections = useConnections(Boolean(session.data?.authenticated));
  const [connectionId, setConnectionId] = useActiveConnectionId(connections.data);
  const workers = useWorkers(connectionId, Boolean(session.data?.authenticated));
  const operations = useOperations(connectionId, Boolean(session.data?.authenticated));
  const events = useEvents(connectionId, Boolean(session.data?.authenticated));
  const [workerFilter, setWorkerFilter] = useState('');
  if (!session.data?.authenticated && !session.isPending)
    return (
      <PageFrame
        eyebrow="TELEMETRY"
        title="Workers & Queues"
        description="Ejecución real publicada por ControlPlaneV2."
      >
        <LoginRequired />
      </PageFrame>
    );
  const observation = workers.data?.observability ?? {};
  const workerItems = workers.data?.items ?? [];
  const operationItems = newestFirst(operations.data?.items ?? []);
  const eventItems = newestFirst(events.data?.items ?? []);
  const visibleWorkerItems = workerItems.filter((item) => {
    const needle = workerFilter.trim().toLowerCase();
    if (!needle) return true;
    return [item.worker_id, item.name, item.node, item.current_operation_id]
      .filter((value) => value !== null && value !== undefined)
      .some((value) => String(value).toLowerCase().includes(needle));
  });
  return (
    <PageFrame
      eyebrow="TELEMETRY"
      title="Workers & Queues"
      description="Seguimiento en tiempo real de workers, colas y ejecuciones sin inferir salud remota."
    >
      <GlassSurface className="module-surface">
        <ActiveConnectionRequired
          connections={connections.data ?? []}
          connectionId={connectionId}
          onChange={setConnectionId}
        />
        {workers.data?.source === 'operation-history' ? (
          <div className="evidence-banner">
            <Clock3 size={16} />
            Esta fuente no publica un endpoint de workers; estas tarjetas se construyen desde{' '}
            <strong>worker_id</strong> y la última operación publicada. La liveness queda como
            Desconocida.
          </div>
        ) : null}
        <div className="metric-strip">
          <TelemetryMetric label="Workers observados" value={String(workerItems.length)} />
          <TelemetryMetric
            label="Operaciones activas"
            value={remoteText(observation, ['active_operations'], 'Desconocido')}
          />
          <TelemetryMetric
            label="Cola publicada"
            value={remoteText(observation, ['queue_depth'], 'Desconocido')}
          />
          <TelemetryMetric
            label="Inciertas"
            value={remoteText(observation, ['uncertain_operations'], 'Desconocido')}
          />
        </div>
        <div className="module-toolbar worker-toolbar">
          <span className="live-caption">
            <Activity size={14} /> Fuente: {workers.data?.source ?? 'consultando'} ·{' '}
            {visibleWorkerItems.length} visibles
          </span>
          <label className="filter-search compact-filter">
            Worker / nodo
            <input
              value={workerFilter}
              placeholder="filtrar ejecución"
              onChange={(event) => setWorkerFilter(event.target.value)}
            />
          </label>
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => {
              void workers.refetch();
              void operations.refetch();
              void events.refetch();
            }}
          >
            <RefreshCw size={13} /> Actualizar evidencia
          </button>
        </div>
        {workers.isPending ? <p className="muted-copy">Consultando workers...</p> : null}
        {workers.isError ? (
          <EvidenceState
            title="Observabilidad no disponible"
            tone="error"
            reason="No fue posible consultar la observabilidad publicada por IACP."
          />
        ) : null}
        {!workers.isPending && !workers.isError && !workers.data?.available ? (
          <EvidenceState
            title="Workers no publicados"
            reason="Esta fuente no publica workers individuales; se conserva la observabilidad e historial real disponibles."
          />
        ) : null}
        <div className="worker-grid">
          {visibleWorkerItems.map((item, index) => {
            const workerId = publishedWorkerId(item);
            const history = workerId
              ? operationItems.filter((operation) => publishedWorkerId(operation) === workerId)
              : [];
            return (
              <WorkerCard
                item={item}
                events={eventItems}
                history={history}
                key={String(item.worker_id ?? index)}
              />
            );
          })}
        </div>
      </GlassSurface>
    </PageFrame>
  );
}

function TelemetryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="telemetry-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function WorkerCard({
  item,
  history,
  events,
}: {
  item: Record<string, unknown>;
  history: Record<string, unknown>[];
  events: Record<string, unknown>[];
}) {
  const current = item.current_operation;
  const last = item.last_operation;
  const currentRecord =
    current && typeof current === 'object' ? (current as Record<string, unknown>) : null;
  const lastRecord = last && typeof last === 'object' ? (last as Record<string, unknown>) : null;
  return (
    <GlassSurface className="worker-card">
      <div className="worker-card-heading">
        <div>
          <span className="eyebrow">WORKER</span>
          <h3>{remoteText(item, ['worker_id'], 'Worker no publicado')}</h3>
        </div>
        <span
          className={[
            'state-chip',
            statusClass(firstRemoteValue(item, ['liveness', 'status'])),
          ].join(' ')}
        >
          {statusLabel(firstRemoteValue(item, ['liveness', 'status']))}
        </span>
      </div>
      <div className="worker-facts">
        <span>
          Estado <strong>{statusLabel(item.status)}</strong>
        </span>
        <span>
          Nodo <strong>{remoteText(item, ['node', 'worker_node'])}</strong>
        </span>
        <span>
          Cola <strong>{remoteText(item, ['queue', 'queue_name'])}</strong>
        </span>
        <span>
          Heartbeat <strong>{formatRemoteDate(item.last_heartbeat)}</strong>
        </span>
        <span>
          Edad <strong>{remoteText(item, ['heartbeat_age_seconds'], 'Desconocida')} s</strong>
        </span>
        <span>
          Activa{' '}
          <strong>{currentRecord ? operationTitle(currentRecord) : 'Ninguna publicada'}</strong>
        </span>
        <span>
          Histórico <strong>{history.length} ejecuciones</strong>
        </span>
      </div>
      <div className="worker-last-run">
        <span className="eyebrow">ÚLTIMA EJECUCIÓN</span>
        {lastRecord ? (
          <>
            <strong>{operationTitle(lastRecord)}</strong>
            <span>
              {remoteText(lastRecord, ['instance_name', 'instance_id'])} ·{' '}
              {statusLabel(normalizedStatus(lastRecord))}
            </span>
            <small>
              {formatRemoteDate(
                firstRemoteValue(lastRecord, ['finished_at', 'updated_at', 'created_at']),
              )}
            </small>
          </>
        ) : (
          <span className="muted-copy">Sin ejecución publicada.</span>
        )}
      </div>
      {history.length > 0 ? (
        <div className="worker-history">
          <span className="eyebrow">HISTORIAL DE EJECUCIONES</span>
          {history.map((record, index) => {
            const operationId = firstRemoteValue(record, ['operation_id', 'id']);
            const steps = events.filter(
              (event) =>
                operationId !== null &&
                String(firstRemoteValue(event, ['operation_id', 'operationId'])) ===
                  String(operationId),
            );
            return (
              <details className="worker-execution" key={String(operationId ?? index)}>
                <summary>
                  <strong>{operationTitle(record)}</strong>
                  <span>{statusLabel(normalizedStatus(record))}</span>
                  <small>
                    {remoteText(record, ['instance_name', 'instance_id'])} · VMID{' '}
                    {remoteText(record, ['vmid'])}
                  </small>
                </summary>
                <div className="worker-execution-detail">
                  <span>
                    Ejecución <strong>{remoteText(record, ['operation_id', 'id'])}</strong>
                  </span>
                  <span>
                    Inicio <strong>{formatRemoteDate(record.created_at)}</strong>
                  </span>
                  <span>
                    Fin{' '}
                    <strong>
                      {formatRemoteDate(firstRemoteValue(record, ['finished_at', 'updated_at']))}
                    </strong>
                  </span>
                  {steps.length > 0 ? (
                    <div className="worker-step-list">
                      {steps.map((step, stepIndex) => (
                        <span key={String(step.event_id ?? step.id ?? stepIndex)}>
                          <CheckCircle2 size={13} />
                          {humanize(firstRemoteValue(step, ['code', 'kind', 'status']))}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <small>IACP no publicó pasos para esta ejecución.</small>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      ) : null}
    </GlassSurface>
  );
}

export function IncidentsPage() {
  const session = useSession();
  const connections = useConnections(Boolean(session.data?.authenticated));
  const [connectionId, setConnectionId] = useActiveConnectionId(connections.data);
  const incidents = useIncidents(connectionId, Boolean(session.data?.authenticated));
  if (!session.data?.authenticated && !session.isPending)
    return (
      <PageFrame
        eyebrow="RECOVERY"
        title="Incidents & Recovery"
        description="Fallos e incertidumbres publicados por IACP."
      >
        <LoginRequired />
      </PageFrame>
    );
  return (
    <PageFrame
      eyebrow="RECOVERY"
      title="Incidents & Recovery"
      description="Diagnóstico de operaciones fallidas o inciertas con evidencia y sin reintentos ciegos."
    >
      <GlassSurface className="module-surface">
        <ActiveConnectionRequired
          connections={connections.data ?? []}
          connectionId={connectionId}
          onChange={setConnectionId}
        />
        <div className="module-toolbar">
          <span className="live-caption">
            <Activity size={14} /> Derivado de operaciones y eventos publicados
          </span>
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => void incidents.refetch()}
          >
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>
        {incidents.isPending ? (
          <p className="muted-copy">Revisando fallos e incertidumbres...</p>
        ) : null}
        {incidents.isError ? (
          <EvidenceState
            title="Diagnóstico no disponible"
            tone="error"
            reason="No fue posible leer operaciones y eventos para construir el diagnóstico."
          />
        ) : null}
        {!incidents.isPending && !incidents.isError && incidents.data?.items.length === 0 ? (
          <div className="empty-inline">
            <CheckCircle2 size={18} /> No hay incidentes fallidos o inciertos publicados.
          </div>
        ) : null}
        <div className="incident-list">
          {incidents.data?.items.map((incident, index) => {
            const item =
              incident.item && typeof incident.item === 'object'
                ? (incident.item as Record<string, unknown>)
                : incident;
            return (
              <div className="incident-row" key={String(incident.incidentId ?? index)}>
                <span className="incident-icon">
                  <AlertTriangleIcon />
                </span>
                <div className="primary-cell">
                  <strong>{operationTitle(item)}</strong>
                  <span>{remoteText(item, ['operation_id', 'event_id', 'id'])}</span>
                  <small>{remoteText(item, ['error_code', 'code'], 'Sin código publicado')}</small>
                </div>
                <span className={['state-chip', statusClass(normalizedStatus(item))].join(' ')}>
                  {statusLabel(normalizedStatus(item))}
                </span>
                <span className="value-cell">
                  {remoteText(item, ['instance_name', 'instance_id'])}
                </span>
                <span className="value-cell">
                  {formatRemoteDate(
                    firstRemoteValue(item, ['updated_at', 'occurred_at', 'created_at']),
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </GlassSurface>
    </PageFrame>
  );
}

function AlertTriangleIcon() {
  return <span aria-hidden="true">!</span>;
}

export function UsersPage() {
  const session = useSession();
  const users = useUsers(Boolean(session.data?.authenticated));
  const connections = useConnections(Boolean(session.data?.authenticated));
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { role: Role; grants: ConnectionGrant[] }>>(
    {},
  );
  const [newGrants, setNewGrants] = useState<ConnectionGrant[]>([]);
  const csrfToken = session.data?.csrfToken;
  const isAdmin = session.data?.user?.role === 'Administrador';
  const { register, handleSubmit, reset } = useForm<{
    username: string;
    password: string;
    role: Role;
    tenant: string;
  }>({ defaultValues: { role: 'Lector', tenant: session.data?.user?.tenant ?? '' } });

  useEffect(() => {
    if (!users.data) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const user of users.data) {
        if (!next[user.id]) next[user.id] = { role: user.role, grants: user.grants };
      }
      return next;
    });
  }, [users.data]);

  async function create(values: {
    username: string;
    password: string;
    role: Role;
    tenant: string;
  }) {
    if (!csrfToken) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.createUser({ ...values, grants: newGrants }, csrfToken);
      reset({ username: '', password: '', role: 'Lector', tenant: values.tenant });
      setNewGrants([]);
      await users.refetch();
      setMessage('Identidad creada. Sus conectores asignados quedan limitados por el BFF.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No fue posible crear la identidad.');
    } finally {
      setBusy(false);
    }
  }

  async function save(user: User) {
    if (!csrfToken) return;
    const draft = drafts[user.id] ?? { role: user.role, grants: user.grants };
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.updateUser(user.id, draft, csrfToken);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      setMessage(`Permisos actualizados para ${user.username}.`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No fue posible guardar los permisos.');
    } finally {
      setBusy(false);
    }
  }

  if (!session.data?.authenticated && !session.isPending)
    return (
      <PageFrame
        eyebrow="ADMINISTRATION"
        title="Users & Access"
        description="Roles y conectores asignados."
      >
        <LoginRequired />
      </PageFrame>
    );
  if (!isAdmin && !session.isPending)
    return (
      <PageFrame
        eyebrow="ADMINISTRATION"
        title="Users & Access"
        description="Roles y conectores asignados."
      >
        <EvidenceState
          title="Permiso de administrador requerido"
          reason="La administración de identidades requiere Administrador del tenant."
        />
      </PageFrame>
    );
  return (
    <PageFrame
      eyebrow="ADMINISTRATION"
      title="Users & Access"
      description="Lector observa, Operador ejecuta acciones autorizadas y Administrador administra el tenant completo."
    >
      <div className="admin-grid">
        <GlassSurface className="module-surface">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">NUEVA IDENTIDAD</span>
              <h3>Crear usuario local</h3>
            </div>
            <UserRoundPlus size={20} />
          </div>
          <form className="form-stack" onSubmit={handleSubmit(create)}>
            <label>
              Usuario
              <input {...register('username', { required: true })} autoComplete="off" />
            </label>
            <label>
              Contraseña inicial
              <input
                {...register('password', { required: true, minLength: 12 })}
                type="password"
                autoComplete="new-password"
              />
            </label>
            <label>
              Tenant local
              <input {...register('tenant', { required: true })} />
            </label>
            <label>
              Rol
              <select {...register('role')}>
                <option value="Lector">Lector · lectura asignada</option>
                <option value="Operador">Operador · operar asignado</option>
                <option value="Administrador">Administrador · todo</option>
              </select>
            </label>
            <GrantEditor
              grants={newGrants}
              connections={connections.data ?? []}
              onChange={setNewGrants}
            />
            <button className="button button-primary" type="submit" disabled={busy}>
              {busy ? 'Guardando...' : 'Crear identidad'}
            </button>
          </form>
        </GlassSurface>
        <GlassSurface className="module-surface admin-users-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CONTROL DE ACCESO</span>
              <h3>{users.data?.length ?? 0} identidades locales</h3>
            </div>
            <MonitorCog size={20} />
          </div>
          {users.isPending ? <p className="muted-copy">Cargando identidades...</p> : null}
          {!users.isPending && (users.data?.length ?? 0) === 0 ? (
            <div className="empty-inline">
              <MonitorCog size={18} />
              <span>No hay identidades adicionales. Crea la primera desde este panel.</span>
            </div>
          ) : null}
          <div className="user-list">
            {users.data?.map((user) => {
              const draft = drafts[user.id] ?? { role: user.role, grants: user.grants };
              return (
                <div className="user-row" key={user.id}>
                  <div className="user-row-heading">
                    <div className="primary-cell">
                      <strong>{user.username}</strong>
                      <span>{user.tenant}</span>
                      <small>Creado {formatRemoteDate(user.createdAt)}</small>
                    </div>
                    <select
                      value={draft.role}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [user.id]: { ...draft, role: event.target.value as Role },
                        }))
                      }
                    >
                      <option value="Lector">Lector</option>
                      <option value="Operador">Operador</option>
                      <option value="Administrador">Administrador</option>
                    </select>
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      disabled={busy}
                      onClick={() => void save(user)}
                    >
                      <Check size={13} /> Guardar
                    </button>
                  </div>
                  <GrantEditor
                    grants={draft.grants}
                    connections={connections.data ?? []}
                    onChange={(grants) =>
                      setDrafts((current) => ({ ...current, [user.id]: { ...draft, grants } }))
                    }
                  />
                </div>
              );
            })}
          </div>
          {message ? <p className="form-success">{message}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
        </GlassSurface>
      </div>
    </PageFrame>
  );
}

function GrantEditor({
  grants,
  connections,
  onChange,
}: {
  grants: ConnectionGrant[];
  connections: Connection[];
  onChange: (grants: ConnectionGrant[]) => void;
}) {
  return (
    <div className="grant-editor">
      <span className="eyebrow">CONECTORES ASIGNADOS</span>
      {connections.length === 0 ? (
        <span className="muted-copy">No hay conectores registrados.</span>
      ) : null}
      {connections.map((connection) => {
        const grant = grants.find((item) => item.connectionId === connection.id) ?? {
          connectionId: connection.id,
          canRead: false,
          canOperate: false,
        };
        return (
          <div className="grant-row" key={connection.id}>
            <strong>{connection.name}</strong>
            <label>
              <input
                type="checkbox"
                checked={grant.canRead}
                onChange={() => onChange(toggleGrantValue(grants, connection.id, 'canRead'))}
              />{' '}
              Leer
            </label>
            <label>
              <input
                type="checkbox"
                checked={grant.canOperate}
                onChange={() => onChange(toggleGrantValue(grants, connection.id, 'canOperate'))}
              />{' '}
              Operar
            </label>
          </div>
        );
      })}
    </div>
  );
}

function toggleGrantValue(
  grants: ConnectionGrant[],
  connectionId: string,
  field: 'canRead' | 'canOperate',
) {
  const existing = grants.find((grant) => grant.connectionId === connectionId) ?? {
    connectionId,
    canRead: false,
    canOperate: false,
  };
  const next = { ...existing, [field]: !existing[field] };
  if (field === 'canOperate' && next.canOperate) next.canRead = true;
  return !next.canRead && !next.canOperate
    ? grants.filter((grant) => grant.connectionId !== connectionId)
    : [...grants.filter((grant) => grant.connectionId !== connectionId), next];
}

export function SettingsPage() {
  const session = useSession();
  const settings = useSettings(Boolean(session.data?.authenticated));
  const [theme, setTheme] = useState<Theme>('graphite');
  const [fontScale, setFontScale] = useState<FontScale>('normal');
  const [density, setDensity] = useState<Density>('comfortable');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const csrfToken = session.data?.csrfToken;

  useEffect(() => {
    if (!settings.data) return;
    setTheme(settings.data.theme);
    setFontScale(settings.data.fontScale);
    setDensity(settings.data.density ?? 'comfortable');
    setReducedMotion(settings.data.reducedMotion ?? false);
  }, [settings.data]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.fontScale = fontScale;
    document.documentElement.dataset.density = density;
    document.documentElement.dataset.reducedMotion = reducedMotion ? 'true' : 'false';
    window.localStorage.setItem('iacoc-v2-theme', theme);
    window.localStorage.setItem('iacoc-v2-font-scale', fontScale);
    window.localStorage.setItem('iacoc-v2-density', density);
    window.localStorage.setItem('iacoc-v2-reduced-motion', reducedMotion ? 'true' : 'false');
  }, [theme, fontScale, density, reducedMotion]);

  async function save() {
    if (!csrfToken) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiClient.updateSettings({ theme, fontScale, density, reducedMotion }, csrfToken);
      setMessage('Preferencias guardadas para esta identidad.');
    } catch {
      setMessage('No se pudieron guardar las preferencias. Se mantiene el ajuste local.');
    } finally {
      setBusy(false);
    }
  }

  if (!session.data?.authenticated && !session.isPending)
    return (
      <PageFrame
        eyebrow="PREFERENCES"
        title="Settings"
        description="Preferencias de usuario y controles funcionales."
      >
        <LoginRequired />
      </PageFrame>
    );
  return (
    <PageFrame
      eyebrow="PREFERENCES"
      title="Settings"
      description="Ajustes de lectura, apariencia y comportamiento operativo seguro."
    >
      <div className="settings-grid">
        <GlassSurface className="module-surface">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">APARIENCIA</span>
              <h3>Workspace</h3>
            </div>
            <Settings2 size={20} />
          </div>
          <label className="setting-control">
            Tema visual
            <select value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
              <option value="graphite">Graphite Glass · oscuro</option>
              <option value="light">Glass Light · claro</option>
            </select>
          </label>
          <label className="setting-control">
            Tamaño de letra
            <select
              value={fontScale}
              onChange={(event) => setFontScale(event.target.value as FontScale)}
            >
              <option value="compact">Compacto</option>
              <option value="normal">Normal</option>
              <option value="large">Grande</option>
            </select>
          </label>
          <label className="setting-control">
            Densidad operativa
            <select value={density} onChange={(event) => setDensity(event.target.value as Density)}>
              <option value="comfortable">Cómoda</option>
              <option value="compact">Compacta</option>
            </select>
          </label>
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(event) => setReducedMotion(event.target.checked)}
            />
            <span>
              <strong>Reducir movimiento</strong>
              <small>Desactiva transiciones y animaciones no esenciales.</small>
            </span>
          </label>
          <p className="muted-copy">
            El tamaño se aplica inmediatamente y se guarda en la sesión local. Respeta el modo
            reducido del sistema.
          </p>
          <button
            className="button button-primary"
            type="button"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? 'Guardando...' : 'Guardar preferencias'}
          </button>
          {message ? <p className="form-success">{message}</p> : null}
        </GlassSurface>
        <GlassSurface className="module-surface">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CONTROLES OPERATIVOS</span>
              <h3>Estado de la consola</h3>
            </div>
            <MonitorCog size={20} />
          </div>
          <div className="settings-facts">
            <EvidenceRow label="Identidad" value={session.data?.user?.username ?? 'Desconocida'} />
            <EvidenceRow label="Rol efectivo" value={session.data?.user?.role ?? 'Desconocido'} />
            <EvidenceRow label="Tenant local" value={session.data?.user?.tenant ?? 'Desconocido'} />
            <EvidenceRow label="Actualización Workers" value="5 s mientras la vista está abierta" />
            <EvidenceRow label="Datos de producción" value="Solo API real · sin fixtures" />
            <EvidenceRow label="Acciones" value="Requieren sesión, CSRF y permiso del conector" />
          </div>
        </GlassSurface>
      </div>
    </PageFrame>
  );
}

export function ConnectorsPage() {
  const session = useSession();
  const connections = useConnections(Boolean(session.data?.authenticated));
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmSingleTenant, setConfirmSingleTenant] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const { register, handleSubmit, reset } = useForm<{
    name: string;
    endpoint: string;
    bearer: string;
  }>();

  useEffect(() => {
    if (!selectedId && connections.data?.[0]) setSelectedId(connections.data[0].id);
    if (selectedId && !connections.data?.some((connection) => connection.id === selectedId)) {
      setSelectedId(connections.data?.[0]?.id ?? null);
    }
  }, [connections.data, selectedId]);

  const selected = connections.data?.find((connection) => connection.id === selectedId) ?? null;
  const csrfToken = session.data?.csrfToken;
  const isAdmin = session.data?.user?.role === 'Administrador';

  function showError(cause: unknown) {
    setError(
      cause instanceof ApiError ? cause.message : 'La operación del conector no pudo completarse.',
    );
    setMessage(null);
  }

  function focusConfirmation(connection: Connection) {
    setSelectedId(connection.id);
    setMessage(null);
    requestAnimationFrame(() => {
      confirmationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('single-tenant-confirmation-checkbox')?.focus();
    });
  }

  async function addConnection(values: { name: string; endpoint: string; bearer: string }) {
    if (!csrfToken) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const connection = await apiClient.createConnection(values, csrfToken);
      reset({ name: '', endpoint: '', bearer: '' });
      setSelectedId(connection.id);
      setConfirmSingleTenant(false);
      await connections.refetch();
      setMessage(
        'Validación correcta. Confirma el alcance single-tenant para activar la conexión.',
      );
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function validateSelected(connection: Connection) {
    if (!csrfToken) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.validateConnection(connection.id, csrfToken);
      await connections.refetch();
      setSelectedId(connection.id);
      setConfirmSingleTenant(false);
      setMessage(
        'Validación correcta. Confirma el alcance single-tenant para activar la conexión.',
      );
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function activateSelected() {
    if (!selected || !csrfToken || !confirmSingleTenant) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiClient.activateConnection(selected.id, csrfToken, {
        action: 'activate',
        confirmSingleTenant: true,
      });
      setConfirmSingleTenant(false);
      await Promise.all([
        connections.refetch(),
        queryClient.invalidateQueries({ queryKey: ['overview'] }),
      ]);
      setMessage('Alcance single-tenant confirmado. La conexión quedó activa');
      void result;
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(connection: Connection) {
    if (!csrfToken) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (connection.active) {
        await apiClient.deactivateConnection(connection.id, csrfToken);
      } else {
        await apiClient.activateConnection(connection.id, csrfToken, {
          action: 'activate',
          confirmSingleTenant: true,
        });
      }
      await Promise.all([
        connections.refetch(),
        queryClient.invalidateQueries({ queryKey: ['overview'] }),
      ]);
      setMessage(connection.active ? 'La fuente quedó desconectada.' : 'La fuente quedó activa.');
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

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
          {isAdmin ? (
            <GlassSurface className="connector-intro">
              <div className="card-icon">
                <PlugZap size={20} />
              </div>
              <h2>Registrar ControlPlaneV2</h2>
              <p>
                El endpoint se valida con el contrato técnico actual. La credencial se cifra en el
                backend y nunca vuelve al navegador.
              </p>
              <form className="form-stack connector-form" onSubmit={handleSubmit(addConnection)}>
                <label>
                  Nombre
                  <input {...register('name', { required: true })} placeholder="ControlPlane V2" />
                </label>
                <label>
                  Endpoint HTTPS permitido
                  <input
                    {...register('endpoint', { required: true })}
                    placeholder="https://dev-iac.cyberfuel.com"
                    inputMode="url"
                  />
                </label>
                <label>
                  Bearer temporal
                  <input
                    {...register('bearer', { required: true })}
                    type="password"
                    autoComplete="new-password"
                  />
                </label>
                <button className="button button-primary" disabled={busy} type="submit">
                  {busy ? 'Validando...' : 'Agregar y validar'}
                </button>
              </form>
            </GlassSurface>
          ) : (
            <GlassSurface className="connector-intro">
              <div className="card-icon">
                <PlugZap size={20} />
              </div>
              <h2>Conectores asignados</h2>
              <p>
                Tu rol puede consultar únicamente las fuentes que el Administrador te asignó. Las
                credenciales y cambios de alcance están reservados al Administrador.
              </p>
            </GlassSurface>
          )}
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
                <div
                  className={[
                    'connector-row',
                    selectedId === connection.id ? 'connector-row-selected' : '',
                  ].join(' ')}
                  key={connection.id}
                  onClick={() => setSelectedId(connection.id)}
                >
                  <span className="connection-avatar">I</span>
                  <div>
                    <strong>{connection.name}</strong>
                    <span>{connection.endpoint}</span>
                  </div>
                  <span className="status-chip">{connection.status}</span>
                  {isAdmin ? (
                    <button
                      className="button button-secondary button-small"
                      disabled={busy}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (
                          connection.status === 'pending-confirmation' &&
                          connection.lastValidationAt
                        ) {
                          focusConfirmation(connection);
                        } else if (connection.active || connection.scopeConfirmed) {
                          void toggleActive(connection);
                        } else {
                          void validateSelected(connection);
                        }
                      }}
                    >
                      {connection.status === 'pending-confirmation'
                        ? 'Conectar'
                        : connection.active
                          ? 'Desconectar'
                          : connection.scopeConfirmed
                            ? 'Activar'
                            : 'Probar conexión'}
                    </button>
                  ) : null}
                </div>
              ))
            )}
            {selected?.status === 'pending-confirmation' && selected.lastValidationAt ? (
              <div className="single-tenant-confirmation" ref={confirmationRef}>
                <div>
                  <span className="eyebrow">VALIDACIÓN COMPLETA</span>
                  <strong>Confirma el único alcance remoto autorizado</strong>
                  <p>
                    ControlPlaneV2 no publica tenant_id; esta confirmación explícita es necesaria.
                  </p>
                </div>
                <label className="confirmation-check">
                  <input
                    id="single-tenant-confirmation-checkbox"
                    checked={confirmSingleTenant}
                    onChange={(event) => setConfirmSingleTenant(event.target.checked)}
                    type="checkbox"
                  />
                  Confirmo que este endpoint representa el único alcance remoto autorizado
                </label>
                <button
                  className="button button-primary"
                  disabled={!confirmSingleTenant || busy}
                  onClick={() => void activateSelected()}
                  type="button"
                >
                  Confirmar y conectar
                </button>
              </div>
            ) : null}
            {message ? <p className="form-success">{message}</p> : null}
            {error ? <p className="form-error">{error}</p> : null}
          </GlassSurface>
        </div>
      )}
    </PageFrame>
  );
}
