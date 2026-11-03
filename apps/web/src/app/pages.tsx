import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  ArrowDownUp,
  Check,
  CheckCircle2,
  CircleOff,
  Clock3,
  Filter,
  KeyRound,
  LockKeyhole,
  MonitorCog,
  Network,
  Power,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Server,
  Settings2,
  Trash2,
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
  ConnectionKind,
  Density,
  FontScale,
  InstanceProvisionRequest,
  ResourceGrant,
  Role,
  Theme,
  User,
} from '@iacoc/contracts';
import {
  useConnections,
  useEvents,
  useIncidents,
  useImages,
  useInstanceDetail,
  useInstanceNetwork,
  useInstancePower,
  useInstances,
  useOperation,
  useOperations,
  useOverview,
  useOverviewSourceSnapshots,
  usePlans,
  useProvisioning,
  useNetworkProfiles,
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
  const queryClient = useQueryClient();
  const overview = useOverview(Boolean(session.data?.authenticated));
  const connections = useConnections(Boolean(session.data?.authenticated));
  const [refreshKey, setRefreshKey] = useState('');
  const [selectedActivity, setSelectedActivity] = useState<{
    selected: SelectedRemoteRecord;
    connectionId: string;
    source: string;
  } | null>(null);
  const snapshots = useOverviewSourceSnapshots(
    connections.data ?? [],
    Boolean(session.data?.authenticated),
    refreshKey,
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
      onRefresh={() => {
        setRefreshKey(String(Date.now()));
        return queryClient.invalidateQueries({
          type: 'active',
          predicate: (query) => query.queryKey[0] !== 'overview-snapshot',
        });
      }}
    >
      <div className="overview-dashboard">
        <GlassSurface className="overview-hero">
          <div className="hero-copy">
            <div className="overview-kicker">
              <span className="eyebrow">CENTRO DE MANDO</span>
              <FreshnessIndicator
                updatedAt={overview.dataUpdatedAt}
                fetching={overview.isFetching || connections.isFetching}
                label="workspace"
              />
            </div>
            <h2>{connected ? 'Workspace conectado' : 'Workspace desconectado'}</h2>
            <p>
              {operationalData?.message ??
                'Cargando el alcance autorizado y las primeras observaciones publicadas.'}
            </p>
          </div>
          <div
            className={['overview-status-inline', connected ? 'overview-status-live' : ''].join(
              ' ',
            )}
          >
            {connected ? <CheckCircle2 size={28} /> : <CircleOff size={28} />}
            <div>
              <strong>
                {connected ? `${activeConnections.length} fuentes activas` : 'Sin alcance remoto'}
              </strong>
              <span>{connected ? 'Lectura autorizada' : 'Conecta una fuente para observarla'}</span>
            </div>
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
            label="Instancias activas / listas"
            value={overviewOperationalCount(snapshots, connections.isPending)}
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
              <h3>Salud por fuente IACP</h3>
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
          <OverviewActivity
            snapshots={snapshots}
            onOpen={(item, kind, snapshot) =>
              setSelectedActivity({
                selected: { item, kind },
                connectionId: snapshot.connection.id,
                source: snapshot.connection.name,
              })
            }
          />
        </GlassSurface>
      </div>
      {selectedActivity ? (
        <RemoteRecordModal
          selected={selectedActivity.selected}
          connectionId={selectedActivity.connectionId}
          source={selectedActivity.source}
          onClose={() => setSelectedActivity(null)}
        />
      ) : null}
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
  if (queries.some((query) => query.isError && !query.data)) return 'No disponible';
  if (resource === 'incidents') {
    const count = snapshots.reduce((total, snapshot) => {
      const data = snapshot.incidents.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) return total;
      const summary = (data as { summary?: unknown }).summary;
      if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return total;
      const publishedTotal = (summary as { total?: unknown }).total;
      return total + (typeof publishedTotal === 'number' ? publishedTotal : 0);
    }, 0);
    return String(count);
  }
  const items = snapshots.flatMap((snapshot) => resourceItems(snapshot[resource]));
  if (resource === 'workers' && items.length === 0) return 'No publicado';
  return String(items.length);
}

function isOperationalInstance(item: Record<string, unknown>): boolean {
  const status = normalizedStatus(item).trim().toLowerCase();
  if (
    [
      'deleted',
      'deleting',
      'failed',
      'uncertain',
      'stale',
      'pending',
      'queued',
      'provisioning',
      'stopped',
    ].includes(status)
  ) {
    return false;
  }
  if (['ready', 'active', 'running'].includes(status)) return true;
  const power = String(firstRemoteValue(item, ['power_state', 'power']) ?? '')
    .trim()
    .toLowerCase();
  return ['running', 'on', 'powered_on'].includes(power);
}

