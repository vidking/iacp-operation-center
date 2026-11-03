import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import {
  activationRequestSchema,
  connectionResourceQuerySchema,
  type Capability,
  type Role,
  type Session as SessionContract,
  connectionCreateRequestSchema,
  connectionUpdateRequestSchema,
  instanceDeleteRequestSchema,
  instanceProvisionRequestSchema,
  settingsUpdateRequestSchema,
  userCreateRequestSchema,
  userUpdateRequestSchema,
} from '@iacoc/contracts';
import { readServerConfig, type ServerConfig } from '@iacoc/config';
import {
  authenticateUser,
  createSession,
  createUser,
  destroySession,
  findSession,
  getSettings,
  getUser,
  listUsers,
  replaceUserGrants,
  replaceUserResourceGrants,
  updateSettings,
  updateUser,
  verifyCsrf,
} from './auth';
import {
  activateConnection,
  createConnection,
  deactivateConnection,
  listConnections,
  hasConnectionAccess,
  updateConnection,
  validateConnection,
} from './connections';
import { openDatabase, type Database } from './db';
import { validateEndpoint, UpstreamPolicyError } from './upstream';
import {
  ConnectionUnavailableError,
  deleteInstance,
  getInstance,
  getOperation,
  invalidateConnectionHistory,
  isUpstreamResponseError,
  listEvents,
  listIncidents,
  listImages,
  listInstances,
  listOperations,
  listPlans,
  listWorkers,
  getObservability,
  provisionInstance,
  shutdownInstance,
  verifyInstanceAccess,
  listNetworkProfiles,
  getInstancePower,
  getInstanceNetwork,
  startInstance,
  rebootInstance,
  reconcileInstance,
} from './technical';
import {
  assignNewResource,
  claimProvisionedResources,
  extractRemoteIdentifiers,
  filterVisibleResources,
  hasResourceAccess,
  listResourceAssignments,
  listActionIntents,
  recordActionIntent,
  updateActionIntentEvidence,
  visibleResourceIds,
} from './resources';

type AppRequest = FastifyRequest & {
  sessionUser?: ReturnType<typeof findSession>;
};

type AppOptions = {
  database?: Database;
  config?: ServerConfig;
};

function correlationId(request: FastifyRequest): string {
  return String(request.headers['x-correlation-id'] ?? randomUUID());
}

function error(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  request: FastifyRequest,
) {
  const id = correlationId(request);
  reply.header('x-correlation-id', id);
  return reply
    .code(statusCode)
    .send({ code, message, retryable: statusCode >= 500, correlationId: id });
}

function originIsAllowed(request: FastifyRequest, config: ServerConfig): boolean {
  const origin = request.headers.origin;
  return !origin || origin === config.publicOrigin;
}

function cookieToken(request: FastifyRequest): string | null {
  return request.cookies.iacoc_v2_session ?? null;
}

function csrfHeader(request: FastifyRequest): string | null {
  const value = request.headers['x-csrf-token'];
  return typeof value === 'string' ? value : null;
}

function userContract(request: AppRequest): SessionContract {
  const user = request.sessionUser;
  if (!user) {
    throw new Error('La sesión no está disponible.');
  }
  return {
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      tenant: user.tenant,
    },
    csrfToken: null,
  };
}

async function requireSession(
  request: AppRequest,
  reply: FastifyReply,
  database: Database,
): Promise<void> {
  const token = cookieToken(request);
  if (!token) {
    await error(reply, 401, 'AUTH_REQUIRED', 'Esta ruta requiere una sesión.', request);
    return;
  }
  const session = findSession(database, token);
  if (!session) {
    await error(reply, 401, 'AUTH_REQUIRED', 'La sesión no es válida o expiró.', request);
    return;
  }
  request.sessionUser = session;
}

async function requireAdministrator(
  request: AppRequest,
  reply: FastifyReply,
  database: Database,
): Promise<void> {
  await requireSession(request, reply, database);
  if (reply.sent) return;
  if (request.sessionUser?.role !== ('Administrador' satisfies Role)) {
    await error(
      reply,
      403,
      'ADMIN_REQUIRED',
      'La acción requiere Administrador del tenant.',
      request,
    );
  }
}

async function requireConnectionAccess(
  request: AppRequest,
  reply: FastifyReply,
  database: Database,
  connectionId: string,
  operation = false,
): Promise<boolean> {
  await requireSession(request, reply, database);
  if (reply.sent || !request.sessionUser) return false;
  if (!hasConnectionAccess(database, request.sessionUser, connectionId, operation)) {
    await error(
      reply,
      403,
      'CONNECTION_ACCESS_DENIED',
      operation
        ? 'La identidad no tiene permiso de operación sobre este conector.'
        : 'La identidad no tiene permiso de lectura sobre este conector.',
      request,
    );
    return false;
  }
  return true;
}

async function requireResourceAccess(
  request: AppRequest,
  reply: FastifyReply,
  database: Database,
  connectionId: string,
  instanceId: string,
  operation = false,
): Promise<boolean> {
  if (!(await requireConnectionAccess(request, reply, database, connectionId, operation)))
    return false;
  if (
    request.sessionUser &&
    hasResourceAccess(database, request.sessionUser, connectionId, instanceId, operation)
  ) {
    return true;
  }
  await error(
    reply,
    403,
    'RESOURCE_ACCESS_DENIED',
    operation
      ? 'La identidad no tiene permiso de operación sobre esta instancia.'
      : 'La identidad no tiene permiso de lectura sobre esta instancia.',
    request,
  );
  return false;
}

function instanceIdFromItem(item: Record<string, unknown>): string | null {
  const value = item.instance_id ?? item.instanceId ?? item.id;
  return typeof value === 'string' && value ? value : null;
}

function publishedIncidentStatus(item: Record<string, unknown>): string {
  const status = item.normalized_status ?? item.status;
  return typeof status === 'string' ? status.toLowerCase() : 'unknown';
}

