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
  useOperation,
  useOperations,
  useOverview,
  useOverviewSourceSnapshots,
  usePlans,
  useSession,
  useSettings,
  useUsers,
  useWorkers,
} from './query';
import type { OverviewSourceSnapshot } from './query';
import {
  DetailModal,
  EvidenceState,
  FreshnessIndicator,
  LoginRequired,
  PageFrame,
  UnavailableState,
} from './components';

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
  const connections = useConnections(Boolean(session.data?.authenticated));
  const snapshots = useOverviewSourceSnapshots(
    connections.data ?? [],
    Boolean(session.data?.authenticated),
  );
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
  const activeConnections = connections.data?.filter((connection) => connection.active) ?? [];
  const connected = activeConnections.length > 0;
  const operationalData = overview.data ?? null;
  return (
    <PageFrame
      eyebrow="COMMAND CENTER"
      title="Overview"
      description="Centro de mando consolidado con evidencia real de cada fuente autorizada."
    >
      <div className="overview-dashboard">
        <GlassSurface className="overview-hero">
          <div className="hero-copy">
            <div className="overview-kicker">
              <span className="eyebrow">Estado del workspace</span>
              <FreshnessIndicator
                updatedAt={overview.dataUpdatedAt}
                fetching={overview.isFetching || connections.isFetching}
                label="workspace"
              />
            </div>
            <h2>{connected ? 'Operación IACP en marcha' : 'Workspace desconectado'}</h2>
            <p>
              {operationalData?.message ??
                'Cargando el alcance autorizado y las primeras observaciones publicadas.'}
            </p>
          </div>
          <div className={['hero-status-card', connected ? 'hero-status-live' : ''].join(' ')}>
            {connected ? <CheckCircle2 size={28} /> : <CircleOff size={28} />}
            <strong>
              {connected ? `${activeConnections.length} fuentes activas` : 'Sin alcance remoto'}
            </strong>
            <span>{connected ? 'Lectura autorizada' : 'Conecta una fuente para observarla'}</span>
          </div>
        </GlassSurface>

        <div className="overview-kpi-grid">
          <MetricCard
            icon={<Server size={18} />}
            label="Fuentes activas"
            value={String(activeConnections.length)}
          />
          <MetricCard
            icon={<MonitorCog size={18} />}
            label="Instancias visibles"
            value={overviewVisibleCount(snapshots, 'instances')}
          />
          <MetricCard
            icon={<Activity size={18} />}
            label="Operaciones activas"
            value={overviewActiveOperations(snapshots)}
          />
          <MetricCard
            icon={<PlugZap size={18} />}
            label="Workers observados"
            value={overviewVisibleCount(snapshots, 'workers')}
          />
          <MetricCard
            icon={<CircleOff size={18} />}
            label="Incidencias visibles"
            value={overviewVisibleCount(snapshots, 'incidents')}
          />
        </div>

        <GlassSurface className="overview-sources-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">FUENTES AUTORIZADAS</span>
              <h3>Salud por ControlPlaneV2</h3>
            </div>
            <ArrowUpRight size={18} />
          </div>
          {snapshots.length > 0 ? (
            <div className="overview-source-grid">
              {snapshots.map((snapshot) => (
                <OverviewSourceCard key={snapshot.connection.id} snapshot={snapshot} />
              ))}
            </div>
          ) : (
            <EvidenceState
              title={connections.isPending ? 'Cargando fuentes' : 'Sin fuentes activas'}
              reason={
                connections.isPending
                  ? 'La estructura del tablero está lista; esperamos la lista autorizada de conexiones.'
                  : 'No hay conexiones LIVE autorizadas para consolidar en Overview.'
              }
            />
          )}
        </GlassSurface>

        <GlassSurface className="overview-activity-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ACTIVIDAD RECIENTE</span>
              <h3>Operaciones y eventos publicados</h3>
            </div>
            <FreshnessIndicator
              updatedAt={overviewSnapshotUpdatedAt(snapshots)}
              fetching={overviewSnapshotFetching(snapshots)}
              label="actividad"
            />
          </div>
          <OverviewActivity snapshots={snapshots} />
        </GlassSurface>
      </div>
    </PageFrame>
  );
}

type SnapshotResource = 'instances' | 'workers' | 'incidents';

