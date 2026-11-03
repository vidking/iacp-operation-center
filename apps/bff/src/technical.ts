import { randomBytes, randomUUID } from 'node:crypto';
import type { ServerConfig } from '@iacoc/config';
import type { Database } from './db';
import { liveConnectionCredential } from './connections';
import { requestIacpJson, fetchIacp, UpstreamResponseError } from './upstream';

export type RemotePlan = {
  plan_id: string;
  name: string | null;
  vcpus: number | null;
  memory_mb: number | null;
  disk_gb: number | null;
  availability: unknown;
};

export type RemoteImage = {
  image_id: string;
  operating_system: string | null;
  status: string | null;
  compatible_plans: string[];
  authorized: boolean | null;
  availability: unknown;
};

export type RemoteNetworkProfile = Record<string, unknown>;

export type RemoteInstance = Record<string, unknown>;
export type RemoteOperation = Record<string, unknown>;
export type RemoteEvent = Record<string, unknown>;
export type RemoteIncident = {
  source: 'operation' | 'event' | 'instance';
  incidentId: string;
  item: Record<string, unknown>;
};

type IncidentSnapshot = { fetchedAt: number; refreshKey: string | null; items: RemoteIncident[] };
const incidentSnapshots = new Map<string, IncidentSnapshot>();
type EventSnapshot = { fetchedAt: number; refreshKey: string | null; items: RemoteEvent[] };
const eventSnapshots = new Map<string, EventSnapshot>();
const incidentSnapshotTtlMs = 15_000;

export function invalidateConnectionHistory(connectionId: string): void {
  incidentSnapshots.delete(connectionId);
  eventSnapshots.delete(connectionId);
}

const sensitiveResponseKey = /(password|token|bearer|secret|private[_-]?key|credential)/i;

function withoutRemoteSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutRemoteSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !sensitiveResponseKey.test(key))
      .map(([key, nested]) => [key, withoutRemoteSecrets(nested)]),
  );
}

export class ConnectionUnavailableError extends Error {
  constructor() {
    super('La conexión no está activa, validada o habilitada para LIVE.');
    this.name = 'ConnectionUnavailableError';
  }
}

function connectionTarget(database: Database, config: ServerConfig, id: string) {
  const target = liveConnectionCredential(database, config.keyringFile, id);
  if (!target) throw new ConnectionUnavailableError();
  return target;
}

function listFromBody(body: unknown, keys: string[]): unknown[] {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];
  for (const key of [...keys, 'data', 'results', 'records']) {
    const value = (body as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function publishedStatus(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function publishedIpAddresses(instance: Record<string, unknown>): string[] {
  const observation = recordValue(instance.network_observation);
  const allocation = recordValue(instance.network_allocation);
  const network = recordValue(instance.network);
  const result = recordValue(instance.result);
  const sources = [instance, observation, allocation, network, result].filter(
    (value): value is Record<string, unknown> => value !== null,
  );
  const keys = ['ip_addresses', 'observed_ipv4', 'current_ip_addresses', 'ips', 'ip', 'addresses'];
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (Array.isArray(value)) {
        const addresses = value.filter((entry): entry is string => typeof entry === 'string');
        if (addresses.length > 0) return addresses;
      } else if (typeof value === 'string' && value) {
        return [value];
      }
    }
  }
  if (allocation?.status === 'allocated' && typeof allocation.address === 'string') {
    return [allocation.address];
  }
  return [];
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function normalizePlan(value: unknown): RemotePlan | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const planId = stringValue(item.plan_id);
  if (!planId) return null;
  return {
    plan_id: planId,
    name: stringValue(item.name),
    vcpus: numberValue(item.vcpus),
    memory_mb: numberValue(item.memory_mb),
    disk_gb: numberValue(item.disk_gb),
    availability: item.availability ?? null,
  };
}

function normalizeImage(value: unknown): RemoteImage | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const imageId = stringValue(item.image_id);
  if (!imageId) return null;
  return {
    image_id: imageId,
    operating_system: stringValue(item.operating_system),
    status: stringValue(item.status),
    compatible_plans: Array.isArray(item.compatible_plans)
      ? item.compatible_plans.filter((entry): entry is string => typeof entry === 'string')
      : [],
    authorized: typeof item.authorized === 'boolean' ? item.authorized : null,
    availability: item.availability ?? null,
  };
}

export async function listPlans(database: Database, config: ServerConfig, connectionId: string) {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  const body = await fetchIacp(config, connection.endpoint, '/v1/plans', bearer);
  return listFromBody(body, ['plans'])
    .map(normalizePlan)
    .filter((item): item is RemotePlan => item !== null);
}

