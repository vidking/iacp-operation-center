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
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { GlassSurface } from '@iacoc/ui';
import { ApiError, apiClient } from '@iacoc/api-client';
import type { Connection, InstanceProvisionRequest } from '@iacoc/contracts';
import {
  useConnections,
  useEvents,
  useImages,
  useInstances,
  useOperations,
  useOverview,
  usePlans,
  useSession,
} from './query';
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
        <UnavailableState reason="La ruta y el shell ya están disponibles. La capacidad aparece aquí únicamente cuando IACP la publique y la sesión tenga permiso." />
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

function remoteValue(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  if (value === null || value === undefined || value === '') return 'No publicado';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
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
    <UnavailableState reason="Activa y confirma al menos una conexión ControlPlaneV2 desde Connectors." />
  );
}

export function InstancesPage() {
  const session = useSession();
  const connections = useConnections(Boolean(session.data?.authenticated));
  const [connectionId, setConnectionId] = useActiveConnectionId(connections.data);
  const instances = useInstances(connectionId, Boolean(session.data?.authenticated));
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
        {instances.isPending ? <p className="muted-copy">Cargando inventario...</p> : null}
        {instances.isError ? (
          <UnavailableState reason="IACP no publicó el inventario para esta fuente." />
        ) : null}
        {instances.data?.items?.length === 0 ? (
          <p className="muted-copy">No hay instancias publicadas.</p>
        ) : null}
        <div className="remote-list">
          {instances.data?.items.map((item, index) => (
            <div className="remote-row" key={String(item.instance_id ?? index)}>
              <div>
                <strong>{remoteValue(item, 'name')}</strong>
                <span>{remoteValue(item, 'instance_id')}</span>
              </div>
              <span>{remoteValue(item, 'status')}</span>
              <span>{remoteValue(item, 'node')}</span>
              <span>{remoteValue(item, 'ip_addresses')}</span>
            </div>
          ))}
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
              disabled={busy || !connectionId || session.data?.user?.role !== 'Administrador'}
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
        {remote.isPending ? <p className="muted-copy">Cargando evidencia...</p> : null}
        {remote.isError ? (
          <UnavailableState reason="IACP no publicó esta evidencia para la fuente seleccionada." />
        ) : null}
        {remote.data?.items.length === 0 ? (
          <p className="muted-copy">No hay registros publicados.</p>
        ) : null}
        <div className="remote-list">
          {remote.data?.items.map((item, index) => (
            <div className="remote-row" key={String(item.operation_id ?? item.event_id ?? index)}>
              <div>
                <strong>{remoteValue(item, 'kind')}</strong>
                <span>{remoteValue(item, 'operation_id')}</span>
              </div>
              <span>{remoteValue(item, 'status')}</span>
              <span>{remoteValue(item, 'normalized_status')}</span>
              <span>{remoteValue(item, 'occurred_at')}</span>
            </div>
          ))}
        </div>
      </GlassSurface>
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
