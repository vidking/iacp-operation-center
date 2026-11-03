#!/usr/bin/env node
/* global Buffer, console, fetch, process, setTimeout, URLSearchParams */

/**
 * Controlled live matrix for IaCoC. The only mutation channel in this script is
 * the IaCoC BFF. Direct IACP and Proxmox calls are deliberately not used.
 *
 * Credentials are read from stdin as three lines:
 *   1. local IaCoC username
 *   2. local IaCoC password
 *   3. optional SSH public key (generated when omitted)
 *
 * The script is test-only. It creates names prefixed with `oc-live-`, exercises
 * the complete portal lifecycle, and deletes every resource it created.
 */

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const BASE_URL = (process.env.IACOC_LIVE_BASE_URL ?? 'https://iacoc.cyberfuel.com').replace(
  /\/$/,
  '',
);
const OPERATION_TIMEOUT_MS = Number(process.env.IACOC_LIVE_OPERATION_TIMEOUT_MS ?? 1_800_000);
const POLL_INTERVAL_MS = Number(process.env.IACOC_LIVE_POLL_INTERVAL_MS ?? 3_000);
const MAX_CONCURRENCY = Math.max(
  1,
  Math.min(Number(process.env.IACOC_LIVE_MAX_CONCURRENCY ?? 6), 6),
);
const CASE_LIMIT = Math.max(1, Number(process.env.IACOC_LIVE_CASE_LIMIT ?? 64));
const SOURCE_FILTER = process.env.IACOC_LIVE_SOURCE ?? 'both';
const DISCOVER_NETWORK = process.env.IACOC_LIVE_DISCOVER_NETWORK === 'true';
const REQUIRE_PUBLISHED_IP = process.env.IACOC_LIVE_REQUIRE_IP === 'true';
const RUN_ID = (process.env.IACOC_LIVE_RUN_ID ?? randomBytes(5).toString('hex')).toLowerCase();
const IMAGES = ['ubuntu-2404', 'ubuntu-2604', 'almalinux-9', 'almalinux-10'];
const PLANS = ['kvm-1', 'kvm-2', 'kvm-3', 'kvm-4'];

class PortalError extends Error {
  constructor(message, status = null, code = null) {
    super(message);
    this.name = 'PortalError';
    this.status = status;
    this.code = code;
  }
}