function overviewOperationalCount(
  snapshots: OverviewSourceSnapshot[],
  connectionsPending: boolean,
): string {
  if (snapshots.length === 0) return connectionsPending ? '…' : '0';
  const queries = snapshots.map((snapshot) => snapshot.instances);
  if (queries.some((query) => query.isPending && !query.data)) return '…';
  if (queries.some((query) => query.isError && !query.data)) return 'No disponible';
  return String(
    snapshots.flatMap((snapshot) => resourceItems(snapshot.instances)).filter(isOperationalInstance)
      .length,
  );
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
            {connection.kind === 'controlplane' ? 'PROD' : 'DEV'}
          </span>
          <h4>{connection.name}</h4>
          <small>{connection.endpoint}</small>
        </div>
        <span className={['state-chip', statusClass(connection.status)].join(' ')}>
          {statusLabel(connection.status)}
        </span>
      </div>
      <div className="overview-source-facts">
        <EvidenceRow label="Inventario publicado" value={overviewCountText(snapshot.instances)} />
        <EvidenceRow label="Activas / listas" value={overviewOperationalCount([snapshot], false)} />
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

function OverviewActivity({
  snapshots,
  onOpen,
}: {
  snapshots: OverviewSourceSnapshot[];
  onOpen: (
    item: Record<string, unknown>,
    kind: RemoteRecordKind,
    snapshot: OverviewSourceSnapshot,
  ) => void;
}) {
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
        <button
          className="overview-activity-row overview-activity-button"
          type="button"
          key={String(firstRemoteValue(item, ['operation_id', 'event_id', 'id']) ?? index)}
          onClick={() => onOpen(item, kind === 'operation' ? 'operation' : 'event', snapshot)}
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
        </button>
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

const ACTIVE_CONNECTION_STORAGE_KEY = 'iacoc-v2-active-connection';

function storedActiveConnectionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_CONNECTION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function useActiveConnectionId(connections: Connection[] | undefined) {
  const [connectionId, setConnectionIdState] = useState<string | null>(storedActiveConnectionId);
  const setConnectionId = (value: string) => {
    setConnectionIdState(value);
    try {
      window.localStorage.setItem(ACTIVE_CONNECTION_STORAGE_KEY, value);
    } catch {
      // localStorage can be unavailable in hardened/private browsing modes.
    }
  };
  useEffect(() => {
    if (!connections) return;
    const active = connections.filter((connection) => connection.active);
    const selected = active.some((connection) => connection.id === connectionId)
      ? connectionId
      : (active.find((connection) => connection.id === storedActiveConnectionId())?.id ??
        active[0]?.id ??
        null);
    if (selected !== connectionId) setConnectionIdState(selected);
    if (selected) {
      try {
        window.localStorage.setItem(ACTIVE_CONNECTION_STORAGE_KEY, selected);
      } catch {
        // localStorage is a convenience; the server remains the source of truth.
      }
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

function relatedInstanceForRecord(
  record: Record<string, unknown>,
  instances: Record<string, unknown>[],
): Record<string, unknown> | null {
  const instanceId = firstRemoteValue(record, ['instance_id', 'instanceId']);
  if (instanceId !== null) {
    const byId = instances.find(
      (instance) =>
        String(firstRemoteValue(instance, ['instance_id', 'instanceId', 'id'])) ===
        String(instanceId),
    );
    if (byId) return byId;
  }
  const instanceName = firstRemoteValue(record, ['instance_name', 'instance']);
  if (instanceName !== null) {
    return (
      instances.find(
        (instance) =>
          String(firstRemoteValue(instance, ['name', 'instance_name'])) === String(instanceName),
      ) ?? null
    );
  }
  return null;
}

function mergeRemoteRecord(
  record: Record<string, unknown>,
  instance: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!instance) return record;
  const merged = { ...record };
  const fallbacks: Array<[string, string[]]> = [
    ['instance_id', ['instance_id', 'instanceId', 'id']],
    ['instance_name', ['name', 'instance_name']],
    ['vmid', ['vmid']],
    ['node', ['node', 'target_node']],
    ['plan_id', ['plan_id']],
    ['image_id', ['image_id', 'image']],
  ];
  for (const [target, keys] of fallbacks) {
    if (firstRemoteValue(merged, [target]) !== null) continue;
    const value = firstRemoteValue(instance, keys);
    if (value !== null) merged[target] = value;
  }
  return merged;
}

function remoteText(item: Record<string, unknown>, keys: string[], fallback = 'No publicado') {
  const value = firstRemoteValue(item, keys);
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : fallback;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value === null ? fallback : String(value);
}

function networkEvidenceSources(item: Record<string, unknown>): Record<string, unknown>[] {
  const sources = [item];
  for (const key of [
    'network_observation',
    'network_allocation',
    'network',
    'result',
    'spec',
    'resources',
  ]) {
    const value = item[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sources.push(value as Record<string, unknown>);
    }
  }
  return sources;
}

function remoteNetworkText(
  item: Record<string, unknown>,
  keys: string[],
  fallback = 'No publicado',
): string {
  for (const source of networkEvidenceSources(item)) {
    const value = firstRemoteValue(source, keys);
    if (Array.isArray(value) && value.length === 0) continue;
    if (value !== null) return Array.isArray(value) ? value.join(', ') : String(value);
  }
  return fallback;
}

function remoteIpAddresses(item: Record<string, unknown>): string[] {
  const addresses: string[] = [];
  for (const source of networkEvidenceSources(item)) {
    for (const key of [
      'ip_addresses',
      'observed_ipv4',
      'current_ip_addresses',
      'ips',
      'ip',
      'addresses',
      'address',
    ]) {
      const value = source[key];
      if (Array.isArray(value)) {
        for (const address of value) {
          if (typeof address === 'string' && address && !addresses.includes(address)) {
            addresses.push(address);
          }
        }
      } else if (typeof value === 'string' && value && !addresses.includes(value)) {
        addresses.push(value);
      }
    }
  }
  return addresses;
}

function networkConflictAddresses(items: Record<string, unknown>[]): Set<string> {
  const owners = new Map<string, Set<string>>();
  for (const item of items) {
    if (
      String(firstRemoteValue(item, ['status', 'normalized_status']) ?? '').toLowerCase() ===
      'deleted'
    )
      continue;
    const instanceId = String(item.instance_id ?? item.id ?? item.name ?? 'unknown-instance');
    for (const address of remoteIpAddresses(item)) {
      const addressOwners = owners.get(address) ?? new Set<string>();
      addressOwners.add(instanceId);
      owners.set(address, addressOwners);
    }
  }
  return new Set(
    [...owners.entries()]
      .filter(([, addressOwners]) => addressOwners.size > 1)
      .map(([address]) => address),
  );
}

function IpAddressList({
  item,
  fallback = 'No publicado',
  conflictAddresses = new Set<string>(),
}: {
  item: Record<string, unknown>;
  fallback?: string;
  conflictAddresses?: Set<string>;
}) {
  const addresses = remoteIpAddresses(item);
  if (addresses.length === 0) return <span>{fallback}</span>;
  return (
    <span className="ip-list">
      {addresses.map((address) => (
        <span
          className={['ip-line', conflictAddresses.has(address) ? 'ip-line-conflict' : ''].join(
            ' ',
          )}
          key={address}
          title={
            conflictAddresses.has(address) ? 'IP publicada también en otra instancia' : undefined
          }
        >
          {address}
          {conflictAddresses.has(address) ? <small> conflicto</small> : null}
        </span>
      ))}
    </span>
  );
}

function remoteResourceText(
  item: Record<string, unknown>,
  keys: string[],
  fallback = 'No publicado',
): string {
  const direct = firstRemoteValue(item, keys);
  if (direct !== null) return remoteText(item, keys, fallback);
  for (const key of ['spec', 'resources', 'plan']) {
    const nested = item[key];
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue;
    const value = firstRemoteValue(nested as Record<string, unknown>, keys);
    if (value !== null) return remoteText(nested as Record<string, unknown>, keys, fallback);
  }
  return fallback;
}

function isAssignableInstance(item: Record<string, unknown>): boolean {
  const status = String(
    firstRemoteValue(item, ['normalized_status', 'status']) ?? '',
  ).toLowerCase();
  return !['deleted', 'deleting', 'failed', 'uncertain'].includes(status);
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
  const state = String(value ?? '').toLowerCase();
  if (['running', 'on', 'powered_on'].includes(state)) return 'Encendida';
  if (['stopped', 'off', 'powered_off'].includes(state)) return 'Apagada';
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
      reason="Activa y confirma al menos una conexión IACP desde Connectors."
    />
  );
}

export function InstancesPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const connections = useConnections(Boolean(session.data?.authenticated));
  const [connectionId, setConnectionId] = useActiveConnectionId(connections.data);
  const [status, setStatus] = useState('ready');
  const [name, setName] = useState('');
  const [selectedInstance, setSelectedInstance] = useState<Record<string, unknown> | null>(null);
  const [instanceOffset, setInstanceOffset] = useState(0);
  const [allInstances, setAllInstances] = useState<Record<string, unknown>[]>([]);
  // The stopped view also needs failed provisioning records: IACP's default
  // inventory omits them, even when it has published power_state=stopped.
  // Deleted records are filtered from the view below.
  const includeDeleted = status === 'deleted' || status === 'all' || status === 'stopped';
  const query = {
    limit: 100,
    offset: instanceOffset,
    include_network: true,
    ...(status !== 'active' && status !== 'all' && status !== 'stopped' && status !== 'ready'
      ? { status }
      : {}),
    ...(includeDeleted ? { include_deleted: true } : {}),
    ...(name.trim() ? { name: name.trim() } : {}),
  };
  const instances = useInstances(connectionId, Boolean(session.data?.authenticated), query);
  useEffect(() => {
    if (!instances.data?.items) return;
    setAllInstances((current) => {
      if (instanceOffset === 0) return instances.data.items;
      const keys = new Set(current.map((item) => String(item.instance_id ?? item.id)));
      return [
        ...current,
        ...instances.data.items.filter((item) => !keys.has(String(item.instance_id ?? item.id))),
      ];
    });
  }, [instanceOffset, instances.data]);
  useEffect(() => {
    setAllInstances([]);
    setInstanceOffset(0);
    setSelectedInstance(null);
  }, [connectionId, status, name]);
  const visibleInstances =
    allInstances.filter((item) => {
      const remoteStatus = normalizedStatus(item).toLowerCase();
      const powerState = String(
        firstRemoteValue(item, ['power_state', 'power']) ?? '',
      ).toLowerCase();
      if (status === 'active') return remoteStatus !== 'deleted';
      if (status === 'all') return true;
      if (status === 'deleted') return remoteStatus === 'deleted';
      if (status === 'stopped') {
        return remoteStatus !== 'deleted' && powerState === 'stopped';
      }
      if (status === 'ready') {
        return isOperationalInstance(item);
      }
      return true;
    }) ?? [];
  const conflictAddresses = networkConflictAddresses(visibleInstances);
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
      onRefresh={() => {
        setAllInstances([]);
        setInstanceOffset(0);
        setSelectedInstance(null);
        return queryClient.invalidateQueries({ queryKey: ['instances', connectionId] });
      }}
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
              <option value="ready">Activas / listas</option>
              <option value="active">Todas no eliminadas</option>
              <option value="all">Todo el historial</option>
              <option value="deleted">Eliminadas</option>
              <option value="stopped">Apagada / lista</option>
              <option value="pending">Pendiente</option>
              <option value="provisioning">Aprovisionando</option>
              <option value="failed">Fallida</option>
              <option value="uncertain">Incierta</option>
              <option value="deleting">Eliminando</option>
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
              <button
                className="data-table-row instance-grid instance-row-button"
                role="row"
                key={String(item.instance_id ?? index)}
                type="button"
                onClick={() => setSelectedInstance(item)}
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
                  <IpAddressList item={item} conflictAddresses={conflictAddresses} />
                </span>
                <div className="primary-cell operation-cell">
                  <strong>{operationTitle(latestRecord)}</strong>
                  <span>
                    {formatRemoteDate(
                      firstRemoteValue(latestRecord, ['updated_at', 'finished_at', 'created_at']),
                    )}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        {instances.data?.items.length === 100 ? (
          <button
            className="button button-secondary load-more-button"
            type="button"
            disabled={instances.isFetching}
            onClick={() => setInstanceOffset((current) => current + 100)}
          >
            {instances.isFetching
              ? 'Consultando siguiente página…'
              : 'Cargar siguiente página técnica'}
          </button>
        ) : null}
      </GlassSurface>
      {selectedInstance && connectionId ? (
        <InstanceDetailModal
          item={selectedInstance}
          connectionId={connectionId}
          source={
            connections.data?.find((connection) => connection.id === connectionId)?.name ??
            'Fuente seleccionada'
          }
          onClose={() => setSelectedInstance(null)}
          networkConflictAddresses={conflictAddresses}
        />
      ) : null}
    </PageFrame>
  );
}

function InstanceDetailModal({
  item,
  connectionId,
  source,
  onClose,
  networkConflictAddresses = new Set<string>(),
}: {
  item: Record<string, unknown>;
  connectionId: string;
  source: string;
  onClose: () => void;
  networkConflictAddresses?: Set<string>;
}) {
  const session = useSession();
  const queryClient = useQueryClient();
  const instanceId = String(item.instance_id ?? item.id ?? '');
  const detail = useInstanceDetail(connectionId, instanceId, Boolean(instanceId));
  const power = useInstancePower(connectionId, instanceId, Boolean(instanceId));
  const network = useInstanceNetwork(connectionId, instanceId, Boolean(instanceId));
  const plans = usePlans(connectionId, Boolean(instanceId));
  const operationHistory = useOperations(connectionId, Boolean(instanceId), {
    instance_id: instanceId,
    limit: 20,
    sort: 'desc',
  });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const record = detail.data?.item ?? item;
  const planId = String(firstRemoteValue(record, ['plan_id']) ?? '');
  const publishedPlan = plans.data?.items.find(
    (plan) => String(plan.plan_id ?? plan.id ?? '') === planId,
  );
  const resourceRecord = publishedPlan ? { ...record, plan: publishedPlan } : record;
  const powerRecord = power.data?.item ?? record;
  const networkRecord = network.data?.item ?? {};
  const powerState = String(
    firstRemoteValue(powerRecord, ['power_state', 'power']) ?? '',
  ).toLowerCase();
  const isStopped = powerState === 'stopped';
  const recordStatus = normalizedStatus(record).toLowerCase();
  const vmidValue = firstRemoteValue(record, ['vmid']);
  const failedWithoutVmid =
    recordStatus === 'failed' &&
    (vmidValue === undefined || vmidValue === null || String(vmidValue).trim() === '');
  const canRequestDelete = isStopped || failedWithoutVmid;
  const canOperate = session.data?.user?.role !== 'Lector';
  const activeOperation = (operationHistory.data?.items ?? []).find((candidate) => {
    const candidateInstanceId = firstRemoteValue(candidate, ['instance_id', 'instanceId']);
    const status = normalizedStatus(candidate).toLowerCase();
    return (
      (!candidateInstanceId || String(candidateInstanceId) === instanceId) &&
      ['queued', 'running'].includes(status)
    );
  });
  const operationPending = Boolean(activeOperation);
  const actionDisabled = Boolean(busyAction) || !canOperate || operationPending;

  async function runAction(label: string, action: () => Promise<unknown>) {
    const csrfToken = session.data?.csrfToken;
    if (!csrfToken || !canOperate) return;
    setBusyAction(label);
    setMessage(null);
    setError(null);
    try {
      await action();
      setMessage(`${label} enviada a IACP. El estado se actualizará con la próxima evidencia.`);
      await Promise.all([
        detail.refetch(),
        power.refetch(),
        network.refetch(),
        queryClient.invalidateQueries({ queryKey: ['instances', connectionId] }),
        queryClient.invalidateQueries({ queryKey: ['operations', connectionId] }),
        queryClient.invalidateQueries({ queryKey: ['events', connectionId] }),
        queryClient.invalidateQueries({ queryKey: ['workers', connectionId] }),
      ]);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : `No fue posible ${label.toLowerCase()}.`,
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteInstance() {
    const csrfToken = session.data?.csrfToken;
    if (!csrfToken || !canOperate || !canRequestDelete) return;
    const confirmation = failedWithoutVmid
      ? 'El aprovisionamiento falló antes de publicar un VMID. ¿Solicitas a IACP retirar este recurso fallido? La API validará si la eliminación es segura.'
      : '¿Confirmas eliminar esta instancia? Esta acción es destructiva.';
    if (!window.confirm(confirmation)) return;
    setBusyAction('Eliminar instancia');
    setMessage(null);
    setError(null);
    try {
      await apiClient.deleteInstance(connectionId, instanceId, { confirm: true }, csrfToken);
      setMessage('Eliminación solicitada a IACP.');
      await queryClient.invalidateQueries({ queryKey: ['instances', connectionId] });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No fue posible eliminar la instancia.');
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshNetwork() {
    setBusyAction('Consultar red');
    setMessage(null);
    setError(null);
    try {
      const result = await network.refetch();
      if (result.error) throw result.error;
      await queryClient.invalidateQueries({ queryKey: ['instances', connectionId] });
      setMessage('Red consultada desde IACP. La evidencia publicada se conserva en el detalle.');
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'No fue posible consultar la evidencia de red publicada por IACP.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <DetailModal
      open
      title={remoteText(record, ['name', 'instance_name'], 'Instancia sin nombre')}
      subtitle={`${source} · ficha de consumidor y ciclo de vida`}
      onClose={onClose}
      className="instance-detail-modal"
    >
      <div className="detail-status-line">
        <span className={['state-chip', statusClass(record.status)].join(' ')}>
          {statusLabel(record.status)}
        </span>
        <FreshnessIndicator
          updatedAt={
            Math.max(detail.dataUpdatedAt, power.dataUpdatedAt, network.dataUpdatedAt) || undefined
          }
          fetching={detail.isFetching || power.isFetching || network.isFetching}
          label="instancia"
        />
      </div>
      <div className="detail-fact-grid">
        <DetailFact label="Identificador" value={instanceId} />
        <DetailFact label="Estado" value={statusLabel(record.status)} />
        <DetailFact label="Energía" value={energyLabel(powerState || record.power_state)} />
        <DetailFact label="Nodo" value={remoteText(record, ['node', 'target_node'])} />
        <DetailFact label="VMID" value={remoteText(record, ['vmid'])} />
        <DetailFact
          label="IP publicada"
          value={
            <IpAddressList
              item={{ ...record, network: networkRecord }}
              conflictAddresses={networkConflictAddresses}
            />
          }
        />
        <DetailFact
          label="Modo de red"
          value={remoteNetworkText({ ...record, network: networkRecord }, ['network_mode'])}
        />
        <DetailFact
          label="Perfil de red"
          value={remoteNetworkText({ ...record, network: networkRecord }, ['network_profile'])}
        />
        <DetailFact
          label="Sistema operativo"
          value={remoteText(record, ['operating_system', 'os', 'image', 'image_id'])}
        />
        <DetailFact label="Plan" value={remoteText(record, ['plan_name', 'plan_id', 'plan'])} />
        <DetailFact
          label="vCPU"
          value={remoteResourceText(resourceRecord, ['vcpus', 'vcpu', 'cpu'])}
        />
        <DetailFact
          label="Memoria"
          value={remoteResourceText(resourceRecord, ['memory_mb', 'memory', 'ram'])}
        />
        <DetailFact
          label="Disco"
          value={remoteResourceText(resourceRecord, ['disk_gb', 'disk', 'storage'])}
        />
        <DetailFact
          label="Última operación"
          value={operationTitle((record.latest_operation as Record<string, unknown>) ?? record)}
        />
      </div>
      <div className="instance-detail-actions">
        <div className="detail-section-heading">
          <span className="eyebrow">CICLO DE VIDA</span>
          <strong>{canOperate ? 'Operación disponible según asignación' : 'Solo lectura'}</strong>
        </div>
        <div className="action-button-grid">
          {isStopped ? (
            <button
              className="button button-primary"
              type="button"
              disabled={actionDisabled}
              onClick={() =>
                void runAction('Encender instancia', () =>
                  apiClient.startInstance(connectionId, instanceId, session.data?.csrfToken ?? ''),
                )
              }
            >
              <Power size={15} /> {busyAction === 'Encender instancia' ? 'Enviando…' : 'Encender'}
            </button>
          ) : (
            <button
              className="button button-secondary"
              type="button"
              disabled={actionDisabled || !powerState}
              onClick={() =>
                void runAction('Apagar instancia', () =>
                  apiClient.shutdownInstance(
                    connectionId,
                    instanceId,
                    session.data?.csrfToken ?? '',
                  ),
                )
              }
            >
              <Power size={15} /> {busyAction === 'Apagar instancia' ? 'Enviando…' : 'Apagar'}
            </button>
          )}
          <button
            className="button button-secondary"
            type="button"
            disabled={actionDisabled || isStopped}
            onClick={() =>
              void runAction('Reiniciar instancia', () =>
                apiClient.rebootInstance(connectionId, instanceId, session.data?.csrfToken ?? ''),
              )
            }
          >
            <RotateCcw size={15} /> Reiniciar
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={Boolean(busyAction)}
            onClick={() => void refreshNetwork()}
          >
            <Network size={15} />{' '}
            {busyAction === 'Consultar red' ? 'Consultando…' : 'Consultar red'}
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={actionDisabled}
            onClick={() =>
              void runAction('Sincronizar estado', () =>
                apiClient.reconcileInstance(
                  connectionId,
                  instanceId,
                  session.data?.csrfToken ?? '',
                ),
              )
            }
          >
            <RefreshCw size={15} /> Sincronizar
          </button>
          {canRequestDelete ? (
            <button
              className="button button-danger"
              type="button"
              disabled={actionDisabled}
              onClick={() => void deleteInstance()}
            >
              <Trash2 size={15} />{' '}
              {busyAction === 'Eliminar instancia' ? 'Eliminando…' : 'Eliminar instancia'}
            </button>
          ) : null}
        </div>
        {operationPending ? (
          <p className="muted-copy">
            IACP tiene una operación en curso; los controles de energía y eliminación se habilitarán
            cuando publique su resultado.
          </p>
        ) : null}
        {power.isError ? (
          <p className="muted-copy">
            No se pudo confirmar la energía; no se muestra el botón destructivo.
          </p>
        ) : null}
        {message ? <p className="form-success">{message}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </div>
      <div className="detail-callout">
        <span className="eyebrow">RED PUBLICADA</span>
        <p>
          {network.isError ? (
            'La fuente no publicó el detalle de red para esta instancia.'
          ) : (
            <IpAddressList
              item={{ ...record, network: networkRecord }}
              conflictAddresses={networkConflictAddresses}
              fallback="IP pendiente de observación por IACP; usa «Consultar red» para volver a observarla."
            />
          )}
        </p>
      </div>
      {detail.isError ? (
        <EvidenceState
          title="Detalle ampliado no disponible"
          tone="warning"
          reason="Se conserva el registro de inventario; IACP no respondió el detalle individual."
        />
      ) : null}
    </DetailModal>
  );
}

type ProvisioningForm = {
  name: string;
  planId: string;
  imageId: string;
  networkProfile: 'lab-dhcp' | 'wan-static';
  startOnCreate: boolean;
  rootPassword: string;
  sshPublicKeys: string;
  customerId: string;
  customerTag: string;
  orderId: string;
  productId: string;
};

export function ProvisioningPage() {
  const session = useSession();
  const connections = useConnections(Boolean(session.data?.authenticated));
  const [connectionId, setConnectionId] = useActiveConnectionId(connections.data);
  const plans = usePlans(connectionId, Boolean(session.data?.authenticated));
  const images = useImages(connectionId, Boolean(session.data?.authenticated));
  const networkProfiles = useNetworkProfiles(connectionId, Boolean(session.data?.authenticated));
  const provisioning = useProvisioning(connectionId, Boolean(session.data?.authenticated));
  const queryClient = useQueryClient();
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const csrfToken = session.data?.csrfToken;
  const { register, handleSubmit } = useForm<ProvisioningForm>({
    defaultValues: {
      name: '',
      planId: '',
      imageId: '',
      networkProfile: 'lab-dhcp',
      startOnCreate: true,
      rootPassword: '',
      sshPublicKeys: '',
      customerId: '',
      customerTag: '',
      orderId: '',
      productId: '',
    },
  });

  async function submit(values: ProvisioningForm) {
    if (!connectionId || !csrfToken) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const input: InstanceProvisionRequest = {
        name: values.name,
        planId: values.planId,
        imageId: values.imageId,
        connectionId,
        networkProfile: values.networkProfile,
        startOnCreate: values.startOnCreate,
        accessMode: 'managed-ssh',
        access: {
          ...(values.rootPassword.trim() ? { rootPassword: values.rootPassword } : {}),
          sshPublicKeys: values.sshPublicKeys
            .split(/\r?\n/)
            .map((key) => key.trim())
            .filter(Boolean),
        },
        commercialContext:
          values.customerId || values.customerTag || values.orderId || values.productId
            ? {
                ...(values.customerId ? { customerId: values.customerId } : {}),
                ...(values.customerTag ? { customerTag: values.customerTag } : {}),
                ...(values.orderId ? { orderId: values.orderId } : {}),
                ...(values.productId ? { productId: values.productId } : {}),
              }
            : undefined,
      };
      const response = await apiClient.provisionInstance(input, csrfToken);
      setResult(response);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['instances', connectionId] }),
        queryClient.invalidateQueries({ queryKey: ['operations', connectionId] }),
        queryClient.invalidateQueries({ queryKey: ['events', connectionId] }),
        queryClient.invalidateQueries({ queryKey: ['provisioning', connectionId] }),
      ]);
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
            Elige exclusivamente planes, imágenes y perfiles publicados por la API. Si no envías
            contraseña, el BFF genera una credencial efímera que nunca se muestra ni se persiste.
          </p>
          <form className="form-stack" onSubmit={handleSubmit(submit)}>
            <label>
              Nombre técnico
              <input {...register('name', { required: true })} placeholder="iacoc-v2-smoke" />
            </label>
            <label>
              Plan
              <select {...register('planId')}>
                <option value="">Selecciona un plan publicado</option>
                {plans.data?.items.map((plan, index) => (
                  <option
                    key={String(plan.plan_id ?? plan.id ?? index)}
                    value={String(plan.plan_id ?? plan.id ?? '')}
                  >
                    {String(plan.name ?? plan.plan_id ?? plan.id ?? 'Plan publicado')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Imagen
              <select {...register('imageId')}>
                <option value="">Selecciona una imagen publicada</option>
                {images.data?.items.map((image, index) => (
                  <option
                    key={String(image.image_id ?? image.id ?? index)}
                    value={String(image.image_id ?? image.id ?? '')}
                  >
                    {String(
                      image.operating_system ??
                        image.name ??
                        image.image_id ??
                        image.id ??
                        'Imagen publicada',
                    )}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Perfil de red
              <select {...register('networkProfile')}>
                <option value="lab-dhcp">Lab DHCP · red de laboratorio</option>
                <option value="wan-static">WAN estática · si la fuente lo publica</option>
                {networkProfiles.data?.items.map((profile, index) => {
                  const id = String(profile.profile_id ?? profile.id ?? profile.name ?? index);
                  const value =
                    id === 'prod_static' || id === 'wan-static'
                      ? 'wan-static'
                      : id === 'lab_dhcp' || id === 'lab-dhcp'
                        ? 'lab-dhcp'
                        : null;
                  if (!value) return null;
                  return (
                    <option key={id} value={value}>
                      {String(
                        profile.name ??
                          profile.label ??
                          profile.profile_id ??
                          profile.id ??
                          'Perfil publicado',
                      )}
                    </option>
                  );
                })}
              </select>
            </label>
            <div className="form-grid-two">
              <label>
                Contraseña root (opcional)
                <input
                  {...register('rootPassword', { minLength: 16 })}
                  type="password"
                  autoComplete="new-password"
                  placeholder="mínimo 16 caracteres"
                />
              </label>
              <label>
                Llaves SSH públicas
                <textarea
                  {...register('sshPublicKeys')}
                  rows={3}
                  placeholder="Una llave por línea; preferida para acceso"
                />
              </label>
            </div>
            <label className="setting-toggle">
              <input type="checkbox" {...register('startOnCreate')} />
              <span>
                <strong>Encender al terminar el aprovisionamiento</strong>
                <small>
                  La solicitud se envía a IACP; el estado final se observa en Instances.
                </small>
              </span>
            </label>
            <details className="advanced-form-section">
              <summary>
                <KeyRound size={15} /> Contexto comercial opcional
              </summary>
              <p className="muted-copy">
                Solo se envían los campos que el contrato de la fuente acepta.
              </p>
              <div className="form-grid-two">
                <label>
                  Customer ID
                  <input {...register('customerId')} placeholder="customer-001" />
                </label>
                <label>
                  Customer tag
                  <input {...register('customerTag')} placeholder="laboratorio" />
                </label>
                <label>
                  Order ID
                  <input {...register('orderId')} placeholder="ORD-1001" />
                </label>
                <label>
                  Product ID
                  <input {...register('productId')} placeholder="KVM-2" />
                </label>
              </div>
            </details>
            <button
              className="button button-primary"
              disabled={
                busy ||
                !connectionId ||
                session.data?.user?.role === 'Lector' ||
                !plans.data?.items.length ||
                !images.data?.items.length
              }
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
          {result && typeof result === 'object' ? (
            <div className="result-block">
              <strong>Solicitud enviada a IACP</strong>
              <span>HTTP {String((result as Record<string, unknown>).status ?? 'aceptada')}</span>
              <small>
                Idempotencia:{' '}
                {String(
                  (result as Record<string, unknown>).idempotencyKey ?? 'publicada por el BFF',
                )}
              </small>
              {(() => {
                const tracking = (result as Record<string, unknown>).tracking;
                if (!tracking || typeof tracking !== 'object') return null;
                const values = tracking as Record<string, unknown>;
                return (
                  <small>
                    Seguimiento · instancia: {String(values.instanceId ?? 'pendiente')} · operación:{' '}
                    {String(values.operationId ?? 'pendiente')}
                  </small>
                );
              })()}
            </div>
          ) : null}
          {provisioning.data?.items.length ? (
            <div className="result-block provisioning-history">
              <strong>Solicitudes recientes</strong>
              {provisioning.data.items.slice(0, 8).map((item) => (
                <div className="provisioning-history-row" key={item.id}>
                  <span>
                    <strong>{item.requestedName ?? 'Instancia solicitada'}</strong>
                    <small>
                      {item.instanceId ?? 'ID pendiente'} ·{' '}
                      {item.operationId ?? 'operación pendiente'}
                    </small>
                  </span>
                  <span className={['state-chip', statusClass(item.status)].join(' ')}>
                    {statusLabel(item.status)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
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
  const queryClient = useQueryClient();
  const connections = useConnections(Boolean(session.data?.authenticated));
  const [connectionId, setConnectionId] = useActiveConnectionId(connections.data);
  const [pageOffset, setPageOffset] = useState(0);
  const [allRemoteItems, setAllRemoteItems] = useState<Record<string, unknown>[]>([]);
  const [refreshKey, setRefreshKey] = useState('');
  const operations = useOperations(
    connectionId,
    Boolean(session.data?.authenticated && kind === 'operations'),
    {
      limit: 100,
      offset: pageOffset,
    },
  );
  const events = useEvents(
    connectionId,
    Boolean(session.data?.authenticated && kind === 'events'),
    {
      limit: 100,
      offset: pageOffset,
      sort: 'desc',
      ...(refreshKey && kind === 'events' ? { refresh: refreshKey } : {}),
    },
  );
  const remote = kind === 'operations' ? operations : events;
  const instances = useInstances(connectionId, Boolean(session.data?.authenticated), {
    limit: 100,
    include_deleted: true,
  });
  const [instanceFilter, setInstanceFilter] = useState('');
  const [recordLimit, setRecordLimit] = useState(18);
  const [selectedRecord, setSelectedRecord] = useState<SelectedRemoteRecord | null>(null);
  useEffect(() => {
    if (!remote.data?.items) return;
    setAllRemoteItems((current) => {
      if (pageOffset === 0) return remote.data.items;
      const keys = new Set(
        current.map((item) => String(item.operation_id ?? item.event_id ?? item.id)),
      );
      return [
        ...current,
        ...remote.data.items.filter(
          (item) => !keys.has(String(item.operation_id ?? item.event_id ?? item.id)),
        ),
      ];
    });
  }, [pageOffset, remote.data]);
  useEffect(() => {
    setAllRemoteItems([]);
    setPageOffset(0);
  }, [connectionId]);
  const enrichedRemoteItems = allRemoteItems.map((item) =>
    mergeRemoteRecord(item, relatedInstanceForRecord(item, instances.data?.items ?? [])),
  );
  const filteredItems = newestFirst(
    enrichedRemoteItems.filter((item) => {
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
  function refreshHistory() {
    setPageOffset(0);
    setAllRemoteItems([]);
    setSelectedRecord(null);
    setRecordLimit(18);
    if (kind === 'events') setRefreshKey(String(Date.now()));
    return queryClient.invalidateQueries({
      queryKey: [kind === 'operations' ? 'operations' : 'events', connectionId],
    });
  }
  if (!session.data?.authenticated && !session.isPending)
    return (
      <PageFrame eyebrow={eyebrow} title={title} description={description}>
        <LoginRequired />
      </PageFrame>
    );
  return (
    <PageFrame eyebrow={eyebrow} title={title} description={description} onRefresh={refreshHistory}>
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
            disabled={remote.isFetching}
            onClick={() => void refreshHistory()}
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
        {remote.data?.items.length === 100 ? (
          <button
            className="button button-secondary load-more-button"
            type="button"
            disabled={remote.isFetching}
            onClick={() => setPageOffset((current) => current + 100)}
          >
            {remote.isFetching
              ? 'Consultando siguiente página…'
              : 'Cargar siguiente página técnica'}
          </button>
        ) : null}
        {recordLimit < filteredItems.length ? (
          <button
            className="button button-secondary load-more-button"
            type="button"
            onClick={() => setRecordLimit((current) => current + 18)}
          >
            Mostrar más registros
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

type RemoteRecordKind = 'operation' | 'event' | 'instance';

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
          label={kind === 'operation' ? 'Worker' : 'Actor / worker'}
          value={remoteText(
            item,
            kind === 'operation'
              ? ['worker_id', 'worker']
              : ['actor', 'service', 'worker_id', 'worker'],
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
  recoveryMode = false,
}: {
  selected: SelectedRemoteRecord;
  connectionId: string | null;
  source: string;
  onClose: () => void;
  recoveryMode?: boolean;
}) {
  const session = useSession();
  const queryClient = useQueryClient();
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const latestOperation =
    selected.item.latest_operation && typeof selected.item.latest_operation === 'object'
      ? (selected.item.latest_operation as Record<string, unknown>)
      : null;
  const operationId =
    firstRemoteValue(selected.item, ['operation_id']) ??
    (latestOperation ? firstRemoteValue(latestOperation, ['operation_id', 'id']) : null);
  const operationDetail = useOperation(
    connectionId,
    typeof operationId === 'string' ? operationId : null,
    Boolean(operationId),
  );
  const operationEvidence = operationDetail.data?.item;
  const operationItem =
    selected.kind === 'instance'
      ? { ...(operationEvidence ?? latestOperation ?? {}), ...selected.item }
      : selected.kind === 'operation' || !operationEvidence
        ? (operationEvidence ?? selected.item)
        : mergeRemoteRecord(selected.item, operationEvidence);
  const recordInstanceId = firstRemoteValue(operationItem, ['instance_id', 'instanceId']);
  const instanceDetail = useInstanceDetail(
    connectionId,
    typeof recordInstanceId === 'string' ? recordInstanceId : null,
    typeof recordInstanceId === 'string',
  );
  const item = mergeRemoteRecord(operationItem, instanceDetail.data?.item ?? null);
  const instanceId = firstRemoteValue(item, ['instance_id', 'instanceId', 'id']);
  const canRequestReconcile =
    recoveryMode &&
    normalizedStatus(item).toLowerCase() === 'uncertain' &&
    typeof instanceId === 'string' &&
    ['Operador', 'Administrador'].includes(session.data?.user?.role ?? '');
  async function requestReconcile() {
    if (!connectionId || typeof instanceId !== 'string' || !canRequestReconcile) return;
    setRecoveryBusy(true);
    setRecoveryMessage(null);
    setRecoveryError(null);
    try {
      await apiClient.reconcileInstance(connectionId, instanceId, session.data?.csrfToken ?? '');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['incidents', connectionId] }),
        queryClient.invalidateQueries({ queryKey: ['operations', connectionId] }),
        queryClient.invalidateQueries({ queryKey: ['events', connectionId] }),
        queryClient.invalidateQueries({ queryKey: ['instances', connectionId] }),
        queryClient.invalidateQueries({ queryKey: ['instance-detail', connectionId, instanceId] }),
      ]);
      setRecoveryMessage(
        'Solicitud de reconciliación enviada sobre la misma instancia. Consulta la evidencia nueva de IACP antes de continuar.',
      );
    } catch (cause) {
      setRecoveryError(
        cause instanceof ApiError
          ? cause.message
          : 'IACP no aceptó la solicitud de reconciliación. La evidencia original se conserva.',
      );
    } finally {
      setRecoveryBusy(false);
    }
  }
  const steps = Array.isArray(item.events)
    ? item.events.filter((step): step is Record<string, unknown> =>
        Boolean(step && typeof step === 'object'),
      )
    : [];
  return (
    <DetailModal
      open
      title={
        selected.kind === 'instance'
          ? `Fallo de instancia · ${remoteText(item, ['name', 'instance_name'], 'sin nombre')}`
          : operationTitle(item)
      }
      subtitle={`${source} · ${selected.kind === 'operation' ? 'operación técnica' : selected.kind === 'instance' ? 'estado de instancia publicado' : 'evento auditable'}`}
      onClose={onClose}
      className="record-detail-modal"
    >
      <div className="detail-status-line">
        <span className={['state-chip', statusClass(normalizedStatus(item))].join(' ')}>
          {statusLabel(normalizedStatus(item))}
        </span>
        <FreshnessIndicator
          updatedAt={Math.max(operationDetail.dataUpdatedAt, instanceDetail.dataUpdatedAt)}
          fetching={operationDetail.isFetching || instanceDetail.isFetching}
          label="detalle"
        />
      </div>
      <div className="detail-fact-grid">
        <DetailFact
          label="Identificador"
          value={
            selected.kind === 'operation'
              ? remoteText(item, ['operation_id', 'id'])
              : selected.kind === 'instance'
                ? remoteText(item, ['instance_id', 'id'])
                : remoteText(item, ['event_id', 'id'])
          }
        />
        <DetailFact label="Instancia" value={remoteText(item, ['instance_name', 'instance_id'])} />
        <DetailFact label="VMID" value={remoteText(item, ['vmid'])} />
        <DetailFact label="Nodo" value={remoteText(item, ['node', 'target_node'])} />
        <DetailFact
          label="IP publicada"
          value={remoteNetworkText(item, [
            'ip_addresses',
            'observed_ipv4',
            'current_ip_addresses',
            'ips',
            'ip',
            'addresses',
          ])}
        />
        <DetailFact
          label="Sistema operativo"
          value={remoteText(item, ['operating_system', 'os', 'image', 'image_id'])}
        />
        <DetailFact label="Plan" value={remoteText(item, ['plan_name', 'plan_id', 'plan'])} />
        <DetailFact
          label="Actor / worker"
          value={remoteText(item, ['actor', 'service', 'worker_id', 'worker'])}
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
          value={(() => {
            const requester = firstRemoteValue(item, [
              'requested_by_connector',
              'connector',
              'requested_by',
              'request_origin',
              'requested_via',
              'actor',
              'service',
            ]);
            return requester ? `${String(requester)} · ${source}` : source;
          })()}
        />
      </div>
      {recoveryMode ? (
        <IncidentRecoveryPanel
          item={item}
          sessionRole={session.data?.user?.role ?? 'Lector'}
          busy={recoveryBusy}
          message={recoveryMessage}
          error={recoveryError}
          onReconcile={() => void requestReconcile()}
          canRequestReconcile={canRequestReconcile}
        />
      ) : null}
      {selected.kind !== 'event' && steps.length > 0 ? <OperationTimeline steps={steps} /> : null}
      {selected.kind !== 'event' && steps.length === 0 ? (
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

function IncidentRecoveryPanel({
  item,
  sessionRole,
  busy,
  message,
  error,
  onReconcile,
  canRequestReconcile,
}: {
  item: Record<string, unknown>;
  sessionRole: string;
  busy: boolean;
  message: string | null;
  error: string | null;
  onReconcile: () => void;
  canRequestReconcile: boolean;
}) {
  const status = normalizedStatus(item).toLowerCase();
  const reason = firstRemoteValue(item, [
    'error_message',
    'failure_reason',
    'error_detail',
    'error',
    'reason',
    'message',
    'detail',
  ]);
  const recommendation =
    status === 'uncertain'
      ? 'El resultado no está confirmado. Solicita reconciliación sobre el mismo UUID y revisa la operación publicada antes de repetir una acción.'
      : status === 'stale'
        ? 'La evidencia figura como obsoleta. Actualiza el historial y consulta el estado de la instancia; no se inicia una operación automáticamente.'
        : status === 'failed'
          ? 'IACP publicó un fallo. Revisa el código, el mensaje y los pasos correlacionados; corrige la causa indicada antes de solicitar otra acción.'
          : 'Verifica la evidencia y el estado actual de IACP antes de solicitar una acción de recuperación.';
  return (
    <section className="incident-recovery-panel" aria-label="Análisis y recuperación">
      <span className="eyebrow">ANÁLISIS Y RECUPERACIÓN</span>
      <h3>{reason ? 'Causa publicada por IACP' : 'IACP no publicó una causa específica'}</h3>
      <p>
        {reason
          ? remoteText(item, [
              'error_message',
              'failure_reason',
              'error_detail',
              'error',
              'reason',
              'message',
              'detail',
            ])
          : 'El portal no infiere el motivo. Consulta el código, el identificador de operación y los eventos correlacionados en esta ficha.'}
      </p>
      <p>{recommendation}</p>
      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {status === 'uncertain' && !canRequestReconcile ? (
        <p>
          {typeof firstRemoteValue(item, ['instance_id', 'instanceId', 'id']) !== 'string'
            ? 'No se publicó el UUID de instancia; no se puede dirigir una reconciliación segura.'
            : sessionRole === 'Lector'
              ? 'Tu rol es de solo lectura. Un operador asignado o administrador puede solicitar la reconciliación.'
              : 'La instancia debe estar asignada a tu usuario y el conector debe permitir operación.'}
        </p>
      ) : null}
      {canRequestReconcile ? (
        <div className="incident-recovery-actions">
          <button
            className="button button-secondary button-small"
            type="button"
            disabled={busy}
            onClick={onReconcile}
          >
            <RefreshCw size={13} className={busy ? 'refresh-spin' : undefined} />
            {busy ? 'Solicitando reconciliación…' : 'Solicitar reconciliación'}
          </button>
          <span className="live-caption">IACP valida la acción para esta instancia.</span>
        </div>
      ) : null}
    </section>
  );
}

function DetailFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="detail-fact">
      <span>{label}</span>
      <strong className="detail-fact-value">{value}</strong>
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
  const instances = useInstances(connectionId, Boolean(session.data?.authenticated), {
    limit: 100,
    include_deleted: true,
  });
  const [workerFilter, setWorkerFilter] = useState('');
  const [selectedWorker, setSelectedWorker] = useState<Record<string, unknown> | null>(null);
  if (!session.data?.authenticated && !session.isPending)
    return (
      <PageFrame
        eyebrow="TELEMETRY"
        title="Workers & Queues"
        description="Ejecución real publicada por la fuente seleccionada."
      >
        <LoginRequired />
      </PageFrame>
    );
  const observation = workers.data?.observability ?? {};
  const instanceItems = instances.data?.items ?? [];
  const enrich = (record: Record<string, unknown>) =>
    mergeRemoteRecord(record, relatedInstanceForRecord(record, instanceItems));
  const workerItems: Record<string, unknown>[] = (workers.data?.items ?? []).map((item) => {
    const current = item.current_operation;
    const last = item.last_operation;
    return {
      ...item,
      current_operation:
        current && typeof current === 'object'
          ? enrich(current as Record<string, unknown>)
          : current,
      last_operation:
        last && typeof last === 'object' ? enrich(last as Record<string, unknown>) : last,
    };
  });
  const operationItems = newestFirst((operations.data?.items ?? []).map(enrich));
  const eventItems = newestFirst((events.data?.items ?? []).map(enrich));
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
            {relatedEvents.map((event, index) => (
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
  const queryClient = useQueryClient();
  const connections = useConnections(Boolean(session.data?.authenticated));
  const [connectionId, setConnectionId] = useActiveConnectionId(connections.data);
  const [incidentOffset, setIncidentOffset] = useState(0);
  const [allIncidents, setAllIncidents] = useState<Record<string, unknown>[]>([]);
  const [refreshKey, setRefreshKey] = useState('');
  const [period, setPeriod] = useState<'7d' | 'all'>('7d');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [selectedIncident, setSelectedIncident] = useState<SelectedRemoteRecord | null>(null);
  const incidents = useIncidents(connectionId, Boolean(session.data?.authenticated), {
    limit: 100,
    offset: incidentOffset,
    sort: sortOrder === 'newest' ? 'desc' : 'asc',
    period,
    ...(refreshKey ? { refresh: refreshKey } : {}),
  });
  useEffect(() => {
    if (!incidents.data?.items) return;
    setAllIncidents((current) => {
      if (incidentOffset === 0) return incidents.data.items;
      const keys = new Set(
        current.map(
          (incident) => `${String(incident.source)}:${String(incident.incidentId ?? incident.id)}`,
        ),
      );
      return [
        ...current,
        ...incidents.data.items.filter(
          (incident) =>
            !keys.has(`${String(incident.source)}:${String(incident.incidentId ?? incident.id)}`),
        ),
      ];
    });
  }, [incidentOffset, incidents.data]);
  useEffect(() => {
    setIncidentOffset(0);
    setAllIncidents([]);
    setSelectedIncident(null);
  }, [connectionId]);
  function refreshIncidents() {
    setIncidentOffset(0);
    setAllIncidents([]);
    setSelectedIncident(null);
    setRefreshKey(String(Date.now()));
    return queryClient.invalidateQueries({ queryKey: ['incidents', connectionId] });
  }
  function toggleSortOrder() {
    setIncidentOffset(0);
    setAllIncidents([]);
    setSortOrder((current) => (current === 'newest' ? 'oldest' : 'newest'));
  }
  const sortedIncidents = [...allIncidents].sort((left, right) => {
    const leftItem =
      left.item && typeof left.item === 'object' ? (left.item as Record<string, unknown>) : left;
    const rightItem =
      right.item && typeof right.item === 'object'
        ? (right.item as Record<string, unknown>)
        : right;
    const difference = evidenceTimestamp(rightItem) - evidenceTimestamp(leftItem);
    return sortOrder === 'newest' ? difference : -difference;
  });
  const visibleIncidents = sortedIncidents.filter((incident) => {
    if (period === 'all') return true;
    const item =
      incident.item && typeof incident.item === 'object'
        ? (incident.item as Record<string, unknown>)
        : incident;
    const timestamp = evidenceTimestamp(item);
    const status = normalizedStatus(item).toLowerCase();
    return (
      incident.source === 'instance' ||
      status === 'uncertain' ||
      status === 'stale' ||
      (timestamp > 0 && timestamp >= Date.now() - 7 * 24 * 60 * 60 * 1000)
    );
  });
  const incidentSummary = incidents.data?.summary;
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
      onRefresh={refreshIncidents}
    >
      <GlassSurface className="module-surface">
        <ActiveConnectionRequired
          connections={connections.data ?? []}
          connectionId={connectionId}
          onChange={setConnectionId}
        />
        <div className="module-toolbar incident-toolbar">
          <span className="live-caption">
            <Activity size={14} />
            {incidentSummary
              ? `${incidentSummary.total} registros · ${incidentSummary.filteredTotal} recientes o sin resolver`
              : 'Fallos de inventario, operaciones y eventos publicados'}
          </span>
          <label className="sr-only" htmlFor="incident-period">
            Periodo de incidentes
          </label>
          <select
            className="incident-period-select"
            id="incident-period"
            value={period}
            onChange={(event) => {
              setIncidentOffset(0);
              setAllIncidents([]);
              setPeriod(event.target.value as '7d' | 'all');
            }}
          >
            <option value="7d">Recientes / sin resolver</option>
            <option value="all">Todo el historial</option>
          </select>
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={toggleSortOrder}
          >
            <ArrowDownUp size={13} /> {sortOrder === 'newest' ? 'Más recientes' : 'Más antiguas'}
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
        {!incidents.isPending && !incidents.isError && incidentSummary?.total === 0 ? (
          <div className="empty-inline">
            <CheckCircle2 size={18} /> No hay incidentes fallidos o inciertos publicados.
          </div>
        ) : null}
        {!incidents.isPending &&
        !incidents.isError &&
        period === '7d' &&
        incidentSummary?.total &&
        incidentSummary.filteredTotal === 0 ? (
          <EvidenceState
            title="No hay fallos recientes ni estados sin resolver"
            reason={`Hay ${incidentSummary.total} registros anteriores en el historial; cambia a “Todo el historial” para consultarlos. Las ${incidentSummary.undated} entradas sin fecha ni estado pendiente de resolución no se presentan como actuales.`}
          />
        ) : null}
        {period === '7d' && incidentSummary?.undated ? (
          <p className="incident-summary">
            <span>{incidentSummary.undated} registros sin fecha publicada</span>
            <span>Se reservan para “Todo el historial” porque no prueban vigencia actual.</span>
          </p>
        ) : null}
        <div className="incident-table-scroll">
          <div className="incident-head incident-row">
            <span />
            <span>Incidente</span>
            <span>Estado</span>
            <span>Instancia</span>
            <button className="incident-date-button" type="button" onClick={toggleSortOrder}>
              Fecha <ArrowDownUp size={13} />
            </button>
          </div>
          <div className="incident-list">
            {visibleIncidents.map((incident, index) => {
              const item =
                incident.item && typeof incident.item === 'object'
                  ? (incident.item as Record<string, unknown>)
                  : incident;
              return (
                <button
                  className="incident-row incident-row-button"
                  type="button"
                  key={`${String(incident.source)}:${String(incident.incidentId ?? index)}`}
                  onClick={() =>
                    setSelectedIncident({
                      kind:
                        incident.source === 'instance'
                          ? 'instance'
                          : incident.source === 'operation'
                            ? 'operation'
                            : 'event',
                      item,
                    })
                  }
                >
                  <span className="incident-icon">
                    <AlertTriangleIcon />
                  </span>
                  <div className="primary-cell">
                    <strong className="incident-title-link">
                      {incident.source === 'instance'
                        ? `Fallo de instancia · ${remoteText(item, ['name', 'instance_name'], 'sin nombre')}`
                        : operationTitle(item)}{' '}
                      <ArrowUpRight size={13} />
                    </strong>
                    <span>
                      {remoteText(
                        item,
                        incident.source === 'instance'
                          ? ['instance_id', 'id']
                          : ['operation_id', 'event_id', 'id'],
                      )}
                    </span>
                    <small>
                      {remoteText(item, ['error_code', 'code'], 'Sin causa/código publicado')}
                    </small>
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
                </button>
              );
            })}
          </div>
        </div>
        {incidentOffset + (incidents.data?.items.length ?? 0) <
        (incidentSummary?.filteredTotal ?? 0) ? (
          <button
            className="button button-secondary load-more-button"
            type="button"
            disabled={incidents.isFetching}
            onClick={() => setIncidentOffset((current) => current + 100)}
          >
            {incidents.isFetching
              ? 'Consultando siguiente página…'
              : 'Cargar siguiente página técnica'}
          </button>
        ) : null}
      </GlassSurface>
      {selectedIncident && connectionId ? (
        <RemoteRecordModal
          selected={selectedIncident}
          connectionId={connectionId}
          source={
            connections.data?.find((connection) => connection.id === connectionId)?.name ??
            'Fuente seleccionada'
          }
          onClose={() => setSelectedIncident(null)}
          recoveryMode
        />
      ) : null}
    </PageFrame>
  );
}

function AlertTriangleIcon() {
  return <span aria-hidden="true">!</span>;
}

export function UsersPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const users = useUsers(Boolean(session.data?.authenticated));
  const connections = useConnections(Boolean(session.data?.authenticated));
  const [sourceRefreshKey, setSourceRefreshKey] = useState('');
  const sourceSnapshots = useOverviewSourceSnapshots(
    connections.data ?? [],
    Boolean(session.data?.authenticated && session.data.user?.role === 'Administrador'),
    sourceRefreshKey,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<
    Record<string, { role: Role; grants: ConnectionGrant[]; resourceGrants: ResourceGrant[] }>
  >({});
  const [newGrants, setNewGrants] = useState<ConnectionGrant[]>([]);
  const [newResourceGrants, setNewResourceGrants] = useState<ResourceGrant[]>([]);
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
        if (!next[user.id]) {
          next[user.id] = {
            role: user.role,
            grants: user.grants,
            resourceGrants: user.resourceGrants ?? [],
          };
        }
      }
      return next;
    });
  }, [users.data]);

  const resourceOptions = sourceSnapshots.flatMap((snapshot) => {
    const payload = snapshot.instances.data as { items?: Record<string, unknown>[] } | undefined;
    return (payload?.items ?? []).flatMap((item) => {
      const instanceId = item.instance_id ?? item.id;
      if (typeof instanceId !== 'string' || !isAssignableInstance(item)) return [];
      return [
        {
          connectionId: snapshot.connection.id,
          instanceId,
          label: remoteText(item, ['name', 'instance_name'], instanceId),
          source: snapshot.connection.name,
        },
      ];
    });
  });
  const resourceOptionKeys = new Set(
    resourceOptions.map((option) => `${option.connectionId}:${option.instanceId}`),
  );
  const resourceOptionsReady =
    connections.data !== undefined &&
    sourceSnapshots.length === connections.data.filter((connection) => connection.active).length &&
    sourceSnapshots.every(
      (snapshot) =>
        !snapshot.instances.isPending &&
        !snapshot.instances.isFetching &&
        !snapshot.instances.isError,
    );

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
      await apiClient.createUser(
        { ...values, grants: newGrants, resourceGrants: newResourceGrants },
        csrfToken,
      );
      reset({ username: '', password: '', role: 'Lector', tenant: values.tenant });
      setNewGrants([]);
      setNewResourceGrants([]);
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
    const draft = drafts[user.id] ?? {
      role: user.role,
      grants: user.grants,
      resourceGrants: user.resourceGrants ?? [],
    };
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const resourceGrants = resourceOptionsReady
        ? draft.resourceGrants.filter((grant) =>
            resourceOptionKeys.has(`${grant.connectionId}:${grant.instanceId}`),
          )
        : draft.resourceGrants;
      await apiClient.updateUser(user.id, { ...draft, resourceGrants }, csrfToken);
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
      onRefresh={() => {
        setSourceRefreshKey(String(Date.now()));
        return queryClient.invalidateQueries({
          type: 'active',
          predicate: (query) => query.queryKey[0] !== 'overview-snapshot',
        });
      }}
    >
      <div className="admin-grid">
        <GlassSurface className="module-surface new-user-panel">
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
            <ResourceGrantEditor
              grants={newResourceGrants}
              options={resourceOptions}
              onChange={setNewResourceGrants}
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
              const draft = drafts[user.id] ?? {
                role: user.role,
                grants: user.grants,
                resourceGrants: user.resourceGrants ?? [],
              };
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
                  <ResourceGrantEditor
                    grants={draft.resourceGrants}
                    options={resourceOptions}
                    onChange={(resourceGrants) =>
                      setDrafts((current) => ({
                        ...current,
                        [user.id]: { ...draft, resourceGrants },
                      }))
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

type ResourceOption = {
  connectionId: string;
  instanceId: string;
  label: string;
  source: string;
};

function ResourceGrantEditor({
  grants,
  options,
  onChange,
}: {
  grants: ResourceGrant[];
  options: ResourceOption[];
  onChange: (grants: ResourceGrant[]) => void;
}) {
  return (
    <div className="grant-editor resource-grant-editor">
      <span className="eyebrow">INSTANCIAS ASIGNADAS</span>
      <span className="muted-copy">
        Lector lee los recursos marcados; Operador además puede operar los que tengan Operar.
      </span>
      {options.length === 0 ? (
        <span className="muted-copy">
          No hay inventario publicado para asignar todavía. Activa un conector y actualiza la vista.
        </span>
      ) : null}
      {options.map((option) => {
        const grant = grants.find(
          (item) =>
            item.connectionId === option.connectionId && item.instanceId === option.instanceId,
        ) ?? {
          connectionId: option.connectionId,
          instanceId: option.instanceId,
          canRead: false,
          canOperate: false,
        };
        return (
          <div
            className="grant-row resource-grant-row"
            key={`${option.connectionId}:${option.instanceId}`}
          >
            <div className="primary-cell">
              <strong>{option.label}</strong>
              <span>
                {option.source} · {option.instanceId}
              </span>
            </div>
            <label>
              <input
                type="checkbox"
                checked={grant.canRead}
                onChange={() => onChange(toggleResourceGrantValue(grants, grant, 'canRead'))}
              />{' '}
              Leer
            </label>
            <label>
              <input
                type="checkbox"
                checked={grant.canOperate}
                onChange={() => onChange(toggleResourceGrantValue(grants, grant, 'canOperate'))}
              />{' '}
              Operar
            </label>
          </div>
        );
      })}
    </div>
  );
}

function toggleResourceGrantValue(
  grants: ResourceGrant[],
  current: ResourceGrant,
  field: 'canRead' | 'canOperate',
) {
  const next = { ...current, [field]: !current[field] };
  if (field === 'canOperate' && next.canOperate) next.canRead = true;
  return !next.canRead && !next.canOperate
    ? grants.filter(
        (grant) =>
          !(grant.connectionId === current.connectionId && grant.instanceId === current.instanceId),
      )
    : [
        ...grants.filter(
          (grant) =>
            !(
              grant.connectionId === current.connectionId && grant.instanceId === current.instanceId
            ),
        ),
        next,
      ];
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
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState<'off' | '5' | '10' | '30'>(
    '5',
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const csrfToken = session.data?.csrfToken;

  useEffect(() => {
    if (!settings.data) return;
    setTheme(settings.data.theme);
    setFontScale(settings.data.fontScale);
    setDensity(settings.data.density ?? 'comfortable');
    setReducedMotion(settings.data.reducedMotion ?? false);
    setRefreshIntervalSeconds(settings.data.refreshIntervalSeconds ?? '5');
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
    window.localStorage.setItem('iacoc-v2-refresh-interval', refreshIntervalSeconds);
  }, [theme, fontScale, density, reducedMotion, refreshIntervalSeconds]);

  async function save() {
    if (!csrfToken) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiClient.updateSettings(
        { theme, fontScale, density, reducedMotion, refreshIntervalSeconds },
        csrfToken,
      );
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
              <option value="xlarge">Muy grande</option>
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
          <label className="setting-control">
            Refresco de evidencia
            <select
              value={refreshIntervalSeconds}
              onChange={(event) =>
                setRefreshIntervalSeconds(event.target.value as 'off' | '5' | '10' | '30')
              }
            >
              <option value="off">Manual</option>
              <option value="5">Cada 5 segundos</option>
              <option value="10">Cada 10 segundos</option>
              <option value="30">Cada 30 segundos</option>
            </select>
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
            <EvidenceRow
              label="Actualización Workers"
              value={
                refreshIntervalSeconds === 'off'
                  ? 'Manual'
                  : `${refreshIntervalSeconds} s mientras la vista está abierta`
              }
            />
            <EvidenceRow label="Datos de producción" value="Solo API real · sin fixtures" />
            <EvidenceRow label="Acciones" value="Requieren sesión, CSRF y permiso del conector" />
          </div>
        </GlassSurface>
      </div>
    </PageFrame>
  );
}

function connectionEnvironmentLabel(kind: ConnectionKind): string {
  return kind === 'controlplane' ? 'ControlPlane · producción' : 'ControlPlane dev · desarrollo';
}

function connectionStatusLabel(status: Connection['status']): string {
  const labels: Record<Connection['status'], string> = {
    disconnected: 'Desconectada',
    'pending-confirmation': 'Confirmación pendiente',
    validating: 'Validando',
    active: 'Activa',
    'active-partial': 'Activa parcial',
    error: 'Error',
  };
  return labels[status];
}

export function ConnectorsPage() {
  const session = useSession();
  const connections = useConnections(Boolean(session.data?.authenticated));
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [selectedEnvironment, setSelectedEnvironment] = useState<ConnectionKind>('controlplane-v2');
  const [confirmSingleTenant, setConfirmSingleTenant] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const { register, handleSubmit, reset } = useForm<{
    name: string;
    endpoint: string;
    bearer: string;
    kind: ConnectionKind;
  }>({ defaultValues: { kind: 'controlplane-v2' } });

  useEffect(() => {
    if (!selectedId && connections.data?.[0]) setSelectedId(connections.data[0].id);
    if (selectedId && !connections.data?.some((connection) => connection.id === selectedId)) {
      setSelectedId(connections.data?.[0]?.id ?? null);
      setEditingConnectionId(null);
    }
  }, [connections.data, selectedId]);

  const selected = connections.data?.find((connection) => connection.id === selectedId) ?? null;
  const editingConnection =
    connections.data?.find((connection) => connection.id === editingConnectionId) ?? null;
  const csrfToken = session.data?.csrfToken;
  const isAdmin = session.data?.user?.role === 'Administrador';

  useEffect(() => {
    if (selected) setSelectedEnvironment(selected.kind);
  }, [selected]);

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

  function editConnection(connection: Connection) {
    setSelectedId(connection.id);
    setEditingConnectionId(connection.id);
    setSelectedEnvironment(connection.kind);
    setConfirmSingleTenant(false);
    setMessage(null);
    setError(null);
    reset({
      name: connection.name,
      endpoint: connection.endpoint,
      bearer: '',
      kind: connection.kind,
    });
  }

  function startNewConnection() {
    setEditingConnectionId(null);
    setSelectedEnvironment('controlplane-v2');
    setConfirmSingleTenant(false);
    setMessage(null);
    setError(null);
    reset({ name: '', endpoint: '', bearer: '', kind: 'controlplane-v2' });
  }

  async function submitConnection(values: {
    name: string;
    endpoint: string;
    bearer: string;
    kind: ConnectionKind;
  }) {
    if (!csrfToken) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const bearer = values.bearer.trim();
      if (editingConnectionId) {
        await apiClient.updateConnection(
          editingConnectionId,
          {
            name: values.name.trim(),
            endpoint: values.endpoint.trim(),
            kind: values.kind,
            ...(bearer ? { bearer } : {}),
          },
          csrfToken,
        );
        setSelectedId(editingConnectionId);
        setSelectedEnvironment(values.kind);
        reset({ ...values, bearer: '' });
        await connections.refetch();
        setMessage(
          'Conector actualizado. Un Bearer vacío conserva la credencial; cambiar el endpoint o Bearer requiere validar el nuevo alcance.',
        );
      } else {
        if (!bearer) {
          setError('El Bearer es obligatorio al registrar una fuente nueva.');
          return;
        }
        const connection = await apiClient.createConnection(
          { ...values, name: values.name.trim(), endpoint: values.endpoint.trim(), bearer },
          csrfToken,
        );
        reset({ name: '', endpoint: '', bearer: '', kind: values.kind });
        setSelectedId(connection.id);
        setEditingConnectionId(null);
        setSelectedEnvironment(values.kind);
        await connections.refetch();
        setMessage(
          'Validación correcta. Confirma el alcance single-tenant para activar la conexión.',
        );
      }
      setConfirmSingleTenant(false);
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

  async function saveSelectedEnvironment() {
    if (!selected || !csrfToken || selectedEnvironment === selected.kind) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.updateConnection(selected.id, { kind: selectedEnvironment }, csrfToken);
      await connections.refetch();
      setMessage(
        'Etiqueta de entorno actualizada; endpoint, credencial y alcance validado se mantienen.',
      );
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
              <div className="panel-heading">
                <div className="card-icon">
                  <PlugZap size={20} />
                </div>
                {editingConnection ? (
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    disabled={busy}
                    onClick={startNewConnection}
                  >
                    Nueva fuente
                  </button>
                ) : null}
              </div>
              <h2>{editingConnection ? 'Editar fuente IACP' : 'Registrar fuente IACP'}</h2>
              <p>
                Cada conexión apunta a una API independiente y conserva su endpoint, Bearer y
                estado. Cada API mantiene su contrato independiente, con la misma forma de consumo.
                IaCoC usa el mismo flujo para ambas; el Bearer se cifra en backend y nunca vuelve al
                navegador.
              </p>
              <form className="form-stack connector-form" onSubmit={handleSubmit(submitConnection)}>
                <label>
                  Nombre
                  <input {...register('name', { required: true })} placeholder="ControlPlane dev" />
                </label>
                <label>
                  Entorno de despliegue
                  <select {...register('kind')}>
                    <option value="controlplane">
                      {connectionEnvironmentLabel('controlplane')}
                    </option>
                    <option value="controlplane-v2">
                      {connectionEnvironmentLabel('controlplane-v2')}
                    </option>
                  </select>
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
                  {editingConnection ? 'Bearer nuevo (opcional al editar)' : 'Bearer temporal'}
                  <input {...register('bearer')} type="password" autoComplete="new-password" />
                </label>
                <button className="button button-primary" disabled={busy} type="submit">
                  {busy
                    ? 'Guardando...'
                    : editingConnection
                      ? 'Guardar cambios'
                      : 'Agregar y validar'}
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
                  <span
                    className={[
                      'status-chip',
                      `connection-status-${connection.status.replace(/[^a-z]+/gu, '-')}`,
                    ].join(' ')}
                  >
                    {connectionStatusLabel(connection.status)}
                  </span>
                  {isAdmin ? (
                    <div className="connector-row-actions">
                      <button
                        className="button button-secondary button-small"
                        disabled={busy}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          editConnection(connection);
                        }}
                      >
                        Editar
                      </button>
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
                    </div>
                  ) : null}
                </div>
              ))
            )}
            {selected && isAdmin ? (
              <div className="connection-environment-editor">
                <label>
                  Entorno de despliegue de la fuente seleccionada
                  <select
                    value={selectedEnvironment}
                    onChange={(event) =>
                      setSelectedEnvironment(event.target.value as ConnectionKind)
                    }
                  >
                    <option value="controlplane">
                      {connectionEnvironmentLabel('controlplane')}
                    </option>
                    <option value="controlplane-v2">
                      {connectionEnvironmentLabel('controlplane-v2')}
                    </option>
                  </select>
                </label>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  disabled={busy || selectedEnvironment === selected.kind}
                  onClick={() => void saveSelectedEnvironment()}
                >
                  Guardar entorno
                </button>
                <p className="muted-copy">
                  Cada API mantiene su propio contrato y conexión, con la misma forma de consumo.
                  Esta etiqueta solo identifica el entorno; cambiar endpoint o Bearer exige validar
                  de nuevo.
                </p>
              </div>
            ) : null}
            {selected?.status === 'pending-confirmation' && selected.lastValidationAt ? (
              <div className="single-tenant-confirmation" ref={confirmationRef}>
                <div>
                  <span className="eyebrow">VALIDACIÓN COMPLETA</span>
                  <strong>Confirma el único alcance remoto autorizado</strong>
                  <p>La API no publica tenant_id; esta confirmación explícita es necesaria.</p>
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