export async function listImages(database: Database, config: ServerConfig, connectionId: string) {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  const body = await fetchIacp(config, connection.endpoint, '/v1/images', bearer);
  return listFromBody(body, ['images'])
    .map(normalizeImage)
    .filter((item): item is RemoteImage => item !== null);
}

export async function listNetworkProfiles(
  database: Database,
  config: ServerConfig,
  connectionId: string,
): Promise<RemoteNetworkProfile[]> {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  try {
    const body = await fetchIacp(config, connection.endpoint, '/v1/network-profiles', bearer);
    return withoutRemoteSecrets(
      listFromBody(body, ['network_profiles', 'profiles']),
    ) as RemoteNetworkProfile[];
  } catch (cause) {
    if (cause instanceof UpstreamResponseError && [404, 405, 501].includes(cause.status)) return [];
    throw cause;
  }
}

export async function listInstances(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  query: string,
  includeNetwork = false,
) {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  const parsedQuery = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  // The API's default listing hides failed/uncertain resources. The portal
  // requests their published states explicitly so a rejected or ambiguous
  // create cannot disappear from the customer's view.
  // Deleted resources are excluded from normal inventory reads. Historical
  // views must opt in explicitly with include_deleted=true.
  // `kind` identifies the production/development source in the portal. Each
  // API owns its contract; both expose this inventory shape through the same
  // consumption flow.
  if (!parsedQuery.has('include_deleted')) {
    parsedQuery.set('include_deleted', 'false');
  }
  const encodedQuery = parsedQuery.toString();
  const body = await fetchIacp(
    config,
    connection.endpoint,
    '/v1/instances' + (encodedQuery ? '?' + encodedQuery : ''),
    bearer,
  );
  const items = withoutRemoteSecrets(listFromBody(body, ['instances'])) as RemoteInstance[];
  if (!includeNetwork) return items;

  const enriched: RemoteInstance[] = [];
  for (let offset = 0; offset < items.length; offset += 6) {
    const chunk = await Promise.all(
      items.slice(offset, offset + 6).map(async (item) => {
        const instanceId = stringValue(item.instance_id) ?? stringValue(item.id);
        if (!instanceId || String(item.status ?? '').toLowerCase() === 'deleted') return item;
        try {
          const network = await getInstanceNetwork(database, config, connectionId, instanceId);
          const addresses = Array.isArray(network.ip_addresses)
            ? network.ip_addresses.filter((value): value is string => typeof value === 'string')
            : [];
          return {
            ...item,
            ip_addresses: addresses,
            network,
            network_allocation: network.network_allocation ?? item.network_allocation ?? null,
            network_profile: network.network_profile ?? item.network_profile ?? null,
          };
        } catch {
          return {
            ...item,
            network: {
              instance_id: instanceId,
              status: 'unavailable',
              ip_addresses: [],
              reason: 'NETWORK_OBSERVATION_UNAVAILABLE',
            },
          };
        }
      }),
    );
    enriched.push(...chunk);
  }
  return enriched;
}

export async function getInstance(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  instanceId: string,
) {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  return withoutRemoteSecrets(
    await fetchIacp(
      config,
      connection.endpoint,
      '/v1/instances/' + encodeURIComponent(instanceId),
      bearer,
    ),
  ) as RemoteInstance;
}

export async function getInstancePower(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  instanceId: string,
) {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  return withoutRemoteSecrets(
    await fetchIacp(
      config,
      connection.endpoint,
      '/v1/instances/' + encodeURIComponent(instanceId) + '/power',
      bearer,
    ),
  ) as Record<string, unknown>;
}

export async function getInstanceNetwork(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  instanceId: string,
) {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  const body = await fetchIacp(
    config,
    connection.endpoint,
    '/v1/instances/' + encodeURIComponent(instanceId) + '/network',
    bearer,
  );
  const network = recordValue(body) ?? {};
  const ipAddresses = publishedIpAddresses(network);
  const upstreamStatus = stringValue(network.status);
  return withoutRemoteSecrets({
    ...network,
    instance_id: stringValue(network.instance_id) ?? instanceId,
    remote_status: upstreamStatus,
    status: ipAddresses.length > 0 ? 'published' : (upstreamStatus ?? 'not-published'),
    ip_addresses: ipAddresses,
    network_mode: network.network_mode ?? null,
    network_profile: network.network_profile ?? null,
    network_observation: network.network_observation ?? null,
    network_allocation: network.network_allocation ?? null,
    node: network.node ?? null,
  }) as Record<string, unknown>;
}

