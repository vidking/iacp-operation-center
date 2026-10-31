import { lookup } from 'node:dns/promises';
import type { ServerConfig } from '@iacoc/config';

export class UpstreamPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamPolicyError';
  }
}

export class UpstreamResponseError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super('IACP respondió con HTTP ' + status);
    this.name = 'UpstreamResponseError';
    this.status = status;
    this.body = body;
  }
}

function allowedTarget(
  config: ServerConfig,
  endpoint: string,
): { origin: string; addresses: string[] } {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') {
    throw new UpstreamPolicyError('El endpoint IACP debe usar TLS.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new UpstreamPolicyError('El endpoint no puede contener credenciales ni parámetros.');
  }
  const target = config.allowedTargets.find((item) => item.origin === url.origin);
  if (!target) {
    throw new UpstreamPolicyError('El endpoint no está en la allowlist de IACP.');
  }
  return target;
}

export function validateEndpoint(config: ServerConfig, endpoint: string): void {
  allowedTarget(config, endpoint);
}

async function requestIacp(
  config: ServerConfig,
  endpoint: string,
  path: string,
  bearer: string,
  options: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<{ status: number; body: unknown }> {
  const target = allowedTarget(config, endpoint);
  const url = new URL(path, endpoint.endsWith('/') ? endpoint : endpoint + '/');
  if (!isDocumentedIacpPath(url.pathname)) {
    throw new UpstreamPolicyError('La ruta IACP no está publicada en el contrato permitido.');
  }
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.some((item) => target.addresses.includes(item.address))) {
    throw new UpstreamPolicyError('El DNS del endpoint no coincide con la allowlist.');
  }
  const requestBody = options.body === undefined ? undefined : JSON.stringify(options.body);
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + bearer,
      ...(requestBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
    body: requestBody,
    redirect: 'error',
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > config.maxResponseBytes) {
    throw new UpstreamPolicyError('La respuesta IACP excede el límite permitido.');
  }
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > config.maxResponseBytes) {
    throw new UpstreamPolicyError('La respuesta IACP excede el límite permitido.');
  }
  const parsed = body ? (JSON.parse(body) as unknown) : null;
  if (!response.ok) throw new UpstreamResponseError(response.status, parsed);
  return { status: response.status, body: parsed };
}

export async function fetchIacp(
  config: ServerConfig,
  endpoint: string,
  path: string,
  bearer: string,
): Promise<unknown> {
  return (await requestIacp(config, endpoint, path, bearer)).body;
}

export async function requestIacpJson(
  config: ServerConfig,
  endpoint: string,
  path: string,
  bearer: string,
  options: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<{ status: number; body: unknown }> {
  return requestIacp(config, endpoint, path, bearer, options);
}

export function isDocumentedIacpPath(pathname: string): boolean {
  return documentedIacpPathPatterns.some((pattern) =>
    typeof pattern === 'string' ? pattern === pathname : pattern.test(pathname),
  );
}

export const documentedIacpPaths = [
  '/health/live',
  '/health/ready',
  '/v1/events',
  '/v1/images',
  '/v1/instances',
  '/v1/observability',
  '/v1/operations',
  '/v1/plans',
] as const;

const documentedIacpPathPatterns: readonly (string | RegExp)[] = [
  ...documentedIacpPaths,
  '/v1/workers',
  /^\/v1\/instances\/[^/]+$/,
  /^\/v1\/instances\/[^/]+\/access\/verify$/,
  /^\/v1\/instances\/[^/]+\/network\/discover$/,
  /^\/v1\/instances\/[^/]+\/network\/initialize$/,
  /^\/v1\/instances\/[^/]+\/power$/,
  /^\/v1\/instances\/[^/]+\/power\/(reboot|shutdown|start)$/,
  /^\/v1\/operations\/[^/]+$/,
];
