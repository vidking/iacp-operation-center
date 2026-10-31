import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Connection } from '@iacoc/contracts';
import { readServerConfig } from '@iacoc/config';
import { createUser } from './auth';
import { openDatabase } from './db';
import { createApp } from './server';
import { fingerprintEndpoint } from './scope';

function insertTestConnection(
  database: ReturnType<typeof openDatabase>,
  values: Partial<Connection> = {},
) {
  const id = values.id ?? randomUUID();
  const endpoint = values.endpoint ?? 'https://fixture.invalid';
  database
    .prepare(
      'INSERT INTO connections (id, name, endpoint, kind, status, scope_confirmed, mode, active, tenant_id, tenant_published, dependencies, last_validation_at, evidence_at, credential_version, contract_fingerprint, endpoint_fingerprint, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      id,
      values.name ?? 'Test connection',
      endpoint,
      values.kind ?? 'controlplane-v2',
      values.status ?? 'pending-confirmation',
      values.scopeConfirmed ? 1 : 0,
      values.mode ?? 'READ_ONLY',
      values.active ? 1 : 0,
      values.tenantId ?? null,
      values.tenantPublished ? 1 : 0,
      values.dependencies ?? 'not-published',
      values.lastValidationAt !== undefined ? values.lastValidationAt : new Date().toISOString(),
      values.evidenceAt ?? null,
      values.credentialVersion ?? 1,
      values.contractFingerprint ?? 'test-contract',
      fingerprintEndpoint(endpoint),
      new Date().toISOString(),
    );
  return id;
}

describe('BFF V2', () => {
  it('arranca desconectado y no crea usuarios predeterminados', async () => {
    const database = openDatabase(':memory:');
    const app = await createApp({
      database,
      config: readServerConfig({ NODE_ENV: 'test', LIVE_ENABLED: 'true' }),
    });
    const response = await app.inject({ method: 'GET', url: '/api/v2/session' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ authenticated: false, user: null });
    await app.close();
    database.close();
  });

  it('protege overview y permite una activación confirmada idempotente', async () => {
    const database = openDatabase(':memory:');
    await createUser(
      database,
      'administrator.test',
      'not-a-default',
      'Administrador',
      'tenant-test',
    );
    const connectionId = insertTestConnection(database);
    const app = await createApp({
      database,
      config: readServerConfig({ NODE_ENV: 'test', LIVE_ENABLED: 'true' }),
    });
    const unauthenticated = await app.inject({ method: 'GET', url: '/api/v2/overview' });
    expect(unauthenticated.statusCode).toBe(401);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { username: 'administrator.test', password: 'not-a-default' },
      headers: { origin: 'http://localhost:5174' },
    });
    expect(login.statusCode).toBe(200);
    const cookies = login.cookies.map((item) => item.name + '=' + item.value).join('; ');
    const csrf = login.json().csrfToken as string;

    const first = await app.inject({
      method: 'POST',
      url: '/api/v2/connections/' + connectionId + '/activate',
      headers: { cookie: cookies, origin: 'http://localhost:5174', 'x-csrf-token': csrf },
      payload: { action: 'activate', confirmSingleTenant: true },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ scopeConfirmed: true, active: true, mode: 'LIVE' });

    const second = await app.inject({
      method: 'POST',
      url: '/api/v2/connections/' + connectionId + '/activate',
      headers: { cookie: cookies, origin: 'http://localhost:5174', 'x-csrf-token': csrf },
      payload: { action: 'activate', confirmSingleTenant: true },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().message).toContain('idempotente');
    await app.close();
    database.close();
  });

  it('no pasa a LIVE sin evidencia de validación', async () => {
    const database = openDatabase(':memory:');
    await createUser(
      database,
      'administrator.validation',
      'test-password',
      'Administrador',
      'tenant-test',
    );
    const connectionId = insertTestConnection(database, { lastValidationAt: null });
    const app = await createApp({ database });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { username: 'administrator.validation', password: 'test-password' },
      headers: { origin: 'http://localhost:5174' },
    });
    const cookies = login.cookies.map((item) => item.name + '=' + item.value).join('; ');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/connections/' + connectionId + '/activate',
      headers: {
        cookie: cookies,
        origin: 'http://localhost:5174',
        'x-csrf-token': login.json().csrfToken,
      },
      payload: { action: 'activate', confirmSingleTenant: true },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_REQUIRED' });
    await app.close();
    database.close();
  });
});