export async function listOperations(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  query: string,
) {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  const body = await fetchIacp(config, connection.endpoint, '/v1/operations' + query, bearer);
  return withoutRemoteSecrets(listFromBody(body, ['operations', 'items'])) as RemoteOperation[];
}

export async function getOperation(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  operationId: string,
) {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  return withoutRemoteSecrets(
    await fetchIacp(
      config,
      connection.endpoint,
      '/v1/operations/' + encodeURIComponent(operationId),
      bearer,
    ),
  ) as RemoteOperation;
}

export async function listEvents(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  query: string,
) {
  const parameters = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const requestedLimit = Number(parameters.get('limit') ?? 100);
  const requestedOffset = Number(parameters.get('offset') ?? 0);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(500, Math.floor(requestedLimit)))
    : 100;
  const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.floor(requestedOffset)) : 0;
  const items = await listAllEvents(database, config, connectionId, parameters.get('refresh'));
  const direction = parameters.get('sort') === 'asc' ? 1 : -1;
  return withoutRemoteSecrets(
    [...items]
      .sort((left, right) => {
        const difference = incidentTimestamp(left) - incidentTimestamp(right);
        return difference === 0
          ? direction * String(left.event_id ?? '').localeCompare(String(right.event_id ?? ''))
          : direction * difference;
      })
      .slice(offset, offset + limit),
  ) as RemoteEvent[];
}

export async function getObservability(
  database: Database,
  config: ServerConfig,
  connectionId: string,
): Promise<Record<string, unknown>> {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  const body = await fetchIacp(config, connection.endpoint, '/v1/observability', bearer);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  return withoutRemoteSecrets(body) as Record<string, unknown>;
}

export async function listWorkers(
  database: Database,
  config: ServerConfig,
  connectionId: string,
): Promise<{
  available: boolean;
  source: 'workers' | 'observability' | 'operation-history' | 'not-published';
  items: unknown[];
  observability: Record<string, unknown>;
}> {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  let workerBody: unknown = null;
  try {
    workerBody = await fetchIacp(config, connection.endpoint, '/v1/workers', bearer);
  } catch (cause) {
    if (!(cause instanceof UpstreamResponseError) || ![404, 405, 501].includes(cause.status))
      throw cause;
  }
  const workerItems = listFromBody(workerBody, ['workers', 'items']);
  if (workerItems.length > 0) {
    const observability = await getObservability(database, config, connectionId).catch(() => ({}));
    return {
      available: true,
      source: 'workers',
      items: withoutRemoteSecrets(workerItems) as unknown[],
      observability,
    };
  }
  const observability = await getObservability(database, config, connectionId);
  const publishedWorkers = listFromBody(observability, ['workers', 'items']);
  if (publishedWorkers.length === 0) {
    // The API's published page-size limit is below 200. Keep
    // this fallback bounded and let the regular Operations view paginate the
    // complete history instead of making worker discovery fail with 422.
    const operations = await listOperations(database, config, connectionId, '?limit=100');
    const byWorker = new Map<string, Record<string, unknown>>();
    for (const operation of operations) {
      const record = operation as Record<string, unknown>;
      const workerId = stringValue(record.worker_id);
      if (!workerId || byWorker.has(workerId)) continue;
      byWorker.set(workerId, {
        worker_id: workerId,
        status: 'unknown',
        liveness: 'unknown',
        heartbeat_stale: null,
        last_heartbeat: null,
        heartbeat_age_seconds: null,
        current_operation_id: null,
        current_operation: null,
        last_operation: record,
        evidence: 'operation-history',
      });
    }
    const historicalWorkers = [...byWorker.values()];
    if (historicalWorkers.length > 0) {
      return {
        available: true,
        source: 'operation-history',
        items: withoutRemoteSecrets(historicalWorkers) as unknown[],
        observability,
      };
    }
  }
  return {
    available: publishedWorkers.length > 0,
    source: publishedWorkers.length > 0 ? 'observability' : 'not-published',
    items: withoutRemoteSecrets(publishedWorkers) as unknown[],
    observability,
  };
}