function resourceItems(query: { data?: unknown }): Record<string, unknown>[] {
  const data = query.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const items = (data as { items?: unknown }).items;
  return Array.isArray(items)
    ? items.filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object'),
      )
    : [];
}

function observationItems(snapshot: OverviewSourceSnapshot): Record<string, unknown> {
  const data = snapshot.workers.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const observation = (data as { observability?: unknown }).observability;
  return observation && typeof observation === 'object' && !Array.isArray(observation)
    ? (observation as Record<string, unknown>)
    : {};
}

function overviewVisibleCount(
  snapshots: OverviewSourceSnapshot[],
  resource: SnapshotResource,
): string {
  if (snapshots.length === 0) return '0';
  const queries = snapshots.map((snapshot) => snapshot[resource]);
  if (queries.some((query) => query.isPending && !query.data)) return '…';
  const items = snapshots.flatMap((snapshot) => resourceItems(snapshot[resource]));
  if (resource === 'workers' && items.length === 0) return 'No publicado';
  return String(items.length);
}

function overviewActiveOperations(snapshots: OverviewSourceSnapshot[]): string {
  const values = snapshots
    .map((snapshot) => observationItems(snapshot).active_operations)
    .filter((value): value is number => typeof value === 'number');
  if (values.length === 0)
    return snapshots.some((snapshot) => snapshot.workers.isPending) ? '…' : 'No publicado';
  return String(values.reduce((total, value) => total + value, 0));
}

function overviewSnapshotUpdatedAt(snapshots: OverviewSourceSnapshot[]): number | undefined {
  const timestamps = snapshots.flatMap((snapshot) => [
    snapshot.instances.dataUpdatedAt,
    snapshot.operations.dataUpdatedAt,
    snapshot.events.dataUpdatedAt,
    snapshot.workers.dataUpdatedAt,
    snapshot.incidents.dataUpdatedAt,
  ]);
  return Math.max(...timestamps.filter(Boolean)) || undefined;
}

function overviewSnapshotFetching(snapshots: OverviewSourceSnapshot[]): boolean {
  return snapshots.some((snapshot) =>
    [
      snapshot.instances,
      snapshot.operations,
      snapshot.events,
      snapshot.workers,
      snapshot.incidents,
    ].some((query) => query.isFetching),
  );
}

function OverviewSourceCard({ snapshot }: { snapshot: OverviewSourceSnapshot }) {
  const { connection } = snapshot;
  return (
    <div className="overview-source-card">
      <div className="overview-source-heading">
        <div>
          <span className="source-badge">
            {connection.name.includes('production') ? 'PROD' : 'DEV'}
          </span>
          <h4>{connection.name}</h4>
          <small>{connection.endpoint}</small>
        </div>
        <span className={['state-chip', statusClass(connection.status)].join(' ')}>
          {statusLabel(connection.status)}
        </span>
      </div>
      <div className="overview-source-facts">
        <EvidenceRow label="Instancias" value={overviewCountText(snapshot.instances)} />
        <EvidenceRow label="Operaciones" value={overviewCountText(snapshot.operations)} />
        <EvidenceRow label="Eventos" value={overviewCountText(snapshot.events)} />
        <EvidenceRow label="Workers" value={overviewCountText(snapshot.workers, true)} />
      </div>
      <FreshnessIndicator
        updatedAt={overviewSnapshotUpdatedAt([snapshot])}
        fetching={overviewSnapshotFetching([snapshot])}
        label="fuente"
      />
    </div>
  );
}

function overviewCountText(query: { data?: unknown; isPending: boolean }, workers = false): string {
  if (query.isPending && !query.data) return '…';
  const count = resourceItems(query).length;
  return workers && count === 0 ? 'No publicado' : String(count);
}

