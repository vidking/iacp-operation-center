import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readServerConfig } from '@iacoc/config';
import { activateConnection, createConnection, validateConnection } from './connections';
import { openDatabase } from './db';
import { listImages, listPlans, listWorkers, provisionInstance } from './technical';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '127.0.0.1' }]),
}));

const temporaryDirectories: string[] = [];

function keyringFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'iacoc-technical-'));
  temporaryDirectories.push(directory);
  const keyId = randomUUID();
  const filename = join(directory, 'keyring.json');
  writeFileSync(
    filename,
    JSON.stringify({
      version: 1,
      activeKeyId: keyId,
      keys: { [keyId]: randomBytes(32).toString('base64') },
    }),
  );
  return filename;
}

function config(keyring: string) {
  return readServerConfig({
    NODE_ENV: 'test',
    LIVE_ENABLED: 'true',
    IACOC_KEYRING_FILE: keyring,
    IACP_ALLOWED_TARGETS: JSON.stringify([
      { origin: 'https://fixture.invalid', addresses: ['127.0.0.1'] },
    ]),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('adaptador técnico ControlPlaneV2', () => {
  it('normaliza planes e imágenes con las dos formas publicadas', async () => {
    const database = openDatabase(':memory:');
    const keyring = keyringFile();
    const serverConfig = config(keyring);
    const first = createConnection(database, keyring, {
      name: 'fixture-one',
      endpoint: 'https://fixture.invalid',
      bearer: 'fixture-token-one',
    });
    const second = createConnection(database, keyring, {
      name: 'fixture-two',
      endpoint: 'https://fixture.invalid',
      bearer: 'fixture-token-two',
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === '/health/live') return new Response(JSON.stringify({ status: 'live' }));
      if (path === '/health/ready') return new Response(JSON.stringify({ status: 'ready' }));
      if (path === '/v1/observability')
        return new Response(JSON.stringify({ tenant_id: 'tenant', dependencies: {} }));
      if (path === '/v1/plans')
        return new Response(JSON.stringify({ plans: [{ plan_id: 'kvm-1', vcpus: 1 }] }));
      if (path === '/v1/images')
        return new Response(JSON.stringify([{ image_id: 'ubuntu-2404', authorized: true }]));
      void init;
      return new Response('{}');
    });
    for (const connection of [first, second]) {
      const validation = await validateConnection(database, serverConfig, connection.id);
      expect(validation.ok).toBe(true);
      expect(
        activateConnection(
          database,
          connection.id,
          {
            action: 'activate',
            confirmSingleTenant: true,
          },
          true,
        ),
      ).toMatchObject({ connection: { active: true, mode: 'LIVE' } });
    }
    const [plan] = await listPlans(database, serverConfig, first.id);
    const [image] = await listImages(database, serverConfig, second.id);
    expect(plan?.plan_id).toBe('kvm-1');
    expect(image?.image_id).toBe('ubuntu-2404');
    expect(fetchMock).toHaveBeenCalled();
    expect(
      database.prepare('SELECT COUNT(*) AS count FROM connections WHERE active = 1').get(),
    ).toMatchObject({ count: 2 });
    database.close();
  });

  it('envía una contraseña efímera y una idempotency key sin persistirla', async () => {
    const database = openDatabase(':memory:');
    const keyring = keyringFile();
    const serverConfig = config(keyring);
    const connection = createConnection(database, keyring, {
      name: 'fixture',
      endpoint: 'https://fixture.invalid',
      bearer: 'fixture-token',
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === '/health/live') return new Response(JSON.stringify({ status: 'live' }));
      if (path === '/health/ready') return new Response(JSON.stringify({ status: 'ready' }));
      if (path === '/v1/observability')
        return new Response(JSON.stringify({ tenant_id: 'tenant', dependencies: {} }));
      expect(path).toBe('/v1/instances');
      const body = JSON.parse(String(init?.body)) as { access: { root_password: string } };
      expect(body.access.root_password.length).toBeGreaterThan(20);
      expect(init?.headers).toMatchObject({ 'Idempotency-Key': expect.any(String) });
      return new Response(
        JSON.stringify({
          status: 'queued',
          operation_id: 'operation',
          root_password: 'must-not-leave-bff',
          nested: { access_token: 'must-not-leave-bff' },
        }),
        {
          status: 202,
        },
      );
    });
    const validation = await validateConnection(database, serverConfig, connection.id);
    expect(validation.ok).toBe(true);
    activateConnection(
      database,
      connection.id,
      { action: 'activate', confirmSingleTenant: true },
      true,
    );
    const result = await provisionInstance(database, serverConfig, {
      connectionId: connection.id,
      name: 'iacoc-v2-smoke',
      planId: 'kvm-1',
      imageId: 'ubuntu-2404',
      networkProfile: 'lab-dhcp',
      startOnCreate: true,
    });
    expect(result.status).toBe(202);
    expect(result.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.result).toEqual({
      status: 'queued',
      operation_id: 'operation',
      nested: {},
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM connections').get()).toMatchObject({
      count: 1,
    });
    database.close();
  });

  it('expone los workers publicados y no los convierte en métricas inventadas', async () => {
    const database = openDatabase(':memory:');
    const keyring = keyringFile();
    const serverConfig = config(keyring);
    const connection = createConnection(database, keyring, {
      name: 'workers-fixture',
      endpoint: 'https://fixture.invalid',
      bearer: 'fixture-token',
    });
    const workers = Array.from({ length: 6 }, (_, index) => ({
      worker_id: 'worker-' + (index + 1),
      status: 'idle',
      liveness: 'healthy',
      last_heartbeat: '2026-10-31T00:00:00.000Z',
    }));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === '/health/live') return new Response(JSON.stringify({ status: 'live' }));
      if (path === '/health/ready') return new Response(JSON.stringify({ status: 'ready' }));
      if (path === '/v1/observability')
        return new Response(JSON.stringify({ active_operations: 0, queue_depth: 0 }));
      if (path === '/v1/workers') return new Response(JSON.stringify({ workers }));
      return new Response('{}');
    });
    const validation = await validateConnection(database, serverConfig, connection.id);
    expect(validation.ok).toBe(true);
    activateConnection(
      database,
      connection.id,
      { action: 'activate', confirmSingleTenant: true },
      true,
    );
    const result = await listWorkers(database, serverConfig, connection.id);
    expect(result.source).toBe('workers');
    expect(result.items).toHaveLength(6);
    expect(result.items[0]).toMatchObject({ worker_id: 'worker-1', liveness: 'healthy' });
    database.close();
  });

  it('conserva el historial de worker cuando la fuente no publica workers individuales', async () => {
    const database = openDatabase(':memory:');
    const keyring = keyringFile();
    const serverConfig = config(keyring);
    const connection = createConnection(database, keyring, {
      name: 'historical-workers-fixture',
      endpoint: 'https://fixture.invalid',
      bearer: 'fixture-token',
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === '/health/live') return new Response(JSON.stringify({ status: 'live' }));
      if (path === '/health/ready') return new Response(JSON.stringify({ status: 'ready' }));
      if (path === '/v1/observability')
        return new Response(JSON.stringify({ active_operations: 0, queue_depth: 0 }));
      if (path === '/v1/workers')
        return new Response(JSON.stringify({ detail: 'not published' }), { status: 404 });
      if (path === '/v1/operations')
        return new Response(
          JSON.stringify({
            items: [
              {
                operation_id: 'operation-1',
                worker_id: 'worker-observed',
                command: 'instance.network.discover',
                status: 'completed',
              },
            ],
          }),
        );
      return new Response('{}');
    });
    const validation = await validateConnection(database, serverConfig, connection.id);
    expect(validation.ok).toBe(true);
    activateConnection(
      database,
      connection.id,
      { action: 'activate', confirmSingleTenant: true },
      true,
    );
    const result = await listWorkers(database, serverConfig, connection.id);
    expect(result.source).toBe('operation-history');
    expect(result.items).toEqual([
      expect.objectContaining({
        worker_id: 'worker-observed',
        liveness: 'unknown',
        last_heartbeat: null,
        evidence: 'operation-history',
      }),
    ]);
    database.close();
  });
});
