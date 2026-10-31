import type {
  ActivationRequest,
  Capability,
  Connection,
  ConnectionCreateRequest,
  ConnectionUpdateRequest,
  InstanceDeleteRequest,
  InstanceProvisionRequest,
  Overview,
  Session,
  Settings,
  SettingsUpdateRequest,
  User,
  UserCreateRequest,
  UserUpdateRequest,
} from '@iacoc/contracts';

export type { paths as IacpOpenApiPaths } from './generated-openapi';

export type IacpEvent = {
  event_id: string;
  correlation_id: string | null;
  operation_id: string | null;
  instance_id: string | null;
  tenant_id: string | null;
  occurred_at: string;
  kind: string;
  status: string;
  code: string | null;
  actor: string | null;
  service: string | null;
};

export type IacpEventPage = {
  items: IacpEvent[];
  next_cursor: number | null;
};

export type IacpOperation = {
  operation_id: string;
  instance_id: string | null;
  status: string;
  normalized_status: 'queued' | 'running' | 'completed' | 'failed' | 'uncertain' | string;
  created_at: string | null;
  updated_at: string | null;
  error_code: string | null;
  error_message: string | null;
};

export type IacpObservation = {
  dependencies: unknown;
  active_operations: unknown;
  worker_liveness: 'unknown' | string;
  evidence_at: string | null;
};

export type IacpPage<T> = {
  items: T[];
  next_cursor: string | null;
};

export type BffEvidence = {
  source: 'published' | 'derived' | 'operation-history' | 'not-published' | 'unknown';
  available: boolean;
  count: number;
  reason: string | null;
};

export type BffResourceEnvelope<T> = {
  connectionId: string;
  items: T[];
  evidence?: BffEvidence;
};

export type BffResourceItem<T> = {
  connectionId: string;
  item: T;
};

export type ResourceQuery = Record<string, string | number | boolean | undefined>;

export type BffWorkersEnvelope = {
  connectionId: string;
  available: boolean;
  source: 'workers' | 'observability' | 'operation-history' | 'not-published';
  items: Record<string, unknown>[];
  observability: Record<string, unknown>;
  evidence?: BffEvidence;
};

export type BffIncidentsEnvelope = {
  connectionId: string;
  available: boolean;
  source: string;
  items: Record<string, unknown>[];
  evidence?: BffEvidence;
};

export type BffContract = {
  session: () => Promise<Session>;
  overview: () => Promise<Overview>;
  connections: () => Promise<Connection[]>;
  users: () => Promise<User[]>;
  createUser: (input: UserCreateRequest, csrfToken: string) => Promise<User>;
  updateUser: (id: string, input: UserUpdateRequest, csrfToken: string) => Promise<User>;
  settings: () => Promise<Settings>;
  updateSettings: (input: SettingsUpdateRequest, csrfToken: string) => Promise<Settings>;
  capabilities: () => Promise<Capability[]>;
  createConnection: (input: ConnectionCreateRequest, csrfToken: string) => Promise<Connection>;
  validateConnection: (id: string, csrfToken: string) => Promise<Connection>;
  updateConnection: (
    id: string,
    input: ConnectionUpdateRequest,
    csrfToken: string,
  ) => Promise<Connection>;
  activateConnection: (
    id: string,
    csrfToken: string,
    request?: ActivationRequest,
  ) => Promise<Connection & { message: string }>;
  deactivateConnection: (id: string, csrfToken: string) => Promise<Connection>;
  plans: (connectionId: string) => Promise<BffResourceEnvelope<Record<string, unknown>>>;
  images: (connectionId: string) => Promise<BffResourceEnvelope<Record<string, unknown>>>;
  instances: (
    connectionId: string,
    query?: ResourceQuery,
  ) => Promise<BffResourceEnvelope<Record<string, unknown>>>;
  operations: (
    connectionId: string,
    query?: ResourceQuery,
  ) => Promise<BffResourceEnvelope<Record<string, unknown>>>;
  events: (
    connectionId: string,
    query?: ResourceQuery,
  ) => Promise<BffResourceEnvelope<Record<string, unknown>>>;
  workers: (connectionId: string) => Promise<BffWorkersEnvelope>;
  incidents: (connectionId: string, query?: ResourceQuery) => Promise<BffIncidentsEnvelope>;
  provisionInstance: (
    input: InstanceProvisionRequest,
    csrfToken: string,
  ) => Promise<{ status: number; idempotencyKey: string; result: unknown }>;
  shutdownInstance: (
    connectionId: string,
    instanceId: string,
    csrfToken: string,
  ) => Promise<{ status: number; idempotencyKey: string; result: unknown }>;
  deleteInstance: (
    connectionId: string,
    instanceId: string,
    input: InstanceDeleteRequest,
    csrfToken: string,
  ) => Promise<{ status: number; result: unknown }>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId: string | null;

  constructor(status: number, code: string, message: string, correlationId: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
  }
}