function OverviewActivity({ snapshots }: { snapshots: OverviewSourceSnapshot[] }) {
  const records = snapshots
    .flatMap((snapshot) => [
      ...resourceItems(snapshot.operations).map((item) => ({ item, kind: 'operation', snapshot })),
      ...resourceItems(snapshot.events).map((item) => ({ item, kind: 'event', snapshot })),
    ])
    .sort((left, right) => evidenceTimestamp(right.item) - evidenceTimestamp(left.item))
    .slice(0, 8);
  if (records.length === 0)
    return (
      <EvidenceState
        title="Esperando actividad publicada"
        reason="Las fuentes aún no han entregado operaciones o eventos para esta vista."
      />
    );
  return (
    <div className="overview-activity-list">
      {records.map(({ item, kind, snapshot }, index) => (
        <div
          className="overview-activity-row"
          key={String(firstRemoteValue(item, ['operation_id', 'event_id', 'id']) ?? index)}
        >
          <span
            className={[
              'activity-type',
              kind === 'operation' ? 'activity-type-operation' : '',
            ].join(' ')}
          >
            {kind === 'operation' ? 'OP' : 'EV'}
          </span>
          <div className="primary-cell">
            <strong>{operationTitle(item)}</strong>
            <span>
              {remoteText(item, ['instance_name', 'instance_id'], 'Instancia no publicada')}
            </span>
          </div>
          <span className={['state-chip', statusClass(normalizedStatus(item))].join(' ')}>
            {statusLabel(normalizedStatus(item))}
          </span>
          <span className="activity-source">{snapshot.connection.name}</span>
          <time>
            {formatRemoteDate(firstRemoteValue(item, ['occurred_at', 'updated_at', 'created_at']))}
          </time>
        </div>
      ))}
    </div>
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
  const [recordLimit, setRecordLimit] = useState(18);
  const [selectedRecord, setSelectedRecord] = useState<SelectedRemoteRecord | null>(null);
  const filteredItems = newestFirst(
    remote.data?.items.filter((item) => {
      const needle = instanceFilter.trim().toLowerCase();
      if (!needle) return true;
      return [item.instance_id, item.instance_name, item.vmid, item.operation_id, item.event_id]
        .filter((value) => value !== null && value !== undefined)
        .some((value) => String(value).toLowerCase().includes(needle));
    }) ?? [],
  );
  const remoteItems = filteredItems.slice(0, recordLimit);
  const selectedConnection = connections.data?.find((connection) => connection.id === connectionId);
  useEffect(() => {
    setRecordLimit(18);
    setSelectedRecord(null);
  }, [connectionId, instanceFilter, kind]);
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
            <Activity size={14} /> {filteredItems.length} registros visibles
          </span>
          <FreshnessIndicator
            updatedAt={remote.dataUpdatedAt}
            fetching={remote.isFetching}
            label={kind === 'operations' ? 'operaciones' : 'eventos'}
          />
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
        <div className="remote-card-grid">
          {remoteItems.map((item, index) => (
            <RemoteRecordCard
              key={String(item.operation_id ?? item.event_id ?? item.id ?? index)}
              kind={kind === 'operations' ? 'operation' : 'event'}
              item={item}
              source={selectedConnection?.name ?? 'Fuente seleccionada'}
              onOpen={() =>
                setSelectedRecord({ kind: kind === 'operations' ? 'operation' : 'event', item })
              }
            />
          ))}
        </div>
        {recordLimit < filteredItems.length ? (
          <button
            className="button button-secondary load-more-button"
            type="button"
            onClick={() => setRecordLimit((current) => current + 18)}
          >
            Cargar más evidencia
          </button>
        ) : null}
      </GlassSurface>
      {selectedRecord ? (
        <RemoteRecordModal
          selected={selectedRecord}
          connectionId={connectionId}
          source={selectedConnection?.name ?? 'Fuente seleccionada'}
          onClose={() => setSelectedRecord(null)}
        />
      ) : null}
    </PageFrame>
  );
}

type RemoteRecordKind = 'operation' | 'event';

type SelectedRemoteRecord = {
  kind: RemoteRecordKind;
  item: Record<string, unknown>;
};

