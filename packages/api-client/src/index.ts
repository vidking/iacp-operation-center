import type {
  ActivationRequest,
  Capability,
  Connection,
  ConnectionCreateRequest,
  ConnectionUpdateRequest,
  Overview,
  Session,
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

export type BffContract = {
  session: () => Promise<Session>;
  overview: () => Promise<Overview>;
  connections: () => Promise<Connection[]>;
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
