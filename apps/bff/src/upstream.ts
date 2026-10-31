import { lookup } from 'node:dns/promises';
import type { ServerConfig } from '@iacoc/config';

export class UpstreamPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamPolicyError';
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

export async function fetchIacp(
  config: ServerConfig,
  endpoint: string,
  path: string,
  bearer: string,
): Promise<unknown> {
  const target = allowedTarget(config, endpoint);
  const url = new URL(path, endpoint.endsWith('/') ? endpoint : endpoint + '/');
  if (!documentedIacpPaths.includes(url.pathname as (typeof documentedIacpPaths)[number])) {
    throw new UpstreamPolicyError('La ruta IACP no está publicada en el contrato permitido.');
  }
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.some((item) => target.addresses.includes(item.address))) {
    throw new UpstreamPolicyError('El DNS del endpoint no coincide con la allowlist.');
  }
  const response = await fetch(url, {
    headers: { Accept: 'application/json', Authorization: 'Bearer ' + bearer },
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
  if (!response.ok) {
    throw new Error('IACP respondió con HTTP ' + response.status);
  }
  return JSON.parse(body) as unknown;
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