export async function listIncidents(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  query: string,
): Promise<RemoteIncident[]> {
  const parameters = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const refreshKey = parameters.get('refresh');
  const cached = incidentSnapshots.get(connectionId);
  const cacheIsFresh = cached && Date.now() - cached.fetchedAt < incidentSnapshotTtlMs;
  const mayReuseCache = cacheIsFresh && (!refreshKey || cached.refreshKey === refreshKey);

  let incidents: RemoteIncident[];
  if (mayReuseCache) {
    incidents = cached.items;
  } else {
    const [operations, events, failedInstances] = await Promise.all([
      listAllOperations(database, config, connectionId),
      listAllEvents(database, config, connectionId, refreshKey),
      listAllFailedInstances(database, config, connectionId),
    ]);
    const failedStatus = (item: Record<string, unknown>) => {
      const status = publishedStatus(item.normalized_status ?? item.status);
      return status === 'failed' || status === 'uncertain' || status === 'stale';
    };
    incidents = [
      ...operations
        .filter((item) => failedStatus(item))
        .map((item, index) => ({
          source: 'operation' as const,
          incidentId: stringValue(item.operation_id) ?? 'operation-' + index,
          item,
        })),
      ...events
        .filter((item) => failedStatus(item))
        .map((item, index) => ({
          source: 'event' as const,
          incidentId:
            typeof item.event_id === 'string' || typeof item.event_id === 'number'
              ? String(item.event_id)
              : 'event-' + index,
          item,
        })),
      ...failedInstances
        .filter((item) => failedStatus(item))
        .map((item, index) => {
          const latest = recordValue(item.latest_operation);
          return {
            source: 'instance' as const,
            incidentId:
              stringValue(item.instance_id) ?? stringValue(item.id) ?? 'instance-' + index,
            item: latest ? { ...latest, ...item, latest_operation: latest } : item,
          };
        }),
    ];
    incidentSnapshots.set(connectionId, {
      fetchedAt: Date.now(),
      refreshKey,
      items: incidents,
    });
  }

  const sortDirection = parameters.get('sort') === 'asc' ? 1 : -1;
  return withoutRemoteSecrets(
    [...incidents].sort((left, right) => {
      const dateDifference = incidentTimestamp(left.item) - incidentTimestamp(right.item);
      return dateDifference === 0
        ? sortDirection * left.incidentId.localeCompare(right.incidentId)
        : sortDirection * dateDifference;
    }),
  ) as RemoteIncident[];
}

async function listAllOperations(
  database: Database,
  config: ServerConfig,
  connectionId: string,
): Promise<RemoteOperation[]> {
  const pageSize = 100;
  const items: RemoteOperation[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await listOperations(
      database,
      config,
      connectionId,
      `?limit=${pageSize}&offset=${offset}`,
    );
    items.push(...page);
    if (page.length < pageSize) return items;
  }
}

async function listAllEvents(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  refreshKey: string | null = null,
): Promise<RemoteEvent[]> {
  const cached = eventSnapshots.get(connectionId);
  const cacheIsFresh = cached && Date.now() - cached.fetchedAt < incidentSnapshotTtlMs;
  if (cacheIsFresh && (!refreshKey || cached.refreshKey === refreshKey)) return cached.items;
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  const pageSize = 500;
  const items: RemoteEvent[] = [];
  const seen = new Set<string>();
  let after = 0;
  for (;;) {
    const body = await fetchIacp(
      config,
      connection.endpoint,
      `/v1/events?after=${after}&limit=${pageSize}`,
      bearer,
    );
    const page = listFromBody(body, ['events', 'items']) as RemoteEvent[];
    if (page.length === 0) {
      eventSnapshots.set(connectionId, { fetchedAt: Date.now(), refreshKey, items });
      return items;
    }
    for (const item of page) {
      const id = item.event_id;
      const key = id === undefined || id === null ? '' : String(id);
      if (!key || !seen.has(key)) items.push(item);
      if (key) seen.add(key);
    }
    const bodyRecord = recordValue(body);
    const nextAfter = Number(bodyRecord?.next_after);
    const lastEventId = Number(page.at(-1)?.event_id);
    const cursor = Number.isSafeInteger(nextAfter) ? nextAfter : lastEventId;
    if (!Number.isSafeInteger(cursor) || cursor <= after) {
      eventSnapshots.set(connectionId, { fetchedAt: Date.now(), refreshKey, items });
      return items;
    }
    after = cursor;
  }
}

async function listAllFailedInstances(
  database: Database,
  config: ServerConfig,
  connectionId: string,
): Promise<RemoteInstance[]> {
  const pageSize = 100;
  const items: RemoteInstance[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await listInstances(
      database,
      config,
      connectionId,
      `?status=failed&include_deleted=false&limit=${pageSize}&offset=${offset}`,
    );
    items.push(...page);
    if (page.length < pageSize) return items;
  }
}