function RemoteRecordCard({
  kind,
  item,
  source,
  onOpen,
}: {
  kind: RemoteRecordKind;
  item: Record<string, unknown>;
  source: string;
  onOpen: () => void;
}) {
  return (
    <button className="remote-record-card" type="button" onClick={onOpen}>
      <div className="remote-record-card-top">
        <span className="source-badge">{kind === 'operation' ? 'OPERACIÓN' : 'EVENTO'}</span>
        <span className={['state-chip', statusClass(normalizedStatus(item))].join(' ')}>
          {statusLabel(normalizedStatus(item))}
        </span>
      </div>
      <div className="remote-record-title">
        <h3>{operationTitle(item)}</h3>
        <span>
          {remoteText(item, [kind === 'operation' ? 'kind' : 'code'], 'Ejecución técnica')}
        </span>
      </div>
      <div className="remote-record-facts">
        <EvidenceRow label="Instancia" value={remoteText(item, ['instance_name', 'instance_id'])} />
        <EvidenceRow label="VMID" value={remoteText(item, ['vmid'])} />
        <EvidenceRow
          label={kind === 'operation' ? 'Worker' : 'Actor'}
          value={remoteText(
            item,
            kind === 'operation' ? ['worker_id', 'worker'] : ['actor', 'service'],
          )}
        />
      </div>
      <div className="remote-record-footer">
        <span>{source}</span>
        <span>
          {remoteText(
            item,
            [kind === 'operation' ? 'operation_id' : 'event_id', 'id'],
            'ID no publicado',
          )}
        </span>
        <time>
          {formatRemoteDate(firstRemoteValue(item, ['occurred_at', 'updated_at', 'created_at']))}
        </time>
      </div>
    </button>
  );
}

function RemoteRecordModal({
  selected,
  connectionId,
  source,
  onClose,
}: {
  selected: SelectedRemoteRecord;
  connectionId: string | null;
  source: string;
  onClose: () => void;
}) {
  const operationId = firstRemoteValue(selected.item, ['operation_id']);
  const operationDetail = useOperation(
    connectionId,
    typeof operationId === 'string' ? operationId : null,
    selected.kind === 'operation',
  );
  const item = operationDetail.data?.item ?? selected.item;
  const steps = Array.isArray(item.events)
    ? item.events.filter((step): step is Record<string, unknown> =>
        Boolean(step && typeof step === 'object'),
      )
    : [];
  return (
    <DetailModal
      open
      title={operationTitle(item)}
      subtitle={`${source} · ${selected.kind === 'operation' ? 'operación técnica' : 'evento auditable'}`}
      onClose={onClose}
      className="record-detail-modal"
    >
      <div className="detail-status-line">
        <span className={['state-chip', statusClass(normalizedStatus(item))].join(' ')}>
          {statusLabel(normalizedStatus(item))}
        </span>
        <FreshnessIndicator
          updatedAt={operationDetail.dataUpdatedAt}
          fetching={operationDetail.isFetching}
          label="detalle"
        />
      </div>
      <div className="detail-fact-grid">
        <DetailFact
          label="Identificador"
          value={remoteText(item, [
            selected.kind === 'operation' ? 'operation_id' : 'event_id',
            'id',
          ])}
        />
        <DetailFact label="Instancia" value={remoteText(item, ['instance_name', 'instance_id'])} />
        <DetailFact label="VMID" value={remoteText(item, ['vmid'])} />
        <DetailFact
          label="Worker / actor"
          value={remoteText(item, ['worker_id', 'worker', 'actor', 'service'])}
        />
        <DetailFact
          label="Inicio"
          value={formatRemoteDate(firstRemoteValue(item, ['created_at', 'occurred_at']))}
        />
        <DetailFact
          label="Actualización"
          value={formatRemoteDate(
            firstRemoteValue(item, ['updated_at', 'finished_at', 'occurred_at']),
          )}
        />
        <DetailFact
          label="Código"
          value={remoteText(item, ['error_code', 'code'], 'Sin código publicado')}
        />
        <DetailFact
          label="Solicitado por"
          value={remoteText(item, ['requested_by', 'actor'], 'No publicado')}
        />
      </div>
      {selected.kind === 'operation' && steps.length > 0 ? (
        <OperationTimeline steps={steps} />
      ) : null}
      {selected.kind === 'operation' && steps.length === 0 ? (
        <EvidenceState
          title="Sin pasos publicados"
          reason="IACP publicó la operación, pero no expuso pasos internos para esta ejecución."
        />
      ) : null}
      {selected.kind === 'event' && item.detail ? (
        <div className="detail-callout">
          <span className="eyebrow">DETALLE PUBLICADO</span>
          <p>{String(item.detail)}</p>
        </div>
      ) : null}
      {operationDetail.isError && selected.kind === 'operation' ? (
        <EvidenceState
          title="Detalle ampliado no disponible"
          tone="warning"
          reason="Se conserva la información de la tarjeta; el endpoint de detalle no respondió."
        />
      ) : null}
    </DetailModal>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OperationTimeline({ steps }: { steps: Record<string, unknown>[] }) {
  return (
    <div className="detail-timeline">
      <div className="detail-section-heading">
        <span className="eyebrow">PASOS PUBLICADOS</span>
        <strong>{steps.length} pasos correlacionados</strong>
      </div>
      {steps.map((step, index) => (
        <div className="detail-timeline-row" key={String(step.id ?? step.event_id ?? index)}>
          <span className="timeline-dot">
            <CheckCircle2 size={14} />
          </span>
          <div>
            <strong>{humanize(firstRemoteValue(step, ['code', 'kind', 'status']))}</strong>
            <span>{remoteText(step, ['detail', 'service', 'actor'], 'Paso publicado')}</span>
          </div>
          <time>{formatRemoteDate(firstRemoteValue(step, ['created_at', 'occurred_at']))}</time>
        </div>
      ))}
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
  const [selectedWorker, setSelectedWorker] = useState<Record<string, unknown> | null>(null);
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
          <FreshnessIndicator
            updatedAt={
              Math.max(workers.dataUpdatedAt, operations.dataUpdatedAt, events.dataUpdatedAt) ||
              undefined
            }
            fetching={workers.isFetching || operations.isFetching || events.isFetching}
            label="workers"
          />
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
                history={history}
                onOpen={() => setSelectedWorker(item)}
                key={String(item.worker_id ?? index)}
              />
            );
          })}
        </div>
      </GlassSurface>
      {selectedWorker ? (
        <WorkerDetailModal
          item={selectedWorker}
          history={
            publishedWorkerId(selectedWorker)
              ? operationItems.filter(
                  (operation) => publishedWorkerId(operation) === publishedWorkerId(selectedWorker),
                )
              : []
          }
          events={eventItems}
          source={
            connections.data?.find((connection) => connection.id === connectionId)?.name ??
            'Fuente seleccionada'
          }
          onClose={() => setSelectedWorker(null)}
        />
      ) : null}
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
  onOpen,
}: {
  item: Record<string, unknown>;
  history: Record<string, unknown>[];
  onOpen: () => void;
}) {
  const last = item.last_operation;
  const lastRecord = last && typeof last === 'object' ? (last as Record<string, unknown>) : null;
  return (
    <button className="worker-card" type="button" onClick={onOpen}>
      <div className="worker-card-heading">
        <div>
          <span className="source-badge">WORKER</span>
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
          Heartbeat <strong>{formatRemoteDate(item.last_heartbeat)}</strong>
        </span>
        <span>
          Histórico <strong>{history.length} ejecuciones</strong>
        </span>
      </div>
      <div className="worker-card-current">
        <span className="eyebrow">EJECUCIÓN MÁS RECIENTE</span>
        {lastRecord ? (
          <>
            <strong>{operationTitle(lastRecord)}</strong>
            <span>{remoteText(lastRecord, ['instance_name', 'instance_id'])}</span>
            <time>
              {formatRemoteDate(
                firstRemoteValue(lastRecord, ['finished_at', 'updated_at', 'created_at']),
              )}
            </time>
          </>
        ) : (
          <span className="muted-copy">Sin ejecución publicada.</span>
        )}
      </div>
      <span className="worker-card-action">
        Abrir detalle <ArrowUpRight size={14} />
      </span>
    </button>
  );
}

