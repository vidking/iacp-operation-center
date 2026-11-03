import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readServerConfig } from '@iacoc/config';
import { activateConnection, createConnection, validateConnection } from './connections';
import { openDatabase } from './db';
import {
  getInstanceNetwork,
  listImages,
  listIncidents,
  listInstances,
  listEvents,
  listPlans,
  listWorkers,
  provisionInstance,
} from './technical';

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

describe('adaptador técnico de las APIs ControlPlane', () => {
  it('recorre la paginación real de operaciones, eventos e instancias fallidas', async () => {
    const database = openDatabase(':memory:');
    const keyring = keyringFile();
    const serverConfig = config(keyring);
    const connection = createConnection(database, keyring, {
      name: 'incident-pagination',
      endpoint: 'https://fixture.invalid',
      bearer: 'fixture-token',
      kind: 'controlplane-v2',
    });
    const oldOperations = Array.from({ length: 100 }, (_, index) => ({
      operation_id: `operation-${index}`,
      instance_id: 'old-instance',
      kind: 'instance.create',
      status: index === 0 ? 'failed' : 'completed',
      created_at: '2026-10-01T10:00:00.000Z',
    }));
    const oldEvents = Array.from({ length: 500 }, (_, index) => ({
      event_id: index + 1,
      operation_id: 'old-operation',
      instance_id: 'old-instance',
      status: 'completed',
      occurred_at: '2026-10-01T10:00:00.000Z',
    }));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/health/live') return new Response(JSON.stringify({ status: 'live' }));
      if (url.pathname === '/health/ready')
        return new Response(JSON.stringify({ status: 'ready' }));
      if (url.pathname === '/v1/observability')
        return new Response(JSON.stringify({ tenant_id: 'tenant', dependencies: {} }));
      if (url.pathname === '/v1/operations') {
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const page =
          offset === 0
            ? oldOperations
            : offset === 100
              ? [
                  {
                    operation_id: 'current-operation',
                    instance_id: 'current-instance',
                    kind: 'instance.create',
                    status: 'failed',
                    error_code: 'PROVISIONING_FAILED',
                    error_message: 'La intención de laboratorio falló.',
                    created_at: '2026-11-02T12:00:00.000Z',
                  },
                ]
              : [];
        return new Response(JSON.stringify(page));
      }
      if (url.pathname === '/v1/events') {
        const after = Number(url.searchParams.get('after') ?? 0);
        const page =
          after === 0
            ? oldEvents
            : after === 500
              ? [
                  {
                    event_id: 501,
                    operation_id: 'current-event-operation',
                    instance_id: 'current-event-instance',
                    status: 'failed',
                    code: 'PROVISIONING_FAILED',
                    actor: 'worker:provisioning',
                    occurred_at: '2026-11-02T12:04:00.000Z',
                  },
                ]
              : [];
        return new Response(
          JSON.stringify({ events: page, next_after: page.at(-1)?.event_id ?? after }),
        );
      }
      if (url.pathname === '/v1/instances') {
        return new Response(
          JSON.stringify({
            instances: [
              {
                instance_id: 'failed-instance',
                name: 'provisioning-failed-vm',
                status: 'failed',
                error_message: 'No completó el aprovisionamiento.',
                created_at: '2026-11-02T12:05:00.000Z',
              },
            ],
          }),
        );
      }
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

    const incidents = await listIncidents(
      database,
      serverConfig,
      connection.id,
      '?limit=100&offset=0&sort=desc&refresh=test-refresh-1',
    );

    expect(incidents.slice(0, 3).map((incident) => incident.incidentId)).toEqual([
      'failed-instance',
      '501',
      'current-operation',
    ]);
    expect(incidents.some((incident) => incident.incidentId === 'operation-0')).toBe(true);
    await expect(
      listEvents(
        database,
        serverConfig,
        connection.id,
        '?limit=1&offset=0&sort=desc&refresh=test-refresh-1',
      ),
    ).resolves.toMatchObject([{ event_id: 501, actor: 'worker:provisioning' }]);
    expect(
      fetchMock.mock.calls
        .filter(([input]) => new URL(String(input)).pathname === '/v1/operations')
        .map(([input]) => new URL(String(input)).searchParams.get('offset')),
    ).toEqual(['0', '100']);
    expect(
      fetchMock.mock.calls
        .filter(([input]) => new URL(String(input)).pathname === '/v1/events')
        .map(([input]) => new URL(String(input)).searchParams.get('after')),
    ).toEqual(['0', '500', '501']);
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = new URL(String(input));
        return url.pathname === '/v1/instances' && url.searchParams.get('status') === 'failed';
      }),
    ).toBe(true);
    database.close();
  });

  it('consume el inventario de producción y desarrollo con el mismo flujo', async () => {
    const database = openDatabase(':memory:');
    const keyring = keyringFile();
    const serverConfig = config(keyring);
    const productionConnection = createConnection(database, keyring, {
      name: 'production-inventory',
      endpoint: 'https://fixture.invalid',
      bearer: 'fixture-token-production',
      kind: 'controlplane',
    });
    const developmentConnection = createConnection(database, keyring, {
      name: 'development-inventory',
      endpoint: 'https://fixture.invalid',
      bearer: 'fixture-token-development',
      kind: 'controlplane-v2',
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/health/live') return new Response(JSON.stringify({ status: 'live' }));
      if (url.pathname === '/health/ready')
        return new Response(JSON.stringify({ status: 'ready' }));
      if (url.pathname === '/v1/observability')
        return new Response(JSON.stringify({ tenant_id: 'tenant', dependencies: {} }));
      if (url.pathname === '/v1/instances') {
        return new Response(
          JSON.stringify({
            instances: [
              { instance_id: 'shared-instance', name: 'shared-instance', status: 'ready' },
            ],
            total: 1,
            limit: 100,
            offset: 0,
          }),
        );
      }
      return new Response('{}');
    });
    for (const connection of [productionConnection, developmentConnection]) {
      const validation = await validateConnection(database, serverConfig, connection.id);
      expect(validation.ok).toBe(true);
      expect(
        activateConnection(
          database,
          connection.id,
          { action: 'activate', confirmSingleTenant: true },
          true,
        ),
      ).toMatchObject({ connection: { active: true, mode: 'LIVE' } });
    }
    await expect(
      listInstances(database, serverConfig, productionConnection.id, '?limit=100'),
    ).resolves.toEqual([
      { instance_id: 'shared-instance', name: 'shared-instance', status: 'ready' },
    ]);
    await expect(
      listInstances(database, serverConfig, developmentConnection.id, '?limit=100'),
    ).resolves.toEqual([
      { instance_id: 'shared-instance', name: 'shared-instance', status: 'ready' },
    ]);
    expect(
      fetchMock.mock.calls.filter(([input]) => {
        const url = new URL(String(input));
        return url.pathname === '/v1/instances';
      }),
    ).toHaveLength(2);
    expect(
      fetchMock.mock.calls
        .filter(([input]) => new URL(String(input)).pathname === '/v1/instances')
        .every(([input]) => new URL(String(input)).searchParams.get('include_deleted') === 'false'),
    ).toBe(true);
    await listInstances(
      database,
      serverConfig,
      productionConnection.id,
      '?limit=100&include_deleted=true',
    );
    const lastInstanceRequest = fetchMock.mock.calls
      .filter(([input]) => new URL(String(input)).pathname === '/v1/instances')
      .at(-1);
    expect(lastInstanceRequest).toBeDefined();
    expect(new URL(String(lastInstanceRequest?.[0])).searchParams.get('include_deleted')).toBe(
      'true',
    );
    database.close();
  });

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

  it('consulta la red de la API de producción con su conexión independiente', async () => {
    const database = openDatabase(':memory:');
    const keyring = keyringFile();
    const serverConfig = config(keyring);
    const connection = createConnection(database, keyring, {
      name: 'network-fixture',
      endpoint: 'https://fixture.invalid',
      bearer: 'fixture-token',
      kind: 'controlplane',
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === '/health/live') return new Response(JSON.stringify({ status: 'live' }));
      if (path === '/health/ready') return new Response(JSON.stringify({ status: 'ready' }));
      if (path === '/v1/observability')
        return new Response(JSON.stringify({ tenant_id: 'tenant', dependencies: {} }));
      if (path === '/v1/instances/network-instance/network')
        return new Response(
          JSON.stringify({
            instance_id: 'network-instance',
            observed_ipv4: ['192.0.2.10'],
            source: 'guest_agent',
            status: 'observed',
            network_mode: 'dhcp',
            network_profile: 'lab_dhcp',
            network_observation: { guest_ready: true },
            node: 'mng01',
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
    await expect(
      getInstanceNetwork(database, serverConfig, connection.id, 'network-instance'),
    ).resolves.toMatchObject({
      instance_id: 'network-instance',
      status: 'published',
      ip_addresses: ['192.0.2.10'],
      observed_ipv4: ['192.0.2.10'],
      source: 'guest_agent',
      remote_status: 'observed',
      network_mode: 'dhcp',
      network_profile: 'lab_dhcp',
      network_observation: { guest_ready: true },
      network_allocation: null,
      node: 'mng01',
    });
    expect(
      fetchMock.mock.calls.some(
        ([input]) => new URL(String(input)).pathname === '/v1/instances/network-instance/network',
      ),
    ).toBe(true);
    database.close();
  });

  it('consulta la red de la API de desarrollo con su conexión independiente', async () => {
    const database = openDatabase(':memory:');
    const keyring = keyringFile();
    const serverConfig = config(keyring);
    const connection = createConnection(database, keyring, {
      name: 'nested-network-fixture',
      endpoint: 'https://fixture.invalid',
      bearer: 'fixture-token',
      kind: 'controlplane-v2',
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === '/health/live') return new Response(JSON.stringify({ status: 'live' }));
      if (path === '/health/ready') return new Response(JSON.stringify({ status: 'ready' }));
      if (path === '/v1/observability')
        return new Response(JSON.stringify({ tenant_id: 'tenant', dependencies: {} }));
      if (path === '/v1/instances/nested-network-instance/network')
        return new Response(
          JSON.stringify({
            instance_id: 'nested-network-instance',
            observed_ipv4: ['192.0.2.22'],
            source: 'guest_agent',
            status: 'observed',
            network_profile: 'lab_dhcp',
            network_allocation: null,
            node: 'mng01',
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
    await expect(
      getInstanceNetwork(database, serverConfig, connection.id, 'nested-network-instance'),
    ).resolves.toMatchObject({
      status: 'published',
      ip_addresses: ['192.0.2.22'],
      observed_ipv4: ['192.0.2.22'],
      source: 'guest_agent',
      network_profile: 'lab_dhcp',
    });
    expect(
      fetchMock.mock.calls.some(
        ([input]) =>
          new URL(String(input)).pathname === '/v1/instances/nested-network-instance/network',
      ),
    ).toBe(true);
    database.close();
  });

  it('publica la IP asignada de una reserva estática', async () => {
    const database = openDatabase(':memory:');
    const keyring = keyringFile();
    const serverConfig = config(keyring);
    const connection = createConnection(database, keyring, {
      name: 'static-network-fixture',
      endpoint: 'https://fixture.invalid',
      bearer: 'fixture-token',
      kind: 'controlplane-v2',
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === '/health/live') return new Response(JSON.stringify({ status: 'live' }));
      if (path === '/health/ready') return new Response(JSON.stringify({ status: 'ready' }));
      if (path === '/v1/observability')
        return new Response(JSON.stringify({ tenant_id: 'tenant', dependencies: {} }));
      if (path === '/v1/instances/static-network-instance/network')
        return new Response(
          JSON.stringify({
            instance_id: 'static-network-instance',
            observed_ipv4: [],
            status: 'unavailable',
            network_allocation: {
              status: 'allocated',
              address: '192.0.2.30',
              gateway: '192.0.2.1',
            },
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
    await expect(
      getInstanceNetwork(database, serverConfig, connection.id, 'static-network-instance'),
    ).resolves.toMatchObject({
      status: 'published',
      ip_addresses: ['192.0.2.30'],
      network_allocation: { status: 'allocated', address: '192.0.2.30' },
    });
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
      kind: 'controlplane',
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === '/health/live') return new Response(JSON.stringify({ status: 'live' }));
      if (path === '/health/ready') return new Response(JSON.stringify({ status: 'ready' }));
      if (path === '/v1/observability')
        return new Response(JSON.stringify({ tenant_id: 'tenant', dependencies: {} }));
      expect(path).toBe('/v1/instances');
      const body = JSON.parse(String(init?.body)) as {
        access: { root_password: string };
        network_profile?: string;
        network?: unknown;
      };
      expect(body.access.root_password.length).toBeGreaterThan(20);
      expect(body.network_profile).toBe('lab_dhcp');
      expect(body.network).toBeUndefined();
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