function safeText(value) {
  return String(value ?? '')
    .replace(/root[_-]?password/gi, '<secret>')
    .replace(/private[_-]?key/gi, '<secret>')
    .replace(/bearer|access[_-]?token|credential/gi, '<secret>');
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function textValue(value) {
  if (typeof value === 'string' && value) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function identifiers(value, rootIdAsInstance = true) {
  let instanceId = null;
  let operationId = null;
  const seen = new Set();
  function visit(candidate, root, depth) {
    if (depth > 4) return;
    const record = asRecord(candidate);
    if (!record || seen.has(record)) return;
    seen.add(record);
    if (!operationId) {
      for (const key of ['operation_id', 'operationId', 'job_id', 'jobId']) {
        operationId = textValue(record[key]);
        if (operationId) break;
      }
    }
    if (!instanceId) {
      for (const key of ['instance_id', 'instanceId', 'vmid']) {
        instanceId = textValue(record[key]);
        if (instanceId) break;
      }
    }
    if (!instanceId && (!root || rootIdAsInstance)) instanceId = textValue(record.id);
    for (const key of ['result', 'data', 'output', 'instance', 'operation', 'job']) {
      visit(record[key], false, depth + 1);
    }
  }
  visit(value, true, 0);
  return { instanceId, operationId };
}

function statusOf(value) {
  const record = asRecord(value) ?? {};
  return String(record.normalized_status ?? record.status ?? 'unknown').toLowerCase();
}

function publishedIps(value) {
  const record = asRecord(value);
  if (!record) return [];
  const sources = [
    record,
    record.network_observation,
    record.network_allocation,
    record.network,
    record.result,
  ].filter((item) => asRecord(item));
  for (const source of sources) {
    for (const key of ['ip_addresses', 'ips', 'ip', 'addresses', 'address']) {
      const candidate = source[key];
      if (Array.isArray(candidate)) {
        const addresses = candidate.filter((item) => typeof item === 'string' && item);
        if (addresses.length > 0) return addresses;
      } else if (typeof candidate === 'string' && candidate) {
        return [candidate];
      }
    }
  }
  return [];
}

function sshPublicKeyFromGeneratedEd25519() {
  const { publicKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { format: 'der', type: 'spki' },
    privateKeyEncoding: { format: 'der', type: 'pkcs8' },
  });
  // SubjectPublicKeyInfo for Ed25519 ends in the raw 32-byte public key.
  const raw = publicKey.subarray(-32);
  const type = Buffer.from('ssh-ed25519');
  const wire = Buffer.alloc(4 + type.length + 4 + raw.length);
  wire.writeUInt32BE(type.length, 0);
  type.copy(wire, 4);
  wire.writeUInt32BE(raw.length, 4 + type.length);
  raw.copy(wire, 8 + type.length);
  return `ssh-ed25519 ${wire.toString('base64')} iacoc-live-${RUN_ID}`;
}

function parseCookies(response) {
  const values =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie') ?? ''];
  const cookies = [];
  for (const value of values) {
    const match = value.match(/^(iacoc_v2_(?:session|csrf))=([^;]+)/);
    if (match) cookies.push([match[1], match[2]]);
  }
  return cookies;
}

class PortalClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
    this.csrfToken = null;
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
  }

  async request(path, init = {}) {
    const headers = {
      Accept: 'application/json',
      Origin: this.baseUrl,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(this.cookieHeader() ? { Cookie: this.cookieHeader() } : {}),
      ...(init.headers ?? {}),
    };
    const response = await fetch(this.baseUrl + path, { ...init, headers });
    for (const [key, value] of parseCookies(response)) this.cookies.set(key, value);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const record = asRecord(payload) ?? {};
      const detail = record.message ?? record.detail ?? record.code ?? `HTTP ${response.status}`;
      throw new PortalError(
        safeText(typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 400)),
        response.status,
        textValue(record.code),
      );
    }
    return payload;
  }

  get(path) {
    return this.request(path);
  }

  async post(path, payload) {
    if (!this.csrfToken) throw new PortalError('La sesión no publicó token CSRF.');
    return this.request(path, {
      method: 'POST',
      headers: { 'x-csrf-token': this.csrfToken },
      body: JSON.stringify(payload),
    });
  }

  async del(path, payload) {
    if (!this.csrfToken) throw new PortalError('La sesión no publicó token CSRF.');
    return this.request(path, {
      method: 'DELETE',
      headers: { 'x-csrf-token': this.csrfToken },
      body: JSON.stringify(payload),
    });
  }

  async login(username, password) {
    const payload = await this.request('/api/v2/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    this.csrfToken = textValue(asRecord(payload)?.csrfToken);
    const session = asRecord(await this.get('/api/v2/session'));
    if (!session?.authenticated || !asRecord(session.user)) {
      throw new PortalError('El portal no confirmó la sesión local.');
    }
    return session.user;
  }
}