function filterInstancesForView(request: FastifyRequest, items: unknown[]): unknown[] {
  const url = new URL(request.url, 'http://iacoc.local');
  const status = url.searchParams.get('status');
  const includeDeleted = url.searchParams.get('include_deleted') === 'true';
  if (includeDeleted || status === 'deleted' || status === 'all') return items;
  return items.filter((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    const remoteStatus = String(record.normalized_status ?? record.status ?? '').toLowerCase();
    return remoteStatus !== 'deleted';
  });
}

function filterRemoteItemsForUser(
  database: Database,
  request: AppRequest,
  connectionId: string,
  items: unknown[],
): Record<string, unknown>[] {
  const records = items.filter((item): item is Record<string, unknown> =>
    Boolean(item && typeof item === 'object'),
  );
  return request.sessionUser
    ? filterVisibleResources(database, request.sessionUser, connectionId, records)
    : [];
}

function workerInstanceIds(item: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const collect = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    for (const key of ['instance_id', 'instanceId', 'vmid']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate) ids.add(candidate);
      if (typeof candidate === 'number') ids.add(String(candidate));
    }
  };
  collect(item);
  for (const key of ['current_operation', 'last_operation', 'active_operation', 'operation']) {
    collect(item[key]);
  }
  return [...ids];
}

function filterWorkersForUser(
  database: Database,
  request: AppRequest,
  connectionId: string,
  workers: unknown[],
): Record<string, unknown>[] {
  const records = workers.filter((item): item is Record<string, unknown> =>
    Boolean(item && typeof item === 'object'),
  );
  if (request.sessionUser?.role === 'Administrador') return records;
  const ids = request.sessionUser
    ? visibleResourceIds(database, request.sessionUser, connectionId)
    : new Set<string>();
  if (!ids) return records;
  return records.filter((item) =>
    workerInstanceIds(item).some((instanceId) => ids.has(instanceId)),
  );
}

function observabilityForUser(
  request: AppRequest,
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (request.sessionUser?.role === 'Administrador') return value;
  return {
    evidence_at: value.evidence_at ?? null,
    worker_liveness: 'unknown',
  };
}

function requireCsrf(request: AppRequest, database: Database): boolean {
  const token = cookieToken(request);
  const csrf = csrfHeader(request);
  return Boolean(token && csrf && verifyCsrf(database, token, csrf));
}

function disconnectedCapabilities(): Capability[] {
  return [
    {
      name: 'instances',
      available: false,
      source: 'not-published',
      reason: 'No existe una conexión IACP seleccionada.',
    },
    {
      name: 'operations',
      available: false,
      source: 'not-published',
      reason: 'No existe una conexión IACP seleccionada.',
    },
    {
      name: 'events',
      available: false,
      source: 'not-published',
      reason: 'No existe una conexión IACP seleccionada.',
    },
    {
      name: 'provisioning',
      available: false,
      source: 'not-published',
      reason: 'La capacidad depende del OpenAPI y permisos publicados por IACP.',
    },
  ];
}

function publishedEvidence(
  count: number,
  source:
    'published' | 'derived' | 'operation-history' | 'local-intent' | 'not-published' = 'published',
  reason: string | null = null,
) {
  return {
    source,
    available: source !== 'not-published',
    count,
    reason: reason ?? (count === 0 ? 'La fuente respondió sin registros para esta vista.' : null),
  } as const;
}

function connectionIdFromQuery(request: FastifyRequest): string | null {
  const parsed = connectionResourceQuerySchema.safeParse(request.query);
  return parsed.success ? parsed.data.connectionId : null;
}

function upstreamQuery(request: FastifyRequest): string {
  const url = new URL(request.url, 'http://iacoc.local');
  url.searchParams.delete('connectionId');
  const allowed = new Set([
    'limit',
    'offset',
    'status',
    'name',
    'instance_id',
    'operation_id',
    'sort',
    'after',
    'include_deleted',
  ]);
  for (const key of [...url.searchParams.keys()]) {
    if (!allowed.has(key)) url.searchParams.delete(key);
  }
  const query = url.searchParams.toString();
  return query ? '?' + query : '';
}

function localHistoryQuery(request: FastifyRequest): string {
  const upstream = upstreamQuery(request);
  const parameters = new URLSearchParams(upstream.startsWith('?') ? upstream.slice(1) : upstream);
  const requestQuery = request.query as Record<string, unknown>;
  for (const key of ['refresh', 'period']) {
    const value = requestQuery[key];
    if (typeof value === 'string' && value) parameters.set(key, value);
  }
  const query = parameters.toString();
  return query ? '?' + query : '';
}

function includeNetworkFromQuery(request: FastifyRequest): boolean {
  const query = request.query as Record<string, unknown>;
  return query.include_network === true || query.include_network === 'true';
}

function remoteError(reply: FastifyReply, request: FastifyRequest, cause: unknown) {
  if (cause instanceof ConnectionUnavailableError) {
    return error(reply, 409, 'CONNECTION_NOT_ACTIVE', cause.message, request);
  }
  if (cause instanceof UpstreamPolicyError) {
    return error(reply, 502, 'UPSTREAM_POLICY_REJECTED', cause.message, request);
  }
  if (isUpstreamResponseError(cause)) {
    const body = cause.body as { detail?: unknown; message?: unknown } | null;
    const redactDetail = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(redactDetail);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(
            ([key]) => !/(password|token|bearer|secret|private[_-]?key|credential)/i.test(key),
          )
          .map(([key, nested]) => [key, redactDetail(nested)]),
      );
    };
    const detailValue = body?.detail ?? body?.message;
    const message =
      typeof detailValue === 'string'
        ? detailValue
        : detailValue
          ? JSON.stringify(redactDetail(detailValue)).slice(0, 800)
          : 'IACP rechazó la solicitud.';
    return error(
      reply,
      cause.status >= 400 && cause.status < 500 ? cause.status : 502,
      'IACP_REJECTED',
      message,
      request,
    );
  }
  const message = cause instanceof Error ? cause.message : 'La operación IACP falló.';
  return error(reply, 502, 'IACP_UNAVAILABLE', message, request);
}

