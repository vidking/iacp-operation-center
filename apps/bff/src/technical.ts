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

export type RemoteInstance = Record<string, unknown>;
export type RemoteOperation = Record<string, unknown>;
export type RemoteEvent = Record<string, unknown>;

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
  for (const key of keys) {
    const value = (body as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
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

export async function listInstances(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  query: string,
) {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  const body = await fetchIacp(config, connection.endpoint, '/v1/instances' + query, bearer);
  return listFromBody(body, ['instances']);
}

export async function getInstance(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  instanceId: string,
) {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  return fetchIacp(
    config,
    connection.endpoint,
    '/v1/instances/' + encodeURIComponent(instanceId),
    bearer,
  );
}

export async function listOperations(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  query: string,
) {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  const body = await fetchIacp(config, connection.endpoint, '/v1/operations' + query, bearer);
  return listFromBody(body, ['operations']);
}

export async function getOperation(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  operationId: string,
) {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  return fetchIacp(
    config,
    connection.endpoint,
    '/v1/operations/' + encodeURIComponent(operationId),
    bearer,
  );
}

export async function listEvents(
  database: Database,
  config: ServerConfig,
  connectionId: string,
  query: string,
) {
  const { connection, bearer } = connectionTarget(database, config, connectionId);
  const body = await fetchIacp(config, connection.endpoint, '/v1/events' + query, bearer);
  return listFromBody(body, ['events', 'items']);
}

export async function provisionInstance(
  database: Database,
  config: ServerConfig,
  input: {
    connectionId: string;
    name: string;
    planId: string;
    imageId: string;
    networkProfile: 'lab-dhcp' | 'wan-static';
    startOnCreate: boolean;
  },
) {
  const { connection, bearer } = connectionTarget(database, config, input.connectionId);
  const idempotencyKey = randomUUID();
  const ephemeralRootPassword = randomBytes(32).toString('base64url');
  const response = await requestIacpJson(config, connection.endpoint, '/v1/instances', bearer, {
    method: 'POST',
    idempotencyKey,
    body: {
      name: input.name,
      plan_id: input.planId,
      image_id: input.imageId,
      access: { root_password: ephemeralRootPassword, ssh_public_keys: [] },
      network: { profile_id: input.networkProfile },
      start_on_create: input.startOnCreate,
    },
  });
  return {
    status: response.status,
    idempotencyKey,
    result: withoutRemoteSecrets(response.body),
  };
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

export async function deleteInstance(
  database: Database,
  config: ServerConfig,
  input: { connectionId: string; instanceId: string; operationId: string; planSha256: string },
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
      body: { operation_id: input.operationId, plan_sha256: input.planSha256 },
    },
  );
  return { status: response.status, result: withoutRemoteSecrets(response.body) };
}

export function isUpstreamResponseError(error: unknown): error is UpstreamResponseError {
  return error instanceof UpstreamResponseError;
}
