import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createUser, replaceUserGrants } from './auth';
import { hasConnectionAccess } from './connections';
import { openDatabase } from './db';
import { createApp } from './server';

function insertConnection(database: ReturnType<typeof openDatabase>, id = randomUUID()) {
  database
    .prepare(
      'INSERT INTO connections (id, name, endpoint, kind, status, scope_confirmed, mode, active, tenant_id, tenant_published, dependencies, credential_version, endpoint_fingerprint, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      id,
      'ControlPlaneV2 test',
      'https://fixture.invalid',
      'controlplane-v2',
      'active-partial',
      1,
      'LIVE',
      1,
      null,
      0,
      'not-published',
      1,
      'endpoint-fingerprint',
      new Date().toISOString(),
    );
  return id;
}

async function login(
  app: Awaited<ReturnType<typeof createApp>>,
  username: string,
  password: string,
) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v2/auth/login',
    payload: { username, password },
    headers: { origin: 'http://localhost:5174' },
  });
  return {
    cookie: response.cookies.map((item) => item.name + '=' + item.value).join('; '),
    csrf: response.json().csrfToken as string,
  };
}

describe('RBAC y preferencias de la consola', () => {
  it('limita lectura y operación a los conectores asignados', async () => {
    const database = openDatabase(':memory:');
    const connectionId = insertConnection(database);
    const unassignedConnectionId = insertConnection(database);
    const adminId = await createUser(
      database,
      'admin.access',
      'long-test-password',
      'Administrador',
      'tenant',
    );
    const readerId = await createUser(
      database,
      'reader.access',
      'long-test-password',
      'Lector',
      'tenant',
    );
    const operatorId = await createUser(
      database,
      'operator.access',
      'long-test-password',
      'Operador',
      'tenant',
    );
    replaceUserGrants(database, readerId, [{ connectionId, canRead: true, canOperate: false }]);
    replaceUserGrants(database, operatorId, [{ connectionId, canRead: true, canOperate: true }]);
    expect(hasConnectionAccess(database, { id: operatorId, role: 'Operador' }, connectionId)).toBe(
      true,
    );
    expect(
      hasConnectionAccess(database, { id: operatorId, role: 'Operador' }, connectionId, true),
    ).toBe(true);
    const app = await createApp({ database });

    const readerSession = await login(app, 'reader.access', 'long-test-password');
    const visible = await app.inject({
      method: 'GET',
      url: '/api/v2/connections',
      headers: { cookie: readerSession.cookie },
    });
    expect(visible.statusCode).toBe(200);
    expect(visible.json()).toHaveLength(1);

    const forbiddenRead = await app.inject({
      method: 'GET',
      url: '/api/v2/plans?connectionId=' + unassignedConnectionId,
      headers: { cookie: readerSession.cookie },
    });
    expect(forbiddenRead.statusCode).toBe(403);
    expect(forbiddenRead.json()).toMatchObject({ code: 'CONNECTION_ACCESS_DENIED' });

    const adminSession = await login(app, 'admin.access', 'long-test-password');
    const users = await app.inject({
      method: 'GET',
      url: '/api/v2/users',
      headers: { cookie: adminSession.cookie },
    });
    expect(users.statusCode).toBe(200);
    expect(users.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: adminId, role: 'Administrador' })]),
    );
    await app.close();
    database.close();
  });

  it('persiste preferencias de tema y tamaño de letra por identidad', async () => {
    const database = openDatabase(':memory:');
    await createUser(database, 'settings.access', 'long-test-password', 'Administrador', 'tenant');
    const app = await createApp({ database });
    const session = await login(app, 'settings.access', 'long-test-password');
    const changed = await app.inject({
      method: 'PATCH',
      url: '/api/v2/settings',
      headers: {
        cookie: session.cookie,
        origin: 'http://localhost:5174',
        'x-csrf-token': session.csrf,
      },
      payload: { theme: 'light', fontScale: 'large', density: 'compact', reducedMotion: true },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toEqual({
      theme: 'light',
      fontScale: 'large',
      density: 'compact',
      reducedMotion: true,
    });
    const read = await app.inject({
      method: 'GET',
      url: '/api/v2/settings',
      headers: { cookie: session.cookie },
    });
    expect(read.json()).toEqual({
      theme: 'light',
      fontScale: 'large',
      density: 'compact',
      reducedMotion: true,
    });
    await app.close();
    database.close();
  });
});