function WorkerDetailModal({
  item,
  history,
  events,
  source,
  onClose,
}: {
  item: Record<string, unknown>;
  history: Record<string, unknown>[];
  events: Record<string, unknown>[];
  source: string;
  onClose: () => void;
}) {
  const workerId = publishedWorkerId(item);
  const current = item.current_operation;
  const currentRecord =
    current && typeof current === 'object' ? (current as Record<string, unknown>) : null;
  const relatedEvents = events.filter((event) => {
    const eventWorker = publishedWorkerId(event);
    if (workerId && eventWorker === workerId) return true;
    const eventOperation = firstRemoteValue(event, ['operation_id', 'operationId']);
    return history.some(
      (operation) =>
        String(firstRemoteValue(operation, ['operation_id', 'id'])) === String(eventOperation),
    );
  });
  return (
    <DetailModal
      open
      title={workerId ?? 'Worker no publicado'}
      subtitle={`${source} · detalle de ejecución y observabilidad`}
      onClose={onClose}
      className="worker-detail-modal"
    >
      <div className="detail-status-line">
        <span
          className={[
            'state-chip',
            statusClass(firstRemoteValue(item, ['liveness', 'status'])),
          ].join(' ')}
        >
          {statusLabel(firstRemoteValue(item, ['liveness', 'status']))}
        </span>
        <span className="source-badge">
          {remoteText(item, ['evidence'], 'Evidencia publicada')}
        </span>
      </div>
      <div className="detail-fact-grid">
        <DetailFact label="Estado" value={statusLabel(item.status)} />
        <DetailFact label="Nodo" value={remoteText(item, ['node', 'worker_node'])} />
        <DetailFact label="Cola" value={remoteText(item, ['queue', 'queue_name'])} />
        <DetailFact label="Heartbeat" value={formatRemoteDate(item.last_heartbeat)} />
        <DetailFact
          label="Edad"
          value={`${remoteText(item, ['heartbeat_age_seconds'], 'Desconocida')} s`}
        />
        <DetailFact
          label="Ejecución activa"
          value={currentRecord ? operationTitle(currentRecord) : 'Ninguna publicada'}
        />
        <DetailFact label="Histórico" value={`${history.length} ejecuciones`} />
        <DetailFact label="Eventos relacionados" value={String(relatedEvents.length)} />
      </div>
      {currentRecord ? (
        <div className="detail-callout detail-callout-live">
          <span className="eyebrow">EJECUCIÓN ACTIVA</span>
          <strong>{operationTitle(currentRecord)}</strong>
          <p>
            {remoteText(currentRecord, ['instance_name', 'instance_id'])} · VMID{' '}
            {remoteText(currentRecord, ['vmid'])}
          </p>
        </div>
      ) : null}
      <div className="worker-modal-section">
        <div className="detail-section-heading">
          <span className="eyebrow">HISTORIAL DE EJECUCIONES</span>
          <strong>{history.length} registros publicados</strong>
        </div>
        {history.length > 0 ? (
          <div className="worker-modal-history">
            {history.map((record, index) => {
              const operationId = firstRemoteValue(record, ['operation_id', 'id']);
              const steps = events.filter(
                (event) =>
                  operationId !== null &&
                  String(firstRemoteValue(event, ['operation_id', 'operationId'])) ===
                    String(operationId),
              );
              return (
                <div className="worker-modal-execution" key={String(operationId ?? index)}>
                  <div className="worker-modal-execution-heading">
                    <div>
                      <strong>{operationTitle(record)}</strong>
                      <span>
                        {remoteText(record, ['instance_name', 'instance_id'])} · VMID{' '}
                        {remoteText(record, ['vmid'])}
                      </span>
                    </div>
                    <span
                      className={['state-chip', statusClass(normalizedStatus(record))].join(' ')}
                    >
                      {statusLabel(normalizedStatus(record))}
                    </span>
                  </div>
                  <div className="worker-modal-execution-meta">
                    <span>Inicio: {formatRemoteDate(record.created_at)}</span>
                    <span>
                      Fin:{' '}
                      {formatRemoteDate(firstRemoteValue(record, ['finished_at', 'updated_at']))}
                    </span>
                    <span>Pasos: {steps.length}</span>
                  </div>
                  {steps.length > 0 ? <OperationTimeline steps={steps} /> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <EvidenceState
            title="Sin ejecuciones publicadas"
            reason="No hay operaciones correlacionadas con este worker en la evidencia disponible."
          />
        )}
      </div>
      {relatedEvents.length > 0 ? (
        <div className="worker-modal-section">
          <div className="detail-section-heading">
            <span className="eyebrow">EVENTOS RELACIONADOS</span>
            <strong>{relatedEvents.length} eventos</strong>
          </div>
          <div className="worker-modal-events">
            {relatedEvents.slice(0, 12).map((event, index) => (
              <div className="worker-modal-event" key={String(event.event_id ?? event.id ?? index)}>
                <span className={['state-dot-small', statusClass(event.status)].join(' ')} />
                <div>
                  <strong>{humanize(firstRemoteValue(event, ['code', 'kind', 'status']))}</strong>
                  <span>{remoteText(event, ['service', 'actor'], 'Servicio no publicado')}</span>
                </div>
                <time>
                  {formatRemoteDate(firstRemoteValue(event, ['occurred_at', 'created_at']))}
                </time>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </DetailModal>
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