function incidentTimestamp(item: Record<string, unknown>): number {
  const value =
    item.occurred_at ?? item.updated_at ?? item.finished_at ?? item.created_at ?? item.observed_at;
  if (typeof value !== 'string') return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export async function provisionInstance(
  database: Database,
  config: ServerConfig,
  input: {
    connectionId: string;
    name: string;
    planId: string;
    imageId: string;
    networkProfile: 'lab-dhcp' | 'wan-static' | 'lab_dhcp' | 'prod_static';
    startOnCreate: boolean;
    access?: { rootPassword?: string; sshPublicKeys: string[] };
    commercialContext?: {
      customerId?: string;
      customerTag?: string;
      orderId?: string;
      productId?: string;
    };
  },
) {
  const { connection, bearer } = connectionTarget(database, config, input.connectionId);
  const idempotencyKey = randomUUID();
  const ephemeralRootPassword = input.access?.rootPassword ?? randomBytes(32).toString('base64url');
  const access = {
    root_password: ephemeralRootPassword,
    ssh_public_keys: input.access?.sshPublicKeys ?? [],
  };
  const context = input.commercialContext;
  // Production and development are independent APIs with their own contracts.
  // Their provisioning shapes are equivalent for IaCoC, so both use this same
  // consumption flow. The source kind labels the environment; it must not pick
  // an endpoint or transform the request body.
  const commercialContext =
    context && context.customerId && context.customerTag && context.orderId && context.productId
      ? {
          customer_id: context.customerId,
          customer_tag: context.customerTag,
          order_id: context.orderId,
          product_id: context.productId,
        }
      : undefined;
  const body = {
    name: input.name,
    plan_id: input.planId,
    image_id: input.imageId,
    access,
    ...(commercialContext ? { commercial_context: commercialContext } : {}),
    network_profile:
      input.networkProfile === 'wan-static' || input.networkProfile === 'prod_static'
        ? 'prod_static'
        : 'lab_dhcp',
    start_on_create: input.startOnCreate,
  };
  const response = await requestIacpJson(config, connection.endpoint, '/v1/instances', bearer, {
    method: 'POST',
    idempotencyKey,
    body,
  });
  return {
    status: response.status,
    idempotencyKey,
    result: withoutRemoteSecrets(response.body),
  };
}

async function instanceAction(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  instanceId: string,
  action: 'start' | 'shutdown' | 'reboot' | 'reconcile',
) {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  const idempotencyKey = randomUUID();
  const suffix = action === 'reconcile' ? '/reconcile' : '/power/' + action;
  const response = await requestIacpJson(
    config,
    connection.endpoint,
    '/v1/instances/' + encodeURIComponent(instanceId) + suffix,
    bearer,
    { method: 'POST', idempotencyKey, body: {} },
  );
  return { status: response.status, idempotencyKey, result: withoutRemoteSecrets(response.body) };
}

export function startInstance(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  instanceId: string,
) {
  return instanceAction(database, config, connectionId, instanceId, 'start');
}

export function rebootInstance(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  instanceId: string,
) {
  return instanceAction(database, config, connectionId, instanceId, 'reboot');
}

export function reconcileInstance(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  instanceId: string,
) {
  return instanceAction(database, config, connectionId, instanceId, 'reconcile');
}

export async function verifyInstanceAccess(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  instanceId: string,
) {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  const idempotencyKey = randomUUID();
  const response = await requestIacpJson(
    config,
    connection.endpoint,
    '/v1/instances/' + encodeURIComponent(instanceId) + '/access/verify',
    bearer,
    { method: 'POST', idempotencyKey, body: {} },
  );
  return { status: response.status, result: withoutRemoteSecrets(response.body) };
}

export async function shutdownInstance(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  instanceId: string,
) {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  const idempotencyKey = randomUUID();
  const response = await requestIacpJson(
    config,
    connection.endpoint,
    '/v1/instances/' + encodeURIComponent(instanceId) + '/power/shutdown',
    bearer,
    { method: 'POST', idempotencyKey, body: {} },
  );
  return {
    status: response.status,
    idempotencyKey,
    result: withoutRemoteSecrets(response.body),
  };
}

export async function deleteInstance(
  database: Database,
  config: ServerConfig,
  input: {
    connectionId: string;
    instanceId: string;
    operationId?: string;
    planSha256?: string;
  },
) {
  const { connection, bearer } = connectionTarget(database, config, input.connectionId);
  const idempotencyKey = randomUUID();
  const response = await requestIacpJson(
    config,
    connection.endpoint,
    '/v1/instances/' + encodeURIComponent(input.instanceId),
    bearer,
    {
      method: 'DELETE',
      idempotencyKey,
      ...(input.operationId && input.planSha256
        ? { body: { operation_id: input.operationId, plan_sha256: input.planSha256 } }
        : {}),
    },
  );
  return { status: response.status, result: withoutRemoteSecrets(response.body) };
}

export function isUpstreamResponseError(error: unknown): error is UpstreamResponseError {
  return error instanceof UpstreamResponseError;
}