export async function createApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? readServerConfig();
  const database = options.database ?? openDatabase(config.dbPath);
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  await app.register(cookie);
  const webRoot = resolve(process.env.IACOC_WEB_ROOT ?? join(process.cwd(), 'web'));
  const servesWeb = existsSync(join(webRoot, 'index.html'));

  app.addHook('onSend', async (_request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'same-origin');
    reply.header('cache-control', 'no-store');
  });

  app.get('/health/live', async () => ({ status: 'ok', service: 'iacoc-v2-bff' }));
  app.get('/health/ready', async () => ({ status: 'ok', database: 'available' }));
  app.get('/health', async () => ({ status: 'ok', service: 'iacoc-v2-bff' }));

  app.get('/api/v2/session', async (request, reply) => {
    const sessionRequest = request as AppRequest;
    const token = cookieToken(request);
    if (!token) {
      return reply.send({ authenticated: false, user: null, csrfToken: null });
    }
    const user = findSession(database, token);
    if (!user) {
      return reply.send({ authenticated: false, user: null, csrfToken: null });
    }
    const csrf = request.cookies.iacoc_v2_csrf ?? null;
    sessionRequest.sessionUser = user;
    return reply.send({ ...userContract(sessionRequest), csrfToken: csrf });
  });

  app.post('/api/v2/auth/login', async (request, reply) => {
    if (!originIsAllowed(request, config)) {
      return error(reply, 403, 'ORIGIN_REJECTED', 'El origen no está autorizado.', request);
    }
    const body = request.body as { username?: unknown; password?: unknown };
    if (typeof body?.username !== 'string' || typeof body.password !== 'string') {
      return error(
        reply,
        400,
        'INVALID_REQUEST',
        'Usuario y contraseña son obligatorios.',
        request,
      );
    }
    const user = await authenticateUser(database, body.username, body.password);
    if (!user) {
      return error(reply, 401, 'AUTH_INVALID', 'Las credenciales no son válidas.', request);
    }
    const session = createSession(database, user);
    reply.setCookie('iacoc_v2_session', session.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.nodeEnv === 'production',
      path: '/',
      expires: new Date(session.expiresAt),
    });
    reply.setCookie('iacoc_v2_csrf', session.csrfToken, {
      httpOnly: false,
      sameSite: 'strict',
      secure: config.nodeEnv === 'production',
      path: '/',
      expires: new Date(session.expiresAt),
    });
    return reply.send({
      authenticated: true,
      user,
      csrfToken: session.csrfToken,
    });
  });

  app.post('/api/v2/auth/logout', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    if (!originIsAllowed(request, config) || !requireCsrf(appRequest, database)) {
      return error(
        reply,
        403,
        'CSRF_REJECTED',
        'La protección CSRF rechazó la solicitud.',
        request,
      );
    }
    const token = cookieToken(request);
    if (token) destroySession(database, token);
    reply.clearCookie('iacoc_v2_session', { path: '/' });
    reply.clearCookie('iacoc_v2_csrf', { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/api/v2/overview', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    const sources = listConnections(database, appRequest.sessionUser ?? undefined).filter(
      (connection) => connection.active,
    );
    const active = sources[0] ?? null;
    return reply.send({
      connectionState: active?.status ?? 'disconnected',
      sources,
      source: active,
      evidence: active ? 'partial' : 'not-published',
      activeOperations: null,
      incidents: null,
      lastEvidenceAt: active?.evidenceAt ?? null,
      message: active
        ? 'La conexión está activa; la evidencia restante depende de lo que IACP publique.'
        : 'Sin conexión IACP autorizada. El arranque desconectado no inventa datos.',
    });
  });

  app.get('/api/v2/connections', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    return reply.send(listConnections(database, appRequest.sessionUser ?? undefined));
  });

  app.get('/api/v2/users', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireAdministrator(appRequest, reply, database);
    if (reply.sent) return;
    return reply.send(listUsers(database));
  });

  app.post('/api/v2/users', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireAdministrator(appRequest, reply, database);
    if (reply.sent) return;
    if (!originIsAllowed(request, config) || !requireCsrf(appRequest, database)) {
      return error(
        reply,
        403,
        'CSRF_REJECTED',
        'La protección CSRF rechazó la solicitud.',
        request,
      );
    }
    const parsed = userCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return error(reply, 400, 'INVALID_REQUEST', 'La identidad no cumple el contrato.', request);
    }
    try {
      const id = await createUser(
        database,
        parsed.data.username,
        parsed.data.password,
        parsed.data.role,
        parsed.data.tenant,
      );
      replaceUserGrants(database, id, parsed.data.grants);
      replaceUserResourceGrants(
        database,
        id,
        parsed.data.resourceGrants,
        appRequest.sessionUser?.id ?? null,
      );
      const user = getUser(database, id);
      if (!user)
        return error(reply, 500, 'STATE_ERROR', 'La identidad no pudo persistirse.', request);
      return reply.code(201).send(user);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No fue posible crear la identidad.';
      return error(reply, 409, 'USER_REJECTED', message, request);
    }
  });

  app.patch('/api/v2/users/:id', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireAdministrator(appRequest, reply, database);
    if (reply.sent) return;
    if (!originIsAllowed(request, config) || !requireCsrf(appRequest, database)) {
      return error(
        reply,
        403,
        'CSRF_REJECTED',
        'La protección CSRF rechazó la solicitud.',
        request,
      );
    }
    const parsed = userUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return error(
        reply,
        400,
        'INVALID_REQUEST',
        'El cambio de identidad no cumple el contrato.',
        request,
      );
    }
    try {
      const user = await updateUser(
        database,
        String((request.params as { id: string }).id),
        parsed.data,
      );
      if (!user) return error(reply, 404, 'USER_NOT_FOUND', 'La identidad no existe.', request);
      return reply.send(user);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'No fue posible actualizar la identidad.';
      return error(reply, 409, 'USER_REJECTED', message, request);
    }
  });

  app.get('/api/v2/users/:id/resources', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireAdministrator(appRequest, reply, database);
    if (reply.sent) return;
    return reply.send(
      listResourceAssignments(database, String((request.params as { id: string }).id)),
    );
  });

  app.put('/api/v2/users/:id/resources', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireAdministrator(appRequest, reply, database);
    if (reply.sent) return;
    if (!originIsAllowed(request, config) || !requireCsrf(appRequest, database)) {
      return error(
        reply,
        403,
        'CSRF_REJECTED',
        'La protección CSRF rechazó la solicitud.',
        request,
      );
    }
    const resources = Array.isArray(request.body) ? request.body : [];
    const parsed = resources.map((item) => {
      const value = item as Record<string, unknown>;
      return {
        connectionId: String(value.connectionId ?? ''),
        instanceId: String(value.instanceId ?? ''),
        canRead: value.canRead === true,
        canOperate: value.canOperate === true,
      };
    });
    const valid = parsed.every(
      (item) =>
        item.connectionId.length > 0 &&
        item.instanceId.length > 0 &&
        (item.canRead || item.canOperate),
    );
    if (!valid)
      return error(
        reply,
        400,
        'INVALID_REQUEST',
        'La asignación de recursos no cumple el contrato.',
        request,
      );
    const userId = String((request.params as { id: string }).id);
    replaceUserResourceGrants(database, userId, parsed, appRequest.sessionUser?.id ?? null);
    return reply.send(listResourceAssignments(database, userId));
  });

  app.get('/api/v2/settings', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent || !appRequest.sessionUser) return;
    return reply.send(getSettings(database, appRequest.sessionUser.id));
  });

  app.patch('/api/v2/settings', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent || !appRequest.sessionUser) return;
    if (!originIsAllowed(request, config) || !requireCsrf(appRequest, database)) {
      return error(
        reply,
        403,
        'CSRF_REJECTED',
        'La protección CSRF rechazó la solicitud.',
        request,
      );
    }
    const parsed = settingsUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return error(reply, 400, 'INVALID_REQUEST', 'Los ajustes no cumplen el contrato.', request);
    }
    return reply.send(updateSettings(database, appRequest.sessionUser.id, parsed.data));
  });

  app.get('/api/v2/capabilities', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    return reply.send(disconnectedCapabilities());
  });

  app.post('/api/v2/connections', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireAdministrator(appRequest, reply, database);
    if (reply.sent) return;
    if (!originIsAllowed(request, config) || !requireCsrf(appRequest, database)) {
      return error(
        reply,
        403,
        'CSRF_REJECTED',
        'La protección CSRF rechazó la solicitud.',
        request,
      );
    }
    const parsed = connectionCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return error(
        reply,
        400,
        'INVALID_REQUEST',
        'Los datos del conector no cumplen el contrato.',
        request,
      );
    }
    try {
      validateEndpoint(config, parsed.data.endpoint);
      const connection = createConnection(database, config.keyringFile, parsed.data);
      const validation = await validateConnection(database, config, connection.id);
      if (!validation.ok) {
        return error(reply, 422, validation.code, validation.error, request);
      }
      return reply.code(201).send(validation.connection);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'No fue posible registrar el conector.';
      return error(reply, 422, 'CONNECTION_REJECTED', message, request);
    }
  });

  app.post('/api/v2/connections/:id/validate', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireAdministrator(appRequest, reply, database);
    if (reply.sent) return;
    if (!originIsAllowed(request, config) || !requireCsrf(appRequest, database)) {
      return error(
        reply,
        403,
        'CSRF_REJECTED',
        'La protección CSRF rechazó la solicitud.',
        request,
      );
    }
    const result = await validateConnection(
      database,
      config,
      String((request.params as { id: string }).id),
    );
    if (!result.ok) return error(reply, 422, result.code, result.error, request);
    return reply.send(result.connection);
  });

  app.patch('/api/v2/connections/:id', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireAdministrator(appRequest, reply, database);
    if (reply.sent) return;
    if (!originIsAllowed(request, config) || !requireCsrf(appRequest, database)) {
      return error(
        reply,
        403,
        'CSRF_REJECTED',
        'La protección CSRF rechazó la solicitud.',
        request,
      );
    }
    const parsed = connectionUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return error(
        reply,
        400,
        'INVALID_REQUEST',
        'El cambio del conector no cumple el contrato.',
        request,
      );
    }
    try {
      if (parsed.data.endpoint) validateEndpoint(config, parsed.data.endpoint);
      const connection = updateConnection(
        database,
        config.keyringFile,
        String((request.params as { id: string }).id),
        parsed.data,
      );
      if (!connection)
        return error(reply, 404, 'CONNECTION_NOT_FOUND', 'La conexión no existe.', request);
      return reply.send(connection);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'No fue posible actualizar el conector.';
      return error(reply, 422, 'CONNECTION_REJECTED', message, request);
    }
  });

  app.post('/api/v2/connections/:id/activate', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireAdministrator(appRequest, reply, database);
    if (reply.sent) return;
    if (!originIsAllowed(request, config) || !requireCsrf(appRequest, database)) {
      return error(
        reply,
        403,
        'CSRF_REJECTED',
        'La protección CSRF rechazó la solicitud.',
        request,
      );
    }
    const parsed = activationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return error(
        reply,
        400,
        'INVALID_REQUEST',
        'El payload de activación no cumple el contrato.',
        request,
      );
    }
    const result = activateConnection(
      database,
      String((request.params as { id: string }).id),
      parsed.data,
      config.liveEnabled,
    );
    if ('error' in result) {
      const status =
        result.code === 'SINGLE_TENANT_CONFIRMATION_REQUIRED'
          ? 409
          : result.code === 'LIVE_DISABLED'
            ? 503
            : 400;
      return error(reply, status, result.code, result.error, request);
    }
    await database
      .prepare(
        'INSERT INTO audit_events (id, actor_id, action, resource, correlation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        randomUUID(),
        appRequest.sessionUser?.id ?? null,
        'activate',
        'connection:' + result.connection.id,
        correlationId(request),
        new Date().toISOString(),
      );
    return reply.send({
      ...result.connection,
      message: result.idempotent
        ? 'La conexión ya estaba activa; la activación fue idempotente.'
        : 'Alcance single-tenant confirmado. La conexión quedó activa',
    });
  });

  app.post('/api/v2/connections/:id/deactivate', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireAdministrator(appRequest, reply, database);
    if (reply.sent) return;
    if (!originIsAllowed(request, config) || !requireCsrf(appRequest, database)) {
      return error(
        reply,
        403,
        'CSRF_REJECTED',
        'La protección CSRF rechazó la solicitud.',
        request,
      );
    }
    const connection = deactivateConnection(
      database,
      String((request.params as { id: string }).id),
    );
    if (!connection)
      return error(reply, 404, 'CONNECTION_NOT_FOUND', 'La conexión no existe.', request);
    await database
      .prepare(
        'INSERT INTO audit_events (id, actor_id, action, resource, correlation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        randomUUID(),
        appRequest.sessionUser?.id ?? null,
        'deactivate',
        'connection:' + connection.id,
        correlationId(request),
        new Date().toISOString(),
      );
    return reply.send(connection);
  });

  app.get('/api/v2/plans', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    const connectionId = connectionIdFromQuery(request);
    if (!connectionId)
      return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
    if (!(await requireConnectionAccess(appRequest, reply, database, connectionId))) return;
    try {
      const items = await listPlans(database, config, connectionId);
      return reply.send({ connectionId, items, evidence: publishedEvidence(items.length) });
    } catch (cause) {
      return remoteError(reply, request, cause);
    }
  });

  app.get('/api/v2/images', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    const connectionId = connectionIdFromQuery(request);
    if (!connectionId)
      return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
    if (!(await requireConnectionAccess(appRequest, reply, database, connectionId))) return;
    try {
      const items = await listImages(database, config, connectionId);
      return reply.send({ connectionId, items, evidence: publishedEvidence(items.length) });
    } catch (cause) {
      return remoteError(reply, request, cause);
    }
  });

  app.get('/api/v2/network-profiles', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    const connectionId = connectionIdFromQuery(request);
    if (!connectionId)
      return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
    if (!(await requireConnectionAccess(appRequest, reply, database, connectionId))) return;
    try {
      const items = await listNetworkProfiles(database, config, connectionId);
      return reply.send({ connectionId, items, evidence: publishedEvidence(items.length) });
    } catch (cause) {
      return remoteError(reply, request, cause);
    }
  });

  app.get('/api/v2/instances', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    const connectionId = connectionIdFromQuery(request);
    if (!connectionId)
      return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
    if (!(await requireConnectionAccess(appRequest, reply, database, connectionId))) return;
    try {
      const remoteItems = await listInstances(
        database,
        config,
        connectionId,
        upstreamQuery(request),
        includeNetworkFromQuery(request),
      );
      claimProvisionedResources(database, connectionId, remoteItems);
      const items = filterRemoteItemsForUser(
        database,
        appRequest,
        connectionId,
        filterInstancesForView(request, remoteItems),
      );
      return reply.send({
        connectionId,
        items,
        evidence: publishedEvidence(items.length),
      });
    } catch (cause) {
      return remoteError(reply, request, cause);
    }
  });

  app.get('/api/v2/provisioning', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent || !appRequest.sessionUser) return;
    const connectionId = connectionIdFromQuery(request);
    if (!connectionId)
      return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
    if (!(await requireConnectionAccess(appRequest, reply, database, connectionId))) return;
    const intents = listActionIntents(database, {
      connectionId,
      actorId: appRequest.sessionUser.role === 'Administrador' ? null : appRequest.sessionUser.id,
    });
    const items = await Promise.all(
      intents.map(async (intent) => {
        let remoteStatus = intent.remoteStatus;
        let instanceId = intent.instanceId;
        let operationId = intent.operationId;
        let evidence: 'local-intent' | 'published' = remoteStatus ? 'published' : 'local-intent';
        try {
          const remote = operationId
            ? await getOperation(database, config, connectionId, operationId)
            : instanceId
              ? await getInstance(database, config, connectionId, instanceId)
              : null;
          if (remote) {
            const identifiers = extractRemoteIdentifiers(remote, { rootIdAsInstance: false });
            instanceId = identifiers.instanceId ?? instanceId;
            operationId = identifiers.operationId ?? operationId;
            const value = remote as Record<string, unknown>;
            remoteStatus =
              typeof (value.normalized_status ?? value.status) === 'string'
                ? String(value.normalized_status ?? value.status)
                : remoteStatus;
            if (remoteStatus) evidence = 'published';
            updateActionIntentEvidence(database, intent.id, {
              instanceId,
              operationId,
              remoteStatus,
            });
          }
        } catch {
          // A local intent remains useful when IACP has not exposed its
          // operation/instance yet. Do not manufacture a remote status.
        }
        return {
          ...intent,
          instanceId,
          operationId,
          remoteStatus,
          status: remoteStatus ?? intent.status,
          evidence,
        };
      }),
    );
    const hasPublished = items.some((item) => item.evidence === 'published');
    return reply.send({
      connectionId,
      items,
      evidence: publishedEvidence(
        items.length,
        hasPublished ? 'published' : 'local-intent',
        hasPublished ? null : 'Solicitud local registrada; IACP aún no publicó su estado.',
      ),
    });
  });

  app.get('/api/v2/instances/:instanceId', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    const connectionId = connectionIdFromQuery(request);
    if (!connectionId)
      return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
    if (!(await requireConnectionAccess(appRequest, reply, database, connectionId))) return;
    try {
      const instanceId = String((request.params as { instanceId: string }).instanceId);
      if (!(await requireResourceAccess(appRequest, reply, database, connectionId, instanceId)))
        return;
      return reply.send({
        connectionId,
        item: await getInstance(database, config, connectionId, instanceId),
      });
    } catch (cause) {
      return remoteError(reply, request, cause);
    }
  });

  app.get('/api/v2/instances/:instanceId/power', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    const connectionId = connectionIdFromQuery(request);
    if (!connectionId)
      return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
    const instanceId = String((request.params as { instanceId: string }).instanceId);
    if (!(await requireResourceAccess(appRequest, reply, database, connectionId, instanceId)))
      return;
    try {
      return reply.send({
        connectionId,
        item: await getInstancePower(database, config, connectionId, instanceId),
      });
    } catch (cause) {
      return remoteError(reply, request, cause);
    }
  });

  app.get('/api/v2/instances/:instanceId/network', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    const connectionId = connectionIdFromQuery(request);
    if (!connectionId)
      return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
    const instanceId = String((request.params as { instanceId: string }).instanceId);
    if (!(await requireResourceAccess(appRequest, reply, database, connectionId, instanceId)))
      return;
    try {
      return reply.send({
        connectionId,
        item: await getInstanceNetwork(database, config, connectionId, instanceId),
      });
    } catch (cause) {
      return remoteError(reply, request, cause);
    }
  });

  app.post('/api/v2/instances', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    if (!originIsAllowed(request, config) || !requireCsrf(appRequest, database)) {
      return error(
        reply,
        403,
        'CSRF_REJECTED',
        'La protección CSRF rechazó la solicitud.',
        request,
      );
    }
    const parsed = instanceProvisionRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return error(
        reply,
        400,
        'INVALID_REQUEST',
        'La intención técnica no cumple el contrato.',
        request,
      );
    if (
      !(await requireConnectionAccess(appRequest, reply, database, parsed.data.connectionId, true))
    )
      return;
    try {
      const result = await provisionInstance(database, config, parsed.data);
      invalidateConnectionHistory(parsed.data.connectionId);
      const accepted =
        result.result && typeof result.result === 'object'
          ? (result.result as Record<string, unknown>)
          : null;
      const acceptedIdentifiers = extractRemoteIdentifiers(accepted, { rootIdAsInstance: false });
      const acceptedInstanceId = acceptedIdentifiers.instanceId;
      const acceptedOperationId = acceptedIdentifiers.operationId;
      if (appRequest.sessionUser) {
        recordActionIntent(database, {
          actorId: appRequest.sessionUser.id,
          connectionId: parsed.data.connectionId,
          requestedName: parsed.data.name,
          instanceId: acceptedInstanceId,
          action: 'provision',
          idempotencyKey: result.idempotencyKey,
          operationId: acceptedOperationId,
        });
        if (acceptedInstanceId) {
          assignNewResource(
            database,
            parsed.data.connectionId,
            acceptedInstanceId,
            appRequest.sessionUser.id,
          );
        }
      }
      await database
        .prepare(
          'INSERT INTO audit_events (id, actor_id, action, resource, correlation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          randomUUID(),
          appRequest.sessionUser?.id ?? null,
          'provision-instance',
          'connection:' + parsed.data.connectionId,
          correlationId(request),
          new Date().toISOString(),
        );
      return reply.code(result.status === 202 ? 202 : 200).send({
        ...result,
        tracking: {
          requestedName: parsed.data.name,
          instanceId: acceptedInstanceId,
          operationId: acceptedOperationId,
        },
      });
    } catch (cause) {
      return remoteError(reply, request, cause);
    }
  });

  app.post('/api/v2/instances/:instanceId/access/verify', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    if (!originIsAllowed(request, config) || !requireCsrf(appRequest, database)) {
      return error(
        reply,
        403,
        'CSRF_REJECTED',
        'La protección CSRF rechazó la solicitud.',
        request,
      );
    }
    const connectionId = connectionIdFromQuery(request);
    if (!connectionId)
      return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
    const instanceId = String((request.params as { instanceId: string }).instanceId);
    if (!(await requireResourceAccess(appRequest, reply, database, connectionId, instanceId, true)))
      return;
    try {
      const result = await verifyInstanceAccess(database, config, connectionId, instanceId);
      return reply.code(result.status === 202 ? 202 : 200).send(result);
    } catch (cause) {
      return remoteError(reply, request, cause);
    }
  });

  app.post('/api/v2/instances/:instanceId/power/shutdown', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    if (!originIsAllowed(request, config) || !requireCsrf(appRequest, database)) {
      return error(
        reply,
        403,
        'CSRF_REJECTED',
        'La protección CSRF rechazó la solicitud.',
        request,
      );
    }
    const connectionId = connectionIdFromQuery(request);
    if (!connectionId)
      return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
    const instanceId = String((request.params as { instanceId: string }).instanceId);
    if (!(await requireResourceAccess(appRequest, reply, database, connectionId, instanceId, true)))
      return;
    try {
      const result = await shutdownInstance(database, config, connectionId, instanceId);
      invalidateConnectionHistory(connectionId);
      return reply.code(result.status === 202 ? 202 : 200).send(result);
    } catch (cause) {
      return remoteError(reply, request, cause);
    }
  });

  const registerInstanceAction = (
    path: string,
    action: (
      connectionId: string,
      instanceId: string,
    ) => Promise<{ status: number; idempotencyKey: string; result: unknown }>,
  ) => {
    app.post(path, async (request, reply) => {
      const appRequest = request as AppRequest;
      await requireSession(appRequest, reply, database);
      if (reply.sent) return;
      if (!originIsAllowed(request, config) || !requireCsrf(appRequest, database)) {
        return error(
          reply,
          403,
          'CSRF_REJECTED',
          'La protección CSRF rechazó la solicitud.',
          request,
        );
      }
      const connectionId = connectionIdFromQuery(request);
      if (!connectionId)
        return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
      const instanceId = String((request.params as { instanceId: string }).instanceId);
      if (
        !(await requireResourceAccess(appRequest, reply, database, connectionId, instanceId, true))
      )
        return;
      try {
        const result = await action(connectionId, instanceId);
        invalidateConnectionHistory(connectionId);
        await database
          .prepare(
            'INSERT INTO audit_events (id, actor_id, action, resource, correlation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(
            randomUUID(),
            appRequest.sessionUser?.id ?? null,
            path.split('/').slice(-2).join('-'),
            'instance:' + instanceId,
            correlationId(request),
            new Date().toISOString(),
          );
        return reply.code(result.status === 202 ? 202 : 200).send(result);
      } catch (cause) {
        return remoteError(reply, request, cause);
      }
    });
  };

  registerInstanceAction('/api/v2/instances/:instanceId/power/start', (connectionId, instanceId) =>
    startInstance(database, config, connectionId, instanceId),
  );
  registerInstanceAction('/api/v2/instances/:instanceId/power/reboot', (connectionId, instanceId) =>
    rebootInstance(database, config, connectionId, instanceId),
  );
  registerInstanceAction('/api/v2/instances/:instanceId/reconcile', (connectionId, instanceId) =>
    reconcileInstance(database, config, connectionId, instanceId),
  );

  app.delete('/api/v2/instances/:instanceId', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    if (!originIsAllowed(request, config) || !requireCsrf(appRequest, database)) {
      return error(
        reply,
        403,
        'CSRF_REJECTED',
        'La protección CSRF rechazó la solicitud.',
        request,
      );
    }
    const connectionId = connectionIdFromQuery(request);
    if (!connectionId)
      return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
    const instanceId = String((request.params as { instanceId: string }).instanceId);
    if (!(await requireResourceAccess(appRequest, reply, database, connectionId, instanceId, true)))
      return;
    const parsed = instanceDeleteRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return error(reply, 400, 'INVALID_REQUEST', 'La eliminación no cumple el contrato.', request);
    try {
      const power = await getInstancePower(database, config, connectionId, instanceId);
      if (power.power_state !== 'stopped') {
        return error(
          reply,
          409,
          'INSTANCE_NOT_STOPPED',
          'La instancia debe estar confirmada como apagada antes de eliminarla.',
          request,
        );
      }
      const result = await deleteInstance(database, config, {
        connectionId,
        instanceId,
        operationId: parsed.data.operationId,
        planSha256: parsed.data.planSha256,
      });
      invalidateConnectionHistory(connectionId);
      return reply.code(result.status === 202 ? 202 : 200).send(result);
    } catch (cause) {
      return remoteError(reply, request, cause);
    }
  });

  app.get('/api/v2/operations', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    const connectionId = connectionIdFromQuery(request);
    if (!connectionId)
      return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
    if (!(await requireConnectionAccess(appRequest, reply, database, connectionId))) return;
    try {
      const remoteItems = await listOperations(
        database,
        config,
        connectionId,
        upstreamQuery(request),
      );
      claimProvisionedResources(database, connectionId, remoteItems);
      const items = filterRemoteItemsForUser(database, appRequest, connectionId, remoteItems);
      return reply.send({
        connectionId,
        items,
        evidence: publishedEvidence(items.length),
      });
    } catch (cause) {
      return remoteError(reply, request, cause);
    }
  });

  app.get('/api/v2/operations/:operationId', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    const connectionId = connectionIdFromQuery(request);
    if (!connectionId)
      return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
    if (!(await requireConnectionAccess(appRequest, reply, database, connectionId))) return;
    try {
      const item = await getOperation(
        database,
        config,
        connectionId,
        String((request.params as { operationId: string }).operationId),
      );
      const instanceId = instanceIdFromItem(item);
      if (appRequest.sessionUser?.role !== 'Administrador') {
        if (
          !instanceId ||
          !(await requireResourceAccess(appRequest, reply, database, connectionId, instanceId))
        )
          return;
      }
      return reply.send({
        connectionId,
        item,
      });
    } catch (cause) {
      return remoteError(reply, request, cause);
    }
  });

  app.get('/api/v2/events', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    const connectionId = connectionIdFromQuery(request);
    if (!connectionId)
      return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
    if (!(await requireConnectionAccess(appRequest, reply, database, connectionId))) return;
    try {
      const remoteItems = await listEvents(
        database,
        config,
        connectionId,
        localHistoryQuery(request),
      );
      const items = filterRemoteItemsForUser(database, appRequest, connectionId, remoteItems);
      return reply.send({
        connectionId,
        items,
        evidence: publishedEvidence(items.length),
      });
    } catch (cause) {
      return remoteError(reply, request, cause);
    }
  });

  app.get('/api/v2/observability', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    const connectionId = connectionIdFromQuery(request);
    if (!connectionId)
      return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
    if (!(await requireConnectionAccess(appRequest, reply, database, connectionId))) return;
    try {
      return reply.send({
        connectionId,
        item: observabilityForUser(
          appRequest,
          await getObservability(database, config, connectionId),
        ),
      });
    } catch (cause) {
      return remoteError(reply, request, cause);
    }
  });

  app.get('/api/v2/workers', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    const connectionId = connectionIdFromQuery(request);
    if (!connectionId)
      return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
    if (!(await requireConnectionAccess(appRequest, reply, database, connectionId))) return;
    try {
      const workers = await listWorkers(database, config, connectionId);
      const visibleWorkers = filterWorkersForUser(
        database,
        appRequest,
        connectionId,
        workers.items,
      );
      const evidenceSource =
        workers.source === 'operation-history'
          ? 'operation-history'
          : workers.source === 'not-published'
            ? 'not-published'
            : 'published';
      return reply.send({
        connectionId,
        ...workers,
        items: visibleWorkers,
        observability: observabilityForUser(appRequest, workers.observability),
        evidence: publishedEvidence(
          visibleWorkers.length,
          evidenceSource,
          workers.source === 'not-published'
            ? 'Esta fuente no publica workers individuales ni observabilidad de workers.'
            : null,
        ),
      });
    } catch (cause) {
      return remoteError(reply, request, cause);
    }
  });

  app.get('/api/v2/incidents', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    const connectionId = connectionIdFromQuery(request);
    if (!connectionId)
      return error(reply, 400, 'CONNECTION_REQUIRED', 'Debe indicar connectionId.', request);
    if (!(await requireConnectionAccess(appRequest, reply, database, connectionId))) return;
    try {
      const remoteItems = await listIncidents(
        database,
        config,
        connectionId,
        localHistoryQuery(request),
      );
      const assignments =
        appRequest.sessionUser?.role === 'Administrador'
          ? null
          : new Set(
              listResourceAssignments(database, appRequest.sessionUser?.id)
                .filter((grant) => grant.connectionId === connectionId && grant.canRead)
                .map((grant) => grant.instanceId),
            );
      const visibleIncidents = remoteItems.filter((incident) => {
        if (assignments === null) return true;
        const item = incident.item as Record<string, unknown>;
        const instanceId = instanceIdFromItem(item);
        return Boolean(instanceId && assignments.has(instanceId));
      });
      const query = request.query as Record<string, unknown>;
      const requestedLimit = Number(query.limit ?? 100);
      const requestedOffset = Number(query.offset ?? 0);
      const limit = Number.isFinite(requestedLimit)
        ? Math.max(1, Math.min(100, Math.floor(requestedLimit)))
        : 100;
      const offset = Number.isFinite(requestedOffset)
        ? Math.max(0, Math.floor(requestedOffset))
        : 0;
      const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentIncidents = visibleIncidents.filter((incident) => {
        const item = incident.item as Record<string, unknown>;
        const status = publishedIncidentStatus(item);
        if (incident.source === 'instance' || status === 'uncertain' || status === 'stale') {
          return true;
        }
        const dateValue =
          item.occurred_at ??
          item.updated_at ??
          item.finished_at ??
          item.created_at ??
          item.observed_at;
        const timestamp = typeof dateValue === 'string' ? Date.parse(dateValue) : Number.NaN;
        return Number.isFinite(timestamp) && timestamp >= recentCutoff;
      });
      const periodItems = query.period === '7d' ? recentIncidents : visibleIncidents;
      const items = periodItems.slice(offset, offset + limit);
      const summary = visibleIncidents.reduce(
        (result, incident) => {
          const item = incident.item as Record<string, unknown>;
          const status = publishedIncidentStatus(item);
          const dateValue =
            item.occurred_at ??
            item.updated_at ??
            item.finished_at ??
            item.created_at ??
            item.observed_at;
          const timestamp = typeof dateValue === 'string' ? Date.parse(dateValue) : Number.NaN;
          if (status === 'failed') result.failed += 1;
          if (status === 'uncertain') result.uncertain += 1;
          if (status === 'stale') result.stale += 1;
          if (status === 'uncertain' || status === 'stale') result.unresolved += 1;
          if (Number.isFinite(timestamp)) {
            if (timestamp >= recentCutoff) result.recent7d += 1;
          } else if (
            incident.source !== 'instance' &&
            status !== 'uncertain' &&
            status !== 'stale'
          ) {
            result.undated += 1;
          }
          if (incident.source === 'instance') result.failedInstances += 1;
          return result;
        },
        {
          failed: 0,
          uncertain: 0,
          stale: 0,
          recent7d: 0,
          unresolved: 0,
          undated: 0,
          failedInstances: 0,
        },
      );
      return reply.send({
        connectionId,
        source: 'published-inventory-operations-events',
        available: true,
        items,
        summary: {
          total: visibleIncidents.length,
          filteredTotal: periodItems.length,
          ...summary,
        },
        evidence: publishedEvidence(items.length, 'derived'),
      });
    } catch (cause) {
      return remoteError(reply, request, cause);
    }
  });

  if (servesWeb) {
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        const pathname = decodeURIComponent(new URL(request.url, 'http://iacoc.local').pathname);
        const candidate = resolve(webRoot, '.' + pathname);
        const relativeCandidate = relative(webRoot, candidate);
        if (relativeCandidate.startsWith('..') || relativeCandidate.includes('..' + '/')) {
          return error(reply, 400, 'INVALID_PATH', 'La ruta solicitada no es válida.', request);
        }
        const file =
          existsSync(candidate) && statSync(candidate).isFile()
            ? candidate
            : join(webRoot, 'index.html');
        const contentTypes: Record<string, string> = {
          '.css': 'text/css; charset=utf-8',
          '.html': 'text/html; charset=utf-8',
          '.ico': 'image/x-icon',
          '.js': 'text/javascript; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.webp': 'image/webp',
          '.woff2': 'font/woff2',
        };
        return reply
          .type(contentTypes[extname(file)] ?? 'application/octet-stream')
          .send(readFileSync(file));
      }
      return error(reply, 404, 'NOT_FOUND', 'La ruta no existe.', request);
    });
  }

  return app;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const config = readServerConfig();
  const app = await createApp({ config });
  await app.listen({ host: config.host, port: config.port });
}
