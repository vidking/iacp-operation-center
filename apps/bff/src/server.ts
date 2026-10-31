import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import {
  activationRequestSchema,
  type Capability,
  type Role,
  type Session as SessionContract,
} from '@iacoc/contracts';
import { readServerConfig, type ServerConfig } from '@iacoc/config';
import { authenticateUser, createSession, destroySession, findSession, verifyCsrf } from './auth';
import { activateConnection, listConnections } from './connections';
import { openDatabase, type Database } from './db';

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

export async function createApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? readServerConfig();
  const database = options.database ?? openDatabase(config.dbPath);
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  await app.register(cookie);

  app.addHook('onSend', async (_request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'same-origin');
    reply.header('cache-control', 'no-store');
  });

  app.get('/health/live', async () => ({ status: 'ok', service: 'iacoc-v2-bff' }));
  app.get('/health/ready', async () => ({ status: 'ok', database: 'available' }));

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
    const active = listConnections(database).find((connection) => connection.active) ?? null;
    return reply.send({
      connectionState: active?.status ?? 'disconnected',
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
    return reply.send(listConnections(database));
  });

  app.get('/api/v2/capabilities', async (request, reply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    return reply.send(disconnectedCapabilities());
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
    );
    if ('error' in result) {
      const status = result.code === 'SINGLE_TENANT_CONFIRMATION_REQUIRED' ? 409 : 400;
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

  const unavailableResource = async (request: FastifyRequest, reply: FastifyReply) => {
    const appRequest = request as AppRequest;
    await requireSession(appRequest, reply, database);
    if (reply.sent) return;
    return reply.send({
      available: false,
      reason: 'No existe una conexión IACP seleccionada o la capacidad no fue publicada.',
      items: [],
    });
  };
  app.get('/api/v2/instances', unavailableResource);
  app.get('/api/v2/operations', unavailableResource);
  app.get('/api/v2/events', unavailableResource);
  app.get('/api/v2/workers', unavailableResource);
  app.get('/api/v2/incidents', unavailableResource);

  return app;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const config = readServerConfig();
  const app = await createApp({ config });
  await app.listen({ host: config.host, port: config.port });
}