function connectionQuery(path, connectionId, params = {}) {
  const query = new URLSearchParams({ connectionId, ...params });
  return `${path}?${query}`;
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function poll(label, read, ready, timeoutMs = OPERATION_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await read();
      if (ready(last)) return last;
    } catch (error) {
      if (!(error instanceof PortalError) || ![404, 409, 502].includes(error.status)) throw error;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new PortalError(
    `Timeout esperando ${label}; última evidencia: ${safeText(statusOf(last))}`,
  );
}

function findConnection(connections, endpoint) {
  return connections.find((item) => String(item.endpoint ?? '').replace(/\/$/, '') === endpoint);
}

function itemsOf(payload) {
  const record = asRecord(payload);
  return Array.isArray(record?.items) ? record.items : [];
}

async function waitOperation(client, connectionId, operationId, label) {
  return poll(
    `${label} (${operationId})`,
    async () => {
      const payload = asRecord(
        await client.get(
          connectionQuery(`/api/v2/operations/${encodeURIComponent(operationId)}`, connectionId),
        ),
      );
      return payload?.item ?? payload;
    },
    (item) => {
      const status = statusOf(item);
      if (['failed', 'uncertain', 'stale'].includes(status)) {
        throw new PortalError(`${label} terminó en ${status}.`);
      }
      return status === 'completed' || status === 'succeeded' || status === 'success';
    },
  );
}

async function findProvisionedInstance(client, connectionId, name) {
  const payload = await client.get(
    connectionQuery('/api/v2/instances', connectionId, {
      name,
      limit: 100,
      include_deleted: true,
    }),
  );
  return (
    itemsOf(payload).find((item) => String(item.name ?? item.instance_name ?? '') === name) ?? null
  );
}

async function waitForInstance(client, connectionId, name, acceptedId) {
  return poll(
    `instancia ${name}`,
    async () => {
      if (acceptedId) {
        try {
          const payload = asRecord(
            await client.get(
              connectionQuery(`/api/v2/instances/${encodeURIComponent(acceptedId)}`, connectionId),
            ),
          );
          return payload?.item ?? payload;
        } catch (error) {
          if (!(error instanceof PortalError) || error.status !== 404) throw error;
        }
      }
      return findProvisionedInstance(client, connectionId, name);
    },
    (item) => {
      const record = asRecord(item);
      if (!record) return false;
      const status = statusOf(record);
      if (['failed', 'uncertain'].includes(status)) {
        throw new PortalError(`La instancia ${name} quedó en ${status}.`);
      }
      return Boolean(record.instance_id ?? record.instanceId ?? record.id) && status !== 'deleted';
    },
  );
}

function instanceIdFrom(item) {
  return textValue(item?.instance_id ?? item?.instanceId ?? item?.id);
}

function operationIdFrom(payload) {
  return identifiers(payload, false).operationId;
}

async function remotePower(client, connectionId, instanceId) {
  const payload = asRecord(
    await client.get(
      connectionQuery(`/api/v2/instances/${encodeURIComponent(instanceId)}/power`, connectionId),
    ),
  );
  return payload?.item ?? payload;
}

async function waitPower(client, connectionId, instanceId, expected, label) {
  return poll(
    `${label} energía ${expected}`,
    () => remotePower(client, connectionId, instanceId),
    (item) =>
      String(asRecord(item)?.power_state ?? asRecord(item)?.power ?? '').toLowerCase() === expected,
    360_000,
  );
}

async function executeAction(client, connectionId, instanceId, path, label) {
  const response = await client.post(
    connectionQuery(`/api/v2/instances/${encodeURIComponent(instanceId)}${path}`, connectionId),
    {},
  );
  const operationId = operationIdFrom(response);
  if (operationId) await waitOperation(client, connectionId, operationId, label);
  return { response, operationId };
}

async function cleanup(client, connectionId, name, instanceId) {
  let id = instanceId;
  try {
    if (!id) {
      const found = await findProvisionedInstance(client, connectionId, name);
      id = instanceIdFrom(found);
    }
    if (!id) return 'sin-instancia';
    const power = await remotePower(client, connectionId, id).catch(() => null);
    const powerState = String(asRecord(power)?.power_state ?? '').toLowerCase();
    if (powerState === 'running') {
      const shutdown = await executeAction(
        client,
        connectionId,
        id,
        '/power/shutdown',
        `${name} cleanup shutdown`,
      );
      void shutdown;
      await waitPower(client, connectionId, id, 'stopped', `${name} cleanup`);
    }
    const response = await client.del(
      connectionQuery(`/api/v2/instances/${encodeURIComponent(id)}`, connectionId),
      { confirm: true },
    );
    const operationId = operationIdFrom(response);
    if (operationId)
      await waitOperation(client, connectionId, operationId, `${name} cleanup delete`);
    await poll(
      `${name} cleanup final`,
      () =>
        client.get(connectionQuery(`/api/v2/instances/${encodeURIComponent(id)}`, connectionId)),
      (payload) => statusOf(asRecord(payload)?.item ?? payload) === 'deleted',
      360_000,
    );
    return 'eliminada';
  } catch (error) {
    return `falló (${safeText(error instanceof Error ? error.message : error)})`;
  }
}

async function runCase(client, source, image, plan, mode, index, publicKey) {
  const channel = source.channel;
  const name = `oc-live-${channel}-${RUN_ID}-${String(index).padStart(2, '0')}-${image.replaceAll('-', '')}-${plan.replaceAll('-', '')}-${mode}`;
  const body = {
    name,
    connectionId: source.id,
    planId: plan,
    imageId: image,
    networkProfile: 'lab-dhcp',
    startOnCreate: false,
    accessMode: 'managed-ssh',
    access:
      mode === 'key'
        ? { sshPublicKeys: [publicKey] }
        : {
            rootPassword: `IaCoC-${RUN_ID}-${randomBytes(12).toString('base64url')}`,
            sshPublicKeys: [],
          },
    commercialContext: {
      customerId: `oc-${channel}-${RUN_ID}-${index}`,
      customerTag: `oc-${channel}-${RUN_ID}-${index}`,
      orderId: `oc-order-${channel}-${RUN_ID}-${index}`,
      productId: `${image}-${plan}`,
    },
  };
  let instanceId = null;
  const startedAt = Date.now();
  try {
    const created = asRecord(await client.post('/api/v2/instances', body));
    const tracking = asRecord(created?.tracking) ?? {};
    instanceId = textValue(tracking.instanceId);
    let operationId = textValue(tracking.operationId) ?? operationIdFrom(created?.result);
    if (!operationId && !instanceId) {
      const trackingItem = await poll(
        `${name} seguimiento local`,
        async () => {
          const payload = await client.get(connectionQuery('/api/v2/provisioning', source.id));
          return itemsOf(payload).find((item) => item.requestedName === name) ?? null;
        },
        (item) => Boolean(item?.instanceId ?? item?.operationId),
      );
      instanceId = textValue(trackingItem?.instanceId);
      operationId = textValue(trackingItem?.operationId);
    }
    if (operationId) await waitOperation(client, source.id, operationId, `${name} provision`);
    const instance = await waitForInstance(client, source.id, name, instanceId);
    instanceId = instanceIdFrom(instance);
    if (!instanceId) throw new PortalError(`${name} no publicó instance_id.`);
    if (String(instance.name ?? instance.instance_name ?? '') !== name) {
      throw new PortalError(`${name} no coincide con el nombre publicado.`);
    }
    if (instance.image_id && String(instance.image_id) !== image) {
      throw new PortalError(`${name} publicó una imagen distinta.`);
    }
    if (instance.plan_id && String(instance.plan_id) !== plan) {
      throw new PortalError(`${name} publicó un plan distinto.`);
    }

    const list = await client.get(
      connectionQuery('/api/v2/instances', source.id, { name, include_deleted: true, limit: 100 }),
    );
    if (!itemsOf(list).some((item) => instanceIdFrom(item) === instanceId)) {
      throw new PortalError(`${name} no aparece en el inventario del portal.`);
    }
    await remotePower(client, source.id, instanceId);
    await client.get(
      connectionQuery(`/api/v2/instances/${encodeURIComponent(instanceId)}/network`, source.id),
    );
    await client.get(
      connectionQuery('/api/v2/operations', source.id, { instance_id: instanceId, limit: 100 }),
    );
    await client.get(
      connectionQuery('/api/v2/events', source.id, { instance_id: instanceId, limit: 100 }),
    );
    await client.get(connectionQuery('/api/v2/workers', source.id));
    await client.get(connectionQuery('/api/v2/provisioning', source.id));

    await executeAction(client, source.id, instanceId, '/power/start', `${name} start`);
    await waitPower(client, source.id, instanceId, 'running', name);
    if (DISCOVER_NETWORK) {
      const networkPayload = await poll(
        `${name} IP publicada`,
        async () => {
          const payload = asRecord(
            await client.get(
              connectionQuery(
                `/api/v2/instances/${encodeURIComponent(instanceId)}/network`,
                source.id,
              ),
            ),
          );
          return payload?.item ?? payload;
        },
        (item) => !REQUIRE_PUBLISHED_IP || publishedIps(item).length > 0,
        REQUIRE_PUBLISHED_IP ? 360_000 : 30_000,
      );
      const ipCount = publishedIps(networkPayload).length;
      console.log(`OBSERVED source=${channel} name=${name} ip_count=${ipCount}`);
      if (REQUIRE_PUBLISHED_IP && ipCount === 0) {
        throw new PortalError(`${name} terminó sin IP publicada por IACP.`);
      }
    }
    await executeAction(client, source.id, instanceId, '/power/reboot', `${name} reboot`);
    await waitPower(client, source.id, instanceId, 'running', name);
    await executeAction(client, source.id, instanceId, '/power/shutdown', `${name} shutdown`);
    await waitPower(client, source.id, instanceId, 'stopped', name);

    const deleted = await client.del(
      connectionQuery(`/api/v2/instances/${encodeURIComponent(instanceId)}`, source.id),
      { confirm: true },
    );
    const deleteOperationId = operationIdFrom(deleted);
    if (deleteOperationId)
      await waitOperation(client, source.id, deleteOperationId, `${name} delete`);
    await poll(
      `${name} estado eliminado`,
      () =>
        client.get(
          connectionQuery(`/api/v2/instances/${encodeURIComponent(instanceId)}`, source.id),
        ),
      (payload) => statusOf(asRecord(payload)?.item ?? payload) === 'deleted',
      360_000,
    );
    console.log(
      `PASS source=${channel} image=${image} plan=${plan} mode=${mode} duration_s=${((Date.now() - startedAt) / 1000).toFixed(1)}`,
    );
    return { ok: true, name };
  } catch (error) {
    const cleaned = await cleanup(client, source.id, name, instanceId);
    const suffix =
      error instanceof PortalError
        ? ` status=${error.status ?? 'n/a'} code=${error.code ?? 'n/a'}`
        : '';
    console.error(
      `FAIL source=${channel} image=${image} plan=${plan} mode=${mode} cleanup=${cleaned} error=${safeText(error instanceof Error ? error.message : error)}${suffix}`,
    );
    return { ok: false, name, error: safeText(error instanceof Error ? error.message : error) };
  }
}

async function readCredentials() {
  const input = await readFile('/dev/stdin', 'utf8');
  const lines = input.split(/\r?\n/);
  const username = lines.shift()?.trim();
  const password = lines.shift();
  const publicKey = lines.join('\n').trim() || sshPublicKeyFromGeneratedEd25519();
  if (!username || !password)
    throw new PortalError('stdin requiere usuario y contraseña en las primeras dos líneas.');
  return { username, password, publicKey };
}

async function main() {
  const credentials = await readCredentials();
  const client = new PortalClient(BASE_URL);
  const user = await client.login(credentials.username, credentials.password);
  if (user.role !== 'Administrador') {
    throw new PortalError('La matriz live requiere Administrador del tenant.');
  }
  const connections = await client.get('/api/v2/connections');
  if (!Array.isArray(connections)) throw new PortalError('El portal no publicó sus conexiones.');
  const oldSource = findConnection(connections, 'https://iac.cyberfuel.com');
  const newSource = findConnection(connections, 'https://dev-iac.cyberfuel.com');
  if (!oldSource || !newSource)
    throw new PortalError('No están disponibles las dos fuentes IACP requeridas.');
  const allSources = [
    { ...oldSource, channel: 'old' },
    { ...newSource, channel: 'new' },
  ];
  const selectedSources = allSources.filter(
    (source) => SOURCE_FILTER === 'both' || SOURCE_FILTER === source.channel,
  );
  if (selectedSources.length === 0)
    throw new PortalError('IACOC_LIVE_SOURCE debe ser old, new o both.');
  for (const source of selectedSources) {
    console.log(
      `SOURCE channel=${source.channel} endpoint=${source.endpoint} kind=${source.kind} active=${source.active} mode=${source.mode}`,
    );
    if (!source.active || source.mode !== 'LIVE' || !source.scopeConfirmed) {
      throw new PortalError(
        `La fuente ${source.endpoint} no está activa LIVE con alcance confirmado.`,
      );
    }
    const [plans, images] = await Promise.all([
      client.get(connectionQuery('/api/v2/plans', source.id)),
      client.get(connectionQuery('/api/v2/images', source.id)),
    ]);
    const planIds = new Set(itemsOf(plans).map((item) => String(item.plan_id ?? item.id)));
    const imageIds = new Set(itemsOf(images).map((item) => String(item.image_id ?? item.id)));
    for (const plan of PLANS)
      if (!planIds.has(plan)) throw new PortalError(`Falta plan ${plan} en ${source.endpoint}.`);
    for (const image of IMAGES)
      if (!imageIds.has(image))
        throw new PortalError(`Falta imagen ${image} en ${source.endpoint}.`);
  }

  const cases = [];
  let index = 1;
  for (const source of selectedSources) {
    for (const image of IMAGES) {
      for (const plan of PLANS) {
        for (const mode of ['password', 'key']) {
          cases.push({ source, image, plan, mode, index });
          index += 1;
        }
      }
    }
  }
  cases.splice(CASE_LIMIT);
  console.log(
    `MATRIX START total=${cases.length} concurrency=${MAX_CONCURRENCY} portal=${BASE_URL}`,
  );
  const results = [];
  for (let offset = 0; offset < cases.length; offset += MAX_CONCURRENCY) {
    const wave = cases.slice(offset, offset + MAX_CONCURRENCY);
    const waveResults = await Promise.all(
      wave.map((item) =>
        runCase(
          client,
          item.source,
          item.image,
          item.plan,
          item.mode,
          item.index,
          credentials.publicKey,
        ),
      ),
    );
    results.push(...waveResults);
    const failures = waveResults.filter((item) => !item.ok);
    console.log(
      `WAVE done=${Math.min(offset + wave.length, cases.length)}/${cases.length} failed=${failures.length}`,
    );
    if (failures.length > 0) {
      console.error('MATRIX ABORTED after failed wave; no further KVMs will be created.');
      break;
    }
  }
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(`SUMMARY total=${results.length} passed=${passed} failed=${failed}`);
  if (failed || results.length !== cases.length) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(`MATRIX ABORTED error=${safeText(error instanceof Error ? error.message : error)}`);
  process.exitCode = 1;
}