export class IacocApiClient implements BffContract {
  constructor(private readonly baseUrl = '') {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(this.baseUrl + path, {
      credentials: 'include',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
    const payload = (await response.json().catch(() => null)) as
      { code?: string; message?: string; correlationId?: string | null } | T | null;
    if (!response.ok) {
      const error = payload as { code?: string; message?: string; correlationId?: string | null };
      throw new ApiError(
        response.status,
        error?.code ?? 'HTTP_ERROR',
        error?.message ?? 'La solicitud no pudo completarse',
        error?.correlationId ?? response.headers.get('x-correlation-id'),
      );
    }
    return payload as T;
  }

  session() {
    return this.request<Session>('/api/v2/session');
  }

  overview() {
    return this.request<Overview>('/api/v2/overview');
  }

  connections() {
    return this.request<Connection[]>('/api/v2/connections');
  }

  users() {
    return this.request<User[]>('/api/v2/users');
  }

  createUser(input: UserCreateRequest, csrfToken: string) {
    return this.request<User>('/api/v2/users', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken },
      body: JSON.stringify(input),
    });
  }

  updateUser(id: string, input: UserUpdateRequest, csrfToken: string) {
    return this.request<User>('/api/v2/users/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'x-csrf-token': csrfToken },
      body: JSON.stringify(input),
    });
  }

  settings() {
    return this.request<Settings>('/api/v2/settings');
  }

  updateSettings(input: SettingsUpdateRequest, csrfToken: string) {
    return this.request<Settings>('/api/v2/settings', {
      method: 'PATCH',
      headers: { 'x-csrf-token': csrfToken },
      body: JSON.stringify(input),
    });
  }

  capabilities() {
    return this.request<Capability[]>('/api/v2/capabilities');
  }

  createConnection(input: ConnectionCreateRequest, csrfToken: string) {
    return this.request<Connection>('/api/v2/connections', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken },
      body: JSON.stringify(input),
    });
  }

  validateConnection(id: string, csrfToken: string) {
    return this.request<Connection>('/api/v2/connections/' + encodeURIComponent(id) + '/validate', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken },
      body: '{}',
    });
  }

  updateConnection(id: string, input: ConnectionUpdateRequest, csrfToken: string) {
    return this.request<Connection>('/api/v2/connections/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'x-csrf-token': csrfToken },
      body: JSON.stringify(input),
    });
  }

  activateConnection(
    id: string,
    csrfToken: string,
    request: ActivationRequest = { action: 'activate', confirmSingleTenant: true },
  ) {
    return this.request<Connection & { message: string }>(
      '/api/v2/connections/' + encodeURIComponent(id) + '/activate',
      {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: JSON.stringify(request),
      },
    );
  }

  deactivateConnection(id: string, csrfToken: string) {
    return this.request<Connection>(
      '/api/v2/connections/' + encodeURIComponent(id) + '/deactivate',
      {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: '{}',
      },
    );
  }

  private resourcePath(path: string, connectionId: string, query: ResourceQuery = {}) {
    const params = new URLSearchParams({ connectionId });
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    return path + '?' + params.toString();
  }

  plans(connectionId: string) {
    return this.request<BffResourceEnvelope<Record<string, unknown>>>(
      this.resourcePath('/api/v2/plans', connectionId),
    );
  }

  images(connectionId: string) {
    return this.request<BffResourceEnvelope<Record<string, unknown>>>(
      this.resourcePath('/api/v2/images', connectionId),
    );
  }

  instances(connectionId: string, query?: ResourceQuery) {
    return this.request<BffResourceEnvelope<Record<string, unknown>>>(
      this.resourcePath('/api/v2/instances', connectionId, query),
    );
  }

  operations(connectionId: string, query?: ResourceQuery) {
    return this.request<BffResourceEnvelope<Record<string, unknown>>>(
      this.resourcePath('/api/v2/operations', connectionId, query),
    );
  }

  events(connectionId: string, query?: ResourceQuery) {
    return this.request<BffResourceEnvelope<Record<string, unknown>>>(
      this.resourcePath('/api/v2/events', connectionId, query),
    );
  }

  workers(connectionId: string) {
    return this.request<BffWorkersEnvelope>(this.resourcePath('/api/v2/workers', connectionId));
  }

  incidents(connectionId: string, query?: ResourceQuery) {
    return this.request<BffIncidentsEnvelope>(
      this.resourcePath('/api/v2/incidents', connectionId, query),
    );
  }

  provisionInstance(input: InstanceProvisionRequest, csrfToken: string) {
    return this.request<{ status: number; idempotencyKey: string; result: unknown }>(
      '/api/v2/instances',
      {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: JSON.stringify(input),
      },
    );
  }

  shutdownInstance(connectionId: string, instanceId: string, csrfToken: string) {
    return this.request<{ status: number; idempotencyKey: string; result: unknown }>(
      this.resourcePath(
        '/api/v2/instances/' + encodeURIComponent(instanceId) + '/power/shutdown',
        connectionId,
      ),
      {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: '{}',
      },
    );
  }

  deleteInstance(
    connectionId: string,
    instanceId: string,
    input: InstanceDeleteRequest,
    csrfToken: string,
  ) {
    return this.request<{ status: number; result: unknown }>(
      this.resourcePath('/api/v2/instances/' + encodeURIComponent(instanceId), connectionId),
      {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrfToken },
        body: JSON.stringify(input),
      },
    );
  }

  login(username: string, password: string) {
    return this.request<Session>('/api/v2/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  logout(csrfToken: string) {
    return this.request<{ ok: true }>('/api/v2/auth/logout', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken },
    });
  }
}

export const apiClient = new IacocApiClient();
