#!/usr/bin/env node
/* global Buffer, URL, console, process */

/**
 * Live IaCoC GUI matrix.
 *
 * This deliberately drives the public IaCoC interface with Playwright. It
 * does not call the IaCoC BFF or either IACP directly. Credentials are read
 * from stdin and never printed. Test resources are deleted through the GUI;
 * the optional 12-instance mode retains them only until the aggregate audit.
 */

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { chromium } from 'playwright';

const BASE_URL = (process.env.IACOC_GUI_BASE_URL ?? 'https://iacoc.cyberfuel.com').replace(
  /\/$/,
  '',
);
const RUN_ID = (process.env.IACOC_GUI_RUN_ID ?? `gui32-${Date.now().toString(36)}`).toLowerCase();
const BATCH_12 = process.env.IACOC_GUI_BATCH_12 === '1';
const BATCH_WAVE = process.env.IACOC_GUI_BATCH_WAVE === '1';
const NAME_PREFIX = (process.env.IACOC_GUI_NAME_PREFIX ?? '').trim();
const MAX_CONCURRENCY = Math.max(
  1,
  Math.min(Number(process.env.IACOC_GUI_MAX_CONCURRENCY ?? 6), 6),
);
const CASE_LIMIT = Math.max(1, Number(process.env.IACOC_GUI_CASE_LIMIT ?? 32));
const START_INDEX = Math.max(1, Number(process.env.IACOC_GUI_START_INDEX ?? 1));
const WAIT_TIMEOUT_MS = Number(process.env.IACOC_GUI_WAIT_TIMEOUT_MS ?? 900_000);
const UI_POLL_MS = Number(process.env.IACOC_GUI_POLL_MS ?? 4_000);
const IMAGES = ['ubuntu-2404', 'ubuntu-2604', 'almalinux-9', 'almalinux-10'];
const PLANS = ['kvm-1', 'kvm-2', 'kvm-3', 'kvm-4'];

class GuiError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GuiError';
  }
}

function safeText(value) {
  return String(value ?? '')
    .replace(/root[_-]?password/gi, '<secret>')
    .replace(/private[_-]?key/gi, '<secret>')
    .replace(/bearer|access[_-]?token|credential/gi, '<secret>');
}

function sshPublicKey() {
  const { publicKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { format: 'der', type: 'spki' },
    privateKeyEncoding: { format: 'der', type: 'pkcs8' },
  });
  const raw = publicKey.subarray(-32);
  const type = Buffer.from('ssh-ed25519');
  const wire = Buffer.alloc(4 + type.length + 4 + raw.length);
  wire.writeUInt32BE(type.length, 0);
  type.copy(wire, 4);
  wire.writeUInt32BE(raw.length, 4 + type.length);
  raw.copy(wire, 8 + type.length);
  return `ssh-ed25519 ${wire.toString('base64')} iacoc-${RUN_ID}`;
}

async function waitFor(label, read, ready, page, timeout = WAIT_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const value = await read();
      last = typeof value === 'string' ? value : '';
      if (ready(value)) return value;
    } catch (error) {
      last = safeText(error instanceof Error ? error.message : error);
    }
    await page.waitForTimeout(UI_POLL_MS);
  }
  throw new GuiError(`Timeout esperando ${label}: ${safeText(last).slice(0, 300)}`);
}

async function login(page, username, password) {
  await page.goto(`${BASE_URL}/login`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.waitForURL('**/app/overview', { timeout: 45_000 });
}

async function selectDevSource(page) {
  return selectSource(page, 'dev-iac.cyberfuel.com');
}

async function selectSource(page, endpointText) {
  const source = page.locator('select').nth(0);
  await waitFor(
    `fuente ${endpointText} publicada`,
    () => source.locator('option').filter({ hasText: endpointText }).count(),
    (count) => Number(count) > 0,
    page,
    60_000,
  );
  const option = source.locator('option').filter({ hasText: endpointText }).first();
  const value = await option.getAttribute('value');
  if (!value)
    throw new GuiError(`La fuente ${endpointText} no publicó un identificador seleccionable.`);
  await source.selectOption(value);
  return value;
}

async function selectSourceValue(page, value) {
  const source = page.locator('select').nth(0);
  await waitFor(
    'identificador de fuente disponible',
    () =>
      source
        .locator('option')
        .evaluateAll(
          (options, expected) => options.some((option) => option.value === expected),
          value,
        ),
    Boolean,
    page,
    60_000,
  );
  await source.selectOption(value);
}

function instanceRow(page, name) {
  return page.locator('button.instance-row-button').filter({ hasText: name }).first();
}

function modal(page) {
  return page.getByRole('dialog').last();
}

async function openProvisioning(
  page,
  name,
  plan,
  image,
  mode,
  publicKey,
  onSubmitted = () => {},
  access = {},
) {
  await page.goto(`${BASE_URL}/app/provisioning`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await selectDevSource(page);
  const selects = page.locator('select');
  await waitFor(
    'planes e imágenes publicados',
    async () => ({
      plan: (await selects.nth(1).locator('option[value="kvm-1"]').count()) > 0,
      image: (await selects.nth(2).locator('option[value="ubuntu-2404"]').count()) > 0,
    }),
    (value) => Boolean(value?.plan && value?.image),
    page,
    60_000,
  );
  await selects.nth(1).selectOption(plan);
  await selects.nth(2).selectOption(image);
  await selects.nth(3).selectOption('lab-dhcp');
  await page.getByLabel('Nombre técnico').fill(name);
  if (mode === 'password') {
    await page
      .getByLabel('Contraseña root (opcional)')
      .fill(access.rootPassword ?? `Gui-${RUN_ID}-${randomBytes(12).toString('base64url')}`);
  } else {
    await page.getByLabel('Llaves SSH públicas').fill(access.publicKey ?? publicKey);
  }
  const start = page.getByLabel(/Encender al terminar el aprovisionamiento/);
  if (!(await start.isChecked())) await start.check();
  const submit = page.getByRole('button', { name: 'Solicitar KVM', exact: true });
  await waitFor('formulario habilitado', () => submit.isEnabled(), Boolean, page, 30_000);
  const responsePromise = page.waitForResponse(
    (response) => {
      try {
        return (
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/api/v2/instances'
        );
      } catch {
        return false;
      }
    },
    { timeout: 120_000 },
  );
  await submit.click();
  onSubmitted();
  const response = await responsePromise;
  if (!response.ok())
    throw new GuiError(`Solicitud de aprovisionamiento respondió HTTP ${response.status()}.`);
  await waitFor(
    'aceptación de aprovisionamiento',
    () => page.getByText('Solicitud enviada a IACP', { exact: false }).count(),
    (count) => Number(count) > 0,
    page,
    60_000,
  );
}

async function openInstance(page, name) {
  await page.goto(`${BASE_URL}/app/instances`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await selectDevSource(page);
  // A new instance is `provisioning` before it becomes `ready`; the default
  // ready-only filter would hide it while the operation is still running.
  await page.locator('select').nth(1).selectOption('active');
  const search = page.getByPlaceholder('nombre técnico');
  await search.fill(name);
  await waitFor(
    `inventario de ${name}`,
    () => instanceRow(page, name).count(),
    (count) => Number(count) > 0,
    page,
    240_000,
  );
  await instanceRow(page, name).click();
  await modal(page).waitFor({ state: 'visible', timeout: 30_000 });
  return modal(page);
}

async function waitForOperationSettled(page, name, timeout = 360_000) {
  await page.goto(`${BASE_URL}/app/operations`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await selectDevSource(page);
  const filter = page.getByPlaceholder('filtrar historial');
  await waitFor(
    `filtro de operaciones para ${name}`,
    () => filter.count(),
    (count) => Number(count) > 0,
    page,
    60_000,
  );
  await filter.fill(name);
  return waitFor(
    `operación estable de ${name}`,
    async () => {
      const cards = page.locator('.remote-record-card').filter({ hasText: name });
      const count = await cards.count();
      const statuses = count > 0 ? await cards.locator('.state-chip').allInnerTexts() : [];
      return { count, statuses };
    },
    (value) =>
      Number(value?.count) > 0 &&
      value.statuses.every(
        (status) =>
          !/^(?:Pendiente|Ejecutando|En cola|Aprovisionando|Eliminando)$/iu.test(status.trim()),
      ),
    page,
    timeout,
  );
}

async function instanceIdentifier(detail) {
  return (
    await detail
      .locator('.detail-fact')
      .filter({ hasText: 'Identificador' })
      .locator('strong')
      .innerText()
  ).trim();
}

async function modalText(detail) {
  return (await detail.innerText()).replace(/\s+/g, ' ').trim();
}

async function button(detail, name) {
  const locator = detail.getByRole('button', { name, exact: true });
  if ((await locator.count()) === 0) return null;
  return locator;
}

async function waitEnabledButton(page, detail, name, timeout = 60_000) {
  return waitFor(
    `control de acción ${name}`,
    async () => {
      const locator = await button(detail, name);
      return locator && (await locator.isEnabled()) ? locator : null;
    },
    (locator) => Boolean(locator),
    page,
    timeout,
  );
}

async function waitPower(page, detail, expected) {
  await waitFor(
    `energía ${expected}`,
    () => modalText(detail),
    (text) => text.includes(`ENERGÍA ${expected === 'running' ? 'Encendida' : 'Apagada'}`),
    page,
    360_000,
  );
}

async function clickPower(page, detail, action, expected) {
  const control = await waitEnabledButton(page, detail, action);
  await control.click();
  await waitPower(page, detail, expected);
  await waitPowerControl(page, detail);
}

async function waitPowerControl(page, detail, timeout = 360_000) {
  return waitFor(
    'control de energía publicado',
    async () => {
      const off = await button(detail, 'Apagar');
      if (off && (await off.isEnabled())) return 'running';
      const on = await button(detail, 'Encender');
      if (on && (await on.isEnabled())) return 'stopped';
      return null;
    },
    (value) => value === 'running' || value === 'stopped',
    page,
    timeout,
  );
}

async function queryInventoryByName(page, name) {
  const search = page.getByPlaceholder('nombre técnico');
  const responsePromise = page
    .waitForResponse(
      (response) => {
        try {
          const url = new URL(response.url());
          return (
            response.request().method() === 'GET' &&
            url.pathname === '/api/v2/instances' &&
            url.searchParams.get('name') === name
          );
        } catch {
          return false;
        }
      },
      { timeout: 60_000 },
    )
    .catch(() => null);
  await search.fill(name);
  const response = await responsePromise;
  if (!response) return null;
  const body = await response.json().catch(() => null);
  return body && typeof body === 'object' && Array.isArray(body.items) ? body.items : null;
}

async function inspectNetwork(page, detail) {
  const control = await button(detail, 'Consultar red');
  if (!control || !(await control.isEnabled()))
    return { attempted: false, published: false, addresses: [] };
  const responsePromise = page
    .waitForResponse(
      (response) => {
        try {
          return (
            response.request().method() === 'GET' &&
            /\/api\/v2\/instances\/[^/]+\/network$/u.test(new URL(response.url()).pathname)
          );
        } catch {
          return false;
        }
      },
      { timeout: 120_000 },
    )
    .catch(() => null);
  await control.click();
  const result = await waitFor(
    'observación de red publicada',
    async () => {
      const text = await modalText(detail);
      const addresses = [...new Set(text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/gu) ?? [])];
      const unavailable =
        text.includes('Not Found') || text.includes('no publicó el detalle de red');
      return { text, addresses, unavailable };
    },
    (value) => value.addresses.length > 0 || value.unavailable,
    page,
    120_000,
  );
  const response = await responsePromise;
  if (!response) throw new GuiError('IaCoC no publicó la respuesta de consulta de red.');
  if (!response.ok()) throw new GuiError(`Consulta de red respondió HTTP ${response.status()}.`);
  const body = await response.json().catch(() => null);
  const item =
    body && typeof body === 'object' && body.item && typeof body.item === 'object'
      ? body.item
      : null;
  if (!item) throw new GuiError('La respuesta de red de IaCoC no publicó item.');
  const observation =
    item.network_observation && typeof item.network_observation === 'object'
      ? item.network_observation
      : {};
  const observed = Array.isArray(item.observed_ipv4)
    ? item.observed_ipv4
    : Array.isArray(observation.observed_ipv4)
      ? observation.observed_ipv4
      : Array.isArray(item.ip_addresses)
        ? item.ip_addresses
        : [];
  const addresses = [
    ...new Set(
      observed.filter(
        (value) => typeof value === 'string' && /^(?:\d{1,3}\.){3}\d{1,3}$/u.test(value),
      ),
    ),
  ];
  return {
    attempted: true,
    published: addresses.length > 0,
    unavailable: result.unavailable,
    status: item?.status ?? null,
    reason: item?.reason ?? null,
    addresses,
  };
}

async function waitActiveInventoryGone(page, name, timeout = 360_000, sourceValue = null) {
  const deadline = Date.now() + timeout;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const search = page.getByPlaceholder('nombre técnico');
      if ((await search.count()) === 0) {
        await page.goto(`${BASE_URL}/app/instances`, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        if (sourceValue) await selectSourceValue(page, sourceValue);
        else await selectDevSource(page);
      }
      const items = await queryInventoryByName(page, name);
      const activeItems =
        items?.filter(
          (item) => String(item.status ?? item.normalized_status ?? '').toLowerCase() !== 'deleted',
        ) ?? null;
      if (activeItems && activeItems.length === 0) return;
      last = items
        ? 'la respuesta todavía contiene la instancia activa'
        : 'sin respuesta de inventario';
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
      if (sourceValue) await selectSourceValue(page, sourceValue);
      else await selectDevSource(page);
    } catch (error) {
      last = safeText(error instanceof Error ? error.message : error);
    }
    await page.waitForTimeout(UI_POLL_MS);
  }
  throw new GuiError(`Timeout esperando desaparición del inventario activo: ${last}`);
}

async function deleteThroughGui(page, detail, name) {
  const destroy = await waitEnabledButton(page, detail, 'Eliminar instancia');
  await destroy.click();
  // Older deployed builds do not render a toast for this mutation. The
  // authoritative GUI evidence is that the active inventory row disappears
  // after the modal is closed, so do not make the toast a test prerequisite.
  await page.waitForTimeout(2_000);
  const close = page.getByRole('button', { name: 'Cerrar detalle', exact: true });
  if (await close.count()) await close.click();
  await waitActiveInventoryGone(page, name);
}

async function closeDetail(page) {
  const close = page.getByRole('button', { name: 'Cerrar detalle', exact: true });
  if (await close.count()) await close.click().catch(() => undefined);
}

async function confirmStoppedVisible(page, name, expected = {}) {
  await page.goto(`${BASE_URL}/app/instances`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await selectDevSource(page);
  const status = page.locator('select').nth(1);
  await status.selectOption('stopped');
  const items = await queryInventoryByName(page, name);
  const matchingItems = items?.filter((item) => String(item.name ?? '') === name) ?? [];
  if (matchingItems.length !== 1) throw new GuiError(`${name} no aparece en Apagada / lista.`);
  const item = matchingItems[0];
  if (String(item.status ?? item.normalized_status ?? '').toLowerCase() === 'deleted')
    throw new GuiError(`${name} está eliminada y no debe aparecer como apagada.`);
  if (String(item.power_state ?? '').toLowerCase() !== 'stopped')
    throw new GuiError(`${name} no publica energía apagada en el inventario.`);
  if (expected.instanceId && String(item.instance_id ?? '') !== expected.instanceId)
    throw new GuiError(`${name} publica un identificador distinto en Apagada / lista.`);
  if (expected.vmid && Number(item.vmid) !== expected.vmid)
    throw new GuiError(`${name} publica un VMID distinto en Apagada / lista.`);
  const row = instanceRow(page, name);
  await waitFor(
    `fila apagada visible ${name}`,
    () => row.count(),
    (count) => Number(count) > 0,
    page,
    30_000,
  );
  return row;
}

async function cleanup(page, name, expected = {}) {
  try {
    await closeDetail(page);
    await page.goto(`${BASE_URL}/app/instances`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await selectDevSource(page);
    const source = page.locator('select').nth(0);
    const sourceValue = await source.inputValue();
    const status = page.locator('select').nth(1);
    if (await status.locator('option[value="all"]').count()) await status.selectOption('all');
    const items = await queryInventoryByName(page, name);
    if (!items || items.length === 0) return 'sin-instancia-visible';
    const matchingItems = items.filter((item) => String(item.name ?? '') === name);
    if (matchingItems.length !== 1) return 'cleanup-refused-ambiguous-inventory';
    const inventoryItem = matchingItems[0];
    const inventoryVmid = Number(inventoryItem.vmid);
    const hasVmid = Number.isInteger(inventoryVmid) && inventoryVmid > 0;
    if (expected.instanceId && String(inventoryItem.instance_id ?? '') !== expected.instanceId)
      return 'cleanup-refused-instance-id-mismatch';
    if (expected.vmid && Number(inventoryItem.vmid) !== expected.vmid)
      return 'cleanup-refused-vmid-mismatch';
    if (
      String(inventoryItem.status ?? inventoryItem.normalized_status ?? '').toLowerCase() ===
      'deleted'
    )
      return 'cleanup-confirmado-eliminada';
    const row = instanceRow(page, name);
    await waitFor(
      `fila de cleanup ${name}`,
      () => row.count(),
      (count) => Number(count) > 0,
      page,
      60_000,
    );
    await row.click();
    let detail = modal(page);
    await detail.waitFor({ state: 'visible', timeout: 15_000 });
    if (expected.vmid) {
      const detailVmid = Number(/VMID\s+(\d+)/i.exec(await modalText(detail))?.[1]);
      if (detailVmid !== expected.vmid) return 'cleanup-refused-detail-vmid-mismatch';
    }
    const inventoryStatus = String(
      inventoryItem.normalized_status ?? inventoryItem.status ?? '',
    ).toLowerCase();
    const inventoryPower = String(inventoryItem.power_state ?? '').toLowerCase();
    const unallocatedFailure =
      inventoryStatus === 'failed' &&
      !(Number.isInteger(Number(inventoryItem.vmid)) && Number(inventoryItem.vmid) > 0);
    const powerControl =
      inventoryPower === 'stopped' || unallocatedFailure
        ? inventoryPower || null
        : await waitPowerControl(page, detail, 15_000).catch(() => null);
    if (powerControl === 'running') {
      const off = await waitEnabledButton(page, detail, 'Apagar');
      await off.click();
      await waitPower(page, detail, 'stopped');
      await waitForOperationSettled(page, name);
    }
    if (hasVmid && (powerControl === 'stopped' || powerControl === 'running')) {
      const stoppedRow = await confirmStoppedVisible(page, name, expected);
      await stoppedRow.click();
      detail = modal(page);
      await detail.waitFor({ state: 'visible', timeout: 15_000 });
    }
    const destroy = await waitEnabledButton(page, detail, 'Eliminar instancia', 30_000).catch(
      () => null,
    );
    if (!destroy) return `cleanup-sin-control:${powerControl ?? 'energía-no-publicada'}`;
    const deleteResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        /\/api\/v2\/instances\/[^/]+$/u.test(new URL(response.url()).pathname),
      { timeout: 120_000 },
    );
    await destroy.click();
    const response = await deleteResponse;
    if (!response.ok()) {
      const body = await response.json().catch(() => null);
      const reason =
        body && typeof body === 'object'
          ? ['error_code', 'code', 'message', 'detail', 'reason']
              .map((key) => (key in body ? String(body[key] ?? '') : ''))
              .filter(Boolean)
              .join(' ')
          : '';
      throw new GuiError(
        `DELETE respondió HTTP ${response.status()} ${safeText(reason).slice(0, 220)}`,
      );
    }
    const close = page.getByRole('button', { name: 'Cerrar detalle', exact: true });
    if (await close.count()) await close.click();
    await waitActiveInventoryGone(page, name, 360_000, sourceValue);
    return 'cleanup-completado';
  } catch (error) {
    return `cleanup-falló:${safeText(error instanceof Error ? error.message : error).slice(0, 180)}`;
  }
}

async function readOverviewInstanceCount(page, refresh = false, expectedConnectionId = null) {
  await page.goto(`${BASE_URL}/app/overview`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  const card = page.locator('.metric-card').filter({ hasText: 'Instancias activas / listas' });
  await card.waitFor({ state: 'visible', timeout: 60_000 });
  if (refresh) {
    const request = page.waitForResponse(
      (response) => {
        try {
          const url = new URL(response.url());
          return (
            response.request().method() === 'GET' &&
            url.pathname === '/api/v2/instances' &&
            (!expectedConnectionId || url.searchParams.get('connectionId') === expectedConnectionId)
          );
        } catch {
          return false;
        }
      },
      { timeout: 60_000 },
    );
    await page.getByRole('button', { name: 'Actualizar datos de esta vista' }).click();
    const response = await request;
    if (!response.ok()) throw new GuiError(`Overview refrescó con HTTP ${response.status()}.`);
  }
  const value = await waitFor(
    'contador numérico de instancias en Overview',
    () =>
      card
        .locator('strong')
        .innerText()
        .catch(() => ''),
    (text) => /^\d+$/u.test(text.trim()),
    page,
    60_000,
  );
  return Number(value.trim());
}

function inventoryAddresses(item) {
  const network = item?.network && typeof item.network === 'object' ? item.network : {};
  const observation =
    network.network_observation && typeof network.network_observation === 'object'
      ? network.network_observation
      : item?.network_observation && typeof item.network_observation === 'object'
        ? item.network_observation
        : {};
  const observed =
    network.observed_ipv4 ?? item?.observed_ipv4 ?? observation.observed_ipv4 ?? null;
  if (Array.isArray(observed))
    return [
      ...new Set(
        observed.filter(
          (value) => typeof value === 'string' && /^(?:\d{1,3}\.){3}\d{1,3}$/u.test(value),
        ),
      ),
    ];
  const values = [
    network.ip_addresses,
    network.current_ip_addresses,
    network.ips,
    network.ip,
    network.addresses,
    network.address,
    item?.ip_addresses,
    item?.ip_address,
    item?.ip,
  ];
  const addresses = new Set();
  const visit = (value) => {
    if (typeof value === 'string') {
      for (const match of value.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/gu) ?? []) addresses.add(match);
    } else if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
    } else if (value && typeof value === 'object') {
      for (const key of ['ip', 'address', 'ip_address', 'ipv4', 'value']) visit(value[key]);
    }
  };
  for (const value of values) visit(value);
  return [...addresses];
}

function machineSnapshot(items) {
  const machines = new Map();
  for (const item of items) {
    const instanceId = String(item.instance_id ?? item.id ?? '');
    const vmid = Number(item.vmid);
    if (!instanceId || !Number.isInteger(vmid) || vmid <= 0) continue;
    machines.set(instanceId, {
      name: String(item.name ?? instanceId),
      vmid,
      status: String(item.status ?? item.normalized_status ?? ''),
      powerState: String(item.power_state ?? ''),
      addresses: inventoryAddresses(item).sort(),
    });
  }
  return machines;
}

function changedMachines(baseline, currentItems) {
  const current = machineSnapshot(currentItems);
  const changes = [];
  for (const [instanceId, previous] of baseline) {
    const latest = current.get(instanceId);
    if (!latest || JSON.stringify(latest) !== JSON.stringify(previous)) {
      changes.push({
        instanceId,
        previous,
        current: latest ?? null,
      });
    }
  }
  return changes;
}

async function readActiveInventory(page, connectionId) {
  await page.goto(`${BASE_URL}/app/instances`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await selectSourceValue(page, connectionId);
  await page.locator('select').nth(1).selectOption('active');
  const responsePromise = page.waitForResponse(
    (response) => {
      try {
        const url = new URL(response.url());
        return (
          response.request().method() === 'GET' &&
          url.pathname === '/api/v2/instances' &&
          url.searchParams.get('connectionId') === connectionId &&
          !url.searchParams.has('name')
        );
      } catch {
        return false;
      }
    },
    { timeout: 60_000 },
  );
  await page.getByRole('button', { name: 'Actualizar datos de esta vista' }).click();
  const response = await responsePromise;
  if (!response.ok()) throw new GuiError(`Inventario activo respondió HTTP ${response.status()}.`);
  const body = await response.json().catch(() => null);
  if (!body || !Array.isArray(body.items))
    throw new GuiError('El inventario activo no publicó la colección esperada desde IaCoC.');
  return body.items.filter(
    (item) => String(item.status ?? item.normalized_status ?? '').toLowerCase() !== 'deleted',
  );
}

async function assertNamesUnused(page, names) {
  await page.goto(`${BASE_URL}/app/instances`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await selectDevSource(page);
  const status = page.locator('select').nth(1);
  await status.selectOption('all');
  for (const name of names) {
    const items = await queryInventoryByName(page, name);
    if (!items) throw new GuiError(`No se pudo verificar si el nombre ${name} está libre.`);
    if (items.some((item) => String(item.name ?? '') === name))
      throw new GuiError(`El nombre de prueba ${name} ya existe en dev-iac; no se modificó.`);
  }
}

async function readNameHistory(page, name) {
  await page.goto(`${BASE_URL}/app/instances`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await selectDevSource(page);
  await page.locator('select').nth(1).selectOption('all');
  const items = await queryInventoryByName(page, name);
  if (!items) throw new GuiError(`No se pudo consultar el historial de ${name}.`);
  return items.filter((item) => String(item.name ?? '') === name);
}

async function assertPageRefresh(page, route, heading, apiPath, connectionId) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByRole('heading', { name: heading, exact: true }).waitFor({
    state: 'visible',
    timeout: 45_000,
  });
  if (route !== '/app/overview') await selectDevSource(page);
  const expectedId = connectionId ?? (await page.locator('select').nth(0).inputValue());
  const request = page.waitForResponse(
    (response) => {
      try {
        const url = new URL(response.url());
        return (
          response.request().method() === 'GET' &&
          url.pathname === apiPath &&
          (!expectedId || url.searchParams.get('connectionId') === expectedId)
        );
      } catch {
        return false;
      }
    },
    { timeout: 60_000 },
  );
  await page.getByRole('button', { name: 'Actualizar datos de esta vista' }).click();
  const response = await request;
  if (!response.ok()) throw new GuiError(`${route} refrescó con HTTP ${response.status()}.`);
}

async function confirmDeleted(page, name) {
  await page.goto(`${BASE_URL}/app/instances`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await selectDevSource(page);
  await page.locator('select').nth(1).selectOption('deleted');
  const items = await queryInventoryByName(page, name);
  if (!items || !items.some((item) => String(item.status ?? item.normalized_status) === 'deleted'))
    throw new GuiError(`IACP no confirmó ${name} como eliminada en el historial.`);
}

async function runFullLifecycle(page, name) {
  let detail = await openInstance(page, name);
  let powerState = await waitPowerControl(page, detail);
  if (powerState === 'stopped') {
    await clickPower(page, detail, 'Encender', 'running');
    await waitForOperationSettled(page, name);
    detail = await openInstance(page, name);
  }
  await clickPower(page, detail, 'Reiniciar', 'running');
  await waitForOperationSettled(page, name);
  detail = await openInstance(page, name);
  await clickPower(page, detail, 'Apagar', 'stopped');
  await waitForOperationSettled(page, name);
  detail = await openInstance(page, name);
  await waitPower(page, detail, 'stopped');
  await clickPower(page, detail, 'Encender', 'running');
  await waitForOperationSettled(page, name);
  detail = await openInstance(page, name);
  await clickPower(page, detail, 'Apagar', 'stopped');
  await waitForOperationSettled(page, name);
  detail = await openInstance(page, name);
  await waitPower(page, detail, 'stopped');
  await deleteThroughGui(page, detail, name);
  await confirmDeleted(page, name);
}

async function verifyIncidentView(page, connectionId) {
  await page.goto(`${BASE_URL}/app/incidents`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await selectDevSource(page);
  await page.getByRole('button', { name: /Más recientes|Más antiguas/ }).click();
  const period = page.getByLabel('Periodo de incidentes');
  await period.selectOption('all');
  const rows = page.locator('.incident-row-button');
  if ((await rows.count()) > 0) {
    await rows.first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 30_000 });
    await dialog.getByText('ANÁLISIS Y RECUPERACIÓN', { exact: true }).waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    await closeDetail(page);
  }
  const id = connectionId ?? (await page.locator('select').nth(0).inputValue());
  await assertPageRefresh(page, '/app/incidents', 'Incidents & Recovery', '/api/v2/incidents', id);
}

async function verifyEventTraces(page, names) {
  await page.goto(`${BASE_URL}/app/events`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await selectDevSource(page);
  const filter = page.getByPlaceholder('filtrar historial');
  await waitFor(
    'filtro de eventos',
    () => filter.count(),
    (count) => Number(count) > 0,
    page,
  );
  const cards = page.locator('.remote-record-card');
  for (const name of names) {
    await filter.fill(name);
    await waitFor(
      `evento correlacionado para ${name}`,
      () => cards.count(),
      (count) => Number(count) > 0,
      page,
      60_000,
    );
    const card = cards.first();
    const cardText = await card.innerText();
    if (!cardText.includes(name))
      throw new GuiError(`El evento de ${name} no conserva el nombre de instancia publicado.`);
    await card.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 30_000 });
    await dialog.getByText('VMID', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    await dialog
      .getByText('Solicitado por', { exact: true })
      .waitFor({ state: 'visible', timeout: 30_000 });
    const vmid = await dialog.locator('.detail-fact').filter({ hasText: 'VMID' }).innerText();
    const actor = await dialog
      .locator('.detail-fact')
      .filter({ hasText: 'Solicitado por' })
      .innerText();
    console.log(
      `BATCH12 EVENT_TRACE name=${name} vmid=${safeText(vmid.split('\n').slice(1).join(' '))} requester=${safeText(actor.split('\n').slice(1).join(' '))}`,
    );
    await closeDetail(page);
  }
}

async function runBatch12(browser, credentials) {
  if (!/^prueba-iacoc-[a-z0-9]+$/u.test(NAME_PREFIX))
    throw new GuiError('IACOC_GUI_BATCH_12 requiere IACOC_GUI_NAME_PREFIX=prueba-iacoc-<sufijo>.');
  const names = Array.from(
    { length: 12 },
    (_, index) => `${NAME_PREFIX}-${String(index + 1).padStart(2, '0')}`,
  );
  const cases = names.map((name, index) => ({
    image: 'ubuntu-2404',
    plan: 'kvm-1',
    mode: index % 2 === 0 ? 'password' : 'key',
    index: index + 1,
    name,
  }));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('dialog', async (dialog) => dialog.accept());
  const results = [];
  let devConnectionId = null;
  let baselineCount = null;
  let failed = false;
  const attemptedNames = new Set();
  const cleanupCandidates = new Map();
  try {
    await login(page, credentials.username, credentials.password);
    await assertNamesUnused(page, names);
    await page.goto(`${BASE_URL}/app/instances`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    devConnectionId = await selectDevSource(page);
    const baselineItems = await readActiveInventory(page, devConnectionId);
    const baselineMachines = machineSnapshot(baselineItems);
    const knownVmids = new Map();
    for (const machine of baselineMachines.values()) {
      const owners = knownVmids.get(machine.vmid) ?? [];
      owners.push(machine.name);
      knownVmids.set(machine.vmid, owners);
      if (owners.length > 1)
        throw new GuiError(
          `VMID ${machine.vmid} ya está asociado a varias instancias del inventario.`,
        );
    }
    const ipOwners = new Map();
    for (const item of baselineItems) {
      const owner = String(item.name ?? item.instance_id ?? item.vmid ?? 'instancia-sin-id');
      for (const address of inventoryAddresses(item)) {
        const owners = ipOwners.get(address) ?? [];
        if (!owners.includes(owner)) owners.push(owner);
        ipOwners.set(address, owners);
      }
    }
    const baselineDuplicates = [...ipOwners.entries()].filter(([, owners]) => owners.length > 1);
    for (const [address, owners] of baselineDuplicates)
      console.error(
        `BATCH12 BASELINE_IP_DUPLICATE address=${address} instances=${owners.join('|')}`,
      );
    if (baselineDuplicates.length > 0)
      throw new GuiError(
        'El inventario activo de dev ya contiene IP duplicadas; no se crearon KVM.',
      );
    baselineCount = await readOverviewInstanceCount(page, true, devConnectionId);
    console.log(
      `BATCH12 PREFLIGHT source=dev baseline_active=${baselineCount} baseline_inventory=${baselineItems.length} baseline_ips=${ipOwners.size} names=12`,
    );

    for (const item of cases) {
      console.log(`BATCH12 START name=${item.name} mode=${item.mode}`);
      const result = await runCase(browser, credentials, item, (name) => attemptedNames.add(name));
      results.push(result);
      let vmidCollision = false;
      if (result.instanceId && Number.isInteger(result.vmid) && result.vmid > 0) {
        const owners = knownVmids.get(result.vmid) ?? [];
        if (owners.length > 0) {
          vmidCollision = true;
          failed = true;
          console.error(
            `BATCH12 VMID_COLLISION name=${result.name} vmid=${result.vmid} existing=${owners.join('|')}`,
          );
        } else {
          knownVmids.set(result.vmid, [result.name]);
          cleanupCandidates.set(result.name, {
            instanceId: result.instanceId,
            vmid: result.vmid,
          });
        }
      }
      const currentItems = await readActiveInventory(page, devConnectionId);
      const changed = changedMachines(baselineMachines, currentItems);
      if (changed.length > 0) {
        failed = true;
        for (const change of changed)
          console.error(
            `BATCH12 EXISTING_INSTANCE_CHANGED name=${change.previous.name} vmid=${change.previous.vmid} before=${change.previous.status}/${change.previous.powerState}/${change.previous.addresses.join(',')} after=${change.current ? `${change.current.status}/${change.current.powerState}/${change.current.addresses.join(',')}` : 'missing'}`,
          );
      }
      if (!result.ok) {
        failed = true;
        break;
      }
      if (vmidCollision || changed.length > 0) break;
      const duplicates = [];
      for (const address of result.network.addresses) {
        const owners = ipOwners.get(address) ?? [];
        if (owners.length > 0 && !owners.includes(result.name))
          duplicates.push({ address, owners: [...owners, result.name] });
      }
      if (duplicates.length > 0) {
        failed = true;
        for (const duplicate of duplicates)
          console.error(
            `BATCH12 IP_DUPLICATE address=${duplicate.address} instances=${duplicate.owners.join('|')}`,
          );
        break;
      }
      for (const address of result.network.addresses) {
        const owners = ipOwners.get(address) ?? [];
        if (!owners.includes(result.name)) owners.push(result.name);
        ipOwners.set(address, owners);
      }
      console.log(
        `BATCH12 IP_UNIQUE name=${result.name} addresses=${result.network.addresses.join(',')}`,
      );
    }

    if (!failed && results.length === 12) {
      console.log(`BATCH12 IP_AUDIT addresses=${ipOwners.size} duplicates=0`);

      const observedCount = await readOverviewInstanceCount(page, true, devConnectionId);
      if (observedCount !== baselineCount + 12) {
        failed = true;
        console.error(
          `BATCH12 OVERVIEW_MISMATCH expected=${baselineCount + 12} observed=${observedCount}`,
        );
      } else {
        console.log(`BATCH12 OVERVIEW_PASS active=${observedCount}`);
      }

      await verifyEventTraces(page, names);
      await assertPageRefresh(
        page,
        '/app/instances',
        'Instances',
        '/api/v2/instances',
        devConnectionId,
      );
      await assertPageRefresh(
        page,
        '/app/operations',
        'Operations',
        '/api/v2/operations',
        devConnectionId,
      );
      await assertPageRefresh(page, '/app/events', 'Events', '/api/v2/events', devConnectionId);
      await verifyIncidentView(page, devConnectionId);
      console.log('BATCH12 MODULES_PASS overview instances operations events incidents');
    }

    if (!failed && results.length === 12) {
      for (const result of results) {
        try {
          console.log(`BATCH12 LIFECYCLE_START name=${result.name}`);
          await runFullLifecycle(page, result.name);
          console.log(`BATCH12 LIFECYCLE_PASS name=${result.name}`);
          const currentItems = await readActiveInventory(page, devConnectionId);
          const changed = changedMachines(baselineMachines, currentItems);
          if (changed.length > 0) {
            failed = true;
            for (const change of changed)
              console.error(
                `BATCH12 EXISTING_INSTANCE_CHANGED name=${change.previous.name} vmid=${change.previous.vmid} before=${change.previous.status}/${change.previous.powerState}/${change.previous.addresses.join(',')} after=${change.current ? `${change.current.status}/${change.current.powerState}/${change.current.addresses.join(',')}` : 'missing'}`,
              );
            break;
          }
        } catch (error) {
          failed = true;
          console.error(
            `BATCH12 LIFECYCLE_FAIL name=${result.name} error=${safeText(error instanceof Error ? error.message : error)}`,
          );
        }
      }
    }
  } catch (error) {
    failed = true;
    console.error(
      `BATCH12 ABORT error=${safeText(error instanceof Error ? error.message : error)}`,
    );
  }

  let cleanupFailures = 0;
  let cleanupDeferred = 0;
  for (const name of names) {
    if (!attemptedNames.has(name)) {
      console.log(`BATCH12 CLEAN name=${name} result=not-submitted`);
      continue;
    }
    const expected = cleanupCandidates.get(name);
    if (!expected) {
      cleanupDeferred += 1;
      failed = true;
      console.error(
        `BATCH12 CLEAN_DEFERRED name=${name} reason=VMID-or-instance-identity-not-verified`,
      );
      continue;
    }
    let outcome = 'sin-instancia-visible';
    let absentHistoryChecks = 0;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      outcome = await cleanup(page, name, expected);
      if (outcome === 'cleanup-completado') break;
      if (outcome.startsWith('cleanup-refused')) break;
      if (outcome === 'sin-instancia-visible') {
        try {
          const history = await readNameHistory(page, name);
          if (history.some((item) => String(item.status ?? item.normalized_status) === 'deleted')) {
            outcome = 'cleanup-confirmado-eliminada';
            break;
          }
          if (history.length === 0) {
            absentHistoryChecks += 1;
            if (absentHistoryChecks >= 3) break;
          }
        } catch (error) {
          outcome = `cleanup-history-error:${safeText(error instanceof Error ? error.message : error)}`;
        }
      }
      await page.waitForTimeout(Math.max(UI_POLL_MS, 10_000));
    }
    if (outcome === 'cleanup-completado') {
      try {
        await confirmDeleted(page, name);
      } catch (error) {
        outcome = `cleanup-no-confirmado:${safeText(error instanceof Error ? error.message : error)}`;
      }
    }
    if (
      (outcome !== 'cleanup-completado' && outcome !== 'cleanup-confirmado-eliminada') ||
      outcome.startsWith('cleanup-falló') ||
      outcome.startsWith('cleanup-sin-control') ||
      outcome.startsWith('cleanup-refused') ||
      outcome.startsWith('cleanup-history-error') ||
      outcome.startsWith('cleanup-no-confirmado')
    ) {
      cleanupFailures += 1;
      failed = true;
    }
    console.log(`BATCH12 CLEAN name=${name} result=${outcome}`);
  }

  if (baselineCount !== null && devConnectionId) {
    try {
      const finalCount = await readOverviewInstanceCount(page, true, devConnectionId);
      console.log(`BATCH12 OVERVIEW_FINAL baseline=${baselineCount} observed=${finalCount}`);
      if (finalCount !== baselineCount) failed = true;
    } catch (error) {
      failed = true;
      console.error(
        `BATCH12 OVERVIEW_FINAL_FAIL error=${safeText(error instanceof Error ? error.message : error)}`,
      );
    }
  }

  const passedProvisioning = results.filter((result) => result.ok).length;
  console.log(
    `BATCH12 SUMMARY provisioned=${passedProvisioning}/12 cleanup_failures=${cleanupFailures} cleanup_deferred=${cleanupDeferred} status=${failed ? 'FAIL' : 'PASS'}`,
  );
  await context.close();
  if (failed || passedProvisioning !== 12 || cleanupFailures > 0 || cleanupDeferred > 0)
    process.exitCode = 1;
}

async function runCase(browser, credentials, item, onProvisionSubmitted = () => {}) {
  const { image, plan, mode, index } = item;
  const name = NAME_PREFIX
    ? `${NAME_PREFIX}-${String(index).padStart(2, '0')}`
    : `oc-gui-${RUN_ID}-${String(index).padStart(2, '0')}-${image.replaceAll('-', '')}-${plan.replaceAll('-', '')}-${mode}`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  if (process.env.IACOC_GUI_TRACE_POWER === '1') {
    page.on('response', async (response) => {
      const method = response.request().method();
      const pathname = new URL(response.url()).pathname;
      if (
        !response.url().includes('/api/v2/instances/') ||
        !pathname.includes('/power') ||
        (method !== 'GET' && method !== 'POST')
      )
        return;
      const body = await response.text().catch(() => '');
      console.log(
        `POWER_TRACE method=${method} path=${pathname} status=${response.status()} body=${safeText(body).slice(0, 500)}`,
      );
    });
  }
  page.on('dialog', async (dialog) => {
    console.log(`DIALOG name=${name} type=${dialog.type()}`);
    await dialog.accept();
  });
  const startedAt = Date.now();
  let detail = null;
  let trackedInstanceId = '';
  let trackedVmid = null;
  let provisionAccepted = false;
  try {
    console.log(`START index=${index} image=${image} plan=${plan} mode=${mode}`);
    await login(page, credentials.username, credentials.password);
    await openProvisioning(
      page,
      name,
      plan,
      image,
      mode,
      credentials.publicKey,
      () => {
        provisionAccepted = true;
        onProvisionSubmitted(name);
      },
      {
        rootPassword: credentials.rootPassword,
        publicKey: credentials.publicKey,
      },
    );
    detail = await openInstance(page, name);
    trackedInstanceId = await instanceIdentifier(detail);
    await waitForOperationSettled(page, name);
    detail = await openInstance(page, name);
    await waitFor(
      `detalle operativo ${name}`,
      () => modalText(detail),
      (text) =>
        /VCPU\s+\d+/i.test(text) && /(Apagar|Encender)/.test(text) && !text.includes('Fallida'),
      page,
      360_000,
    );
    const firstDetail = await modalText(detail);
    trackedVmid = Number(/VMID\s+(\d+)/i.exec(firstDetail)?.[1]) || null;
    if (!firstDetail.includes(`PLAN ${plan}`))
      throw new GuiError(`Plan no visible en detalle: ${plan}`);
    if (!/VCPU\s+(?!No publicado)\d+/i.test(firstDetail))
      throw new GuiError('vCPU no publicado por el detalle GUI.');
    if (!/MEMORIA\s+(?!No publicado)\d+/i.test(firstDetail))
      throw new GuiError('Memoria no publicada por el detalle GUI.');
    if (!/DISCO\s+(?!No publicado)\d+/i.test(firstDetail))
      throw new GuiError('Disco no publicado por el detalle GUI.');
    if (!/VMID\s+\d+/i.test(firstDetail))
      throw new GuiError('VMID no publicado por el detalle GUI.');
    const network = await inspectNetwork(page, detail);
    if (network.status === 'conflict' || network.reason === 'DHCP_ADDRESS_CONFLICT')
      throw new GuiError(`La API reportó conflicto DHCP: ${network.reason ?? network.status}.`);
    if ((BATCH_12 || BATCH_WAVE) && !network.published)
      throw new GuiError('La IP no fue publicada por IACP en el detalle GUI.');
    if (BATCH_12 || BATCH_WAVE) {
      console.log(
        `PASS index=${index} stage=provision-observe image=${image} plan=${plan} mode=${mode} ip_count=${network.addresses.length}`,
      );
      return {
        ok: true,
        name,
        network,
        instanceId: trackedInstanceId,
        vmid: trackedVmid,
        plan,
        image,
        mode,
      };
    }
    if (process.env.IACOC_GUI_RECONCILE === '1') {
      const reconcile = await waitEnabledButton(page, detail, 'Sincronizar');
      await reconcile.click();
      await waitForOperationSettled(page, name);
      detail = await openInstance(page, name);
    }
    const initialPower = await waitPowerControl(page, detail);
    if (initialPower === 'stopped') {
      await clickPower(page, detail, 'Encender', 'running');
      await waitForOperationSettled(page, name);
      detail = await openInstance(page, name);
    }
    await clickPower(page, detail, 'Reiniciar', 'running');
    await waitForOperationSettled(page, name);
    detail = await openInstance(page, name);
    await clickPower(page, detail, 'Apagar', 'stopped');
    await waitForOperationSettled(page, name);
    detail = await openInstance(page, name);
    await waitPower(page, detail, 'stopped');
    await deleteThroughGui(page, detail, name);
    console.log(
      `PASS index=${index} image=${image} plan=${plan} mode=${mode} ip=${network.published ? 'published' : network.unavailable ? 'not-published' : 'not-observed'} duration_s=${((Date.now() - startedAt) / 1000).toFixed(1)}`,
    );
    return {
      ok: true,
      name,
      network,
      instanceId: trackedInstanceId,
      vmid: trackedVmid,
      plan,
      image,
      mode,
      provisionAccepted,
    };
  } catch (error) {
    const cleaned = provisionAccepted
      ? BATCH_12 || BATCH_WAVE
        ? 'cleanup-deferred-until-identity-check'
        : await cleanup(page, name)
      : 'not-submitted';
    console.error(
      `FAIL index=${index} image=${image} plan=${plan} mode=${mode} cleanup=${cleaned} error=${safeText(error instanceof Error ? error.message : error)}`,
    );
    return {
      ok: false,
      name,
      error: safeText(error instanceof Error ? error.message : error),
      provisionAccepted,
      instanceId: trackedInstanceId,
      vmid: trackedVmid,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function readCredentials() {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  const username = await iterator.next();
  const password = await iterator.next();
  lines.close();
  if (username.done || password.done || !username.value.trim() || !password.value)
    throw new GuiError('stdin requiere usuario y contraseña.');
  const rootPasswordFile = process.env.IACOC_GUI_ROOT_PASSWORD_FILE;
  const publicKeyFile = process.env.IACOC_GUI_SSH_PUBLIC_KEY_FILE;
  const rootPassword = rootPasswordFile
    ? (await readFile(rootPasswordFile, 'utf8')).trim()
    : undefined;
  const publicKey = publicKeyFile ? (await readFile(publicKeyFile, 'utf8')).trim() : sshPublicKey();
  if (rootPasswordFile && rootPassword.length < 16)
    throw new GuiError('La contraseña de prueba debe tener al menos 16 caracteres.');
  if (publicKeyFile && !publicKey.startsWith('ssh-ed25519 '))
    throw new GuiError('La llave pública de prueba no tiene formato ssh-ed25519.');
  return { username: username.value.trim(), password: password.value, rootPassword, publicKey };
}

const credentials = await readCredentials();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const cleanupNames = (process.env.IACOC_GUI_CLEANUP_NAMES ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const listPrefix = (process.env.IACOC_GUI_LIST_PREFIX ?? '').trim();
const inspectName = (process.env.IACOC_GUI_INSPECT_NAME ?? '').trim();
const captureIpPrefix = (process.env.IACOC_GUI_CAPTURE_IP_PREFIX ?? '').trim();
const overviewCountOnly = process.env.IACOC_GUI_OVERVIEW_COUNT === '1';
const workerAudit = process.env.IACOC_GUI_WORKER_AUDIT === '1';
const cleanupPrefix = (process.env.IACOC_GUI_CLEANUP_PREFIX ?? '').trim();
const cleanupManifestFile = (process.env.IACOC_GUI_CLEANUP_MANIFEST_FILE ?? '').trim();
const resultFile = (process.env.IACOC_GUI_RESULT_FILE ?? '').trim();
const ipAudit = process.env.IACOC_GUI_IP_AUDIT === '1';

function disposableTestName(name) {
  return /^(?:oc-gui(?:32)?-|gui32-|prueba-iacoc-(?:[a-z0-9]+-)?\d{2}$|iacoc-test2?-\d{2}$)/u.test(
    name,
  );
}

async function collectInventoryNames(page, prefix) {
  await page.goto(`${BASE_URL}/app/instances`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await selectDevSource(page);
  const status = page.locator('select').nth(1);
  if (await status.locator('option[value="active"]').count()) await status.selectOption('active');
  const search = page.getByPlaceholder('nombre técnico');
  const names = new Set();
  await search.fill('');
  await page.waitForTimeout(Math.max(UI_POLL_MS, 10_000));
  const texts = await page.locator('button.instance-row-button').allInnerTexts();
  for (const text of texts) {
    const name = text.trim().split(/\s+/u)[0];
    if (name.startsWith(prefix)) names.add(name);
  }
  return [...names].sort();
}

if (workerAudit) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await login(page, credentials.username, credentials.password);
  await page.goto(`${BASE_URL}/app/workers`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.getByRole('heading', { name: 'Workers & Queues', exact: true }).waitFor({
    state: 'visible',
    timeout: 45_000,
  });
  const connectionId = await selectDevSource(page);
  const responsePromise = page.waitForResponse(
    (response) => {
      try {
        const url = new URL(response.url());
        return (
          response.request().method() === 'GET' &&
          url.pathname === '/api/v2/workers' &&
          url.searchParams.get('connectionId') === connectionId
        );
      } catch {
        return false;
      }
    },
    { timeout: 60_000 },
  );
  await page.getByRole('button', { name: 'Actualizar evidencia', exact: true }).click();
  const response = await responsePromise;
  if (!response.ok()) throw new GuiError(`Workers respondió HTTP ${response.status()}.`);
  const body = await response.json();
  const items = Array.isArray(body?.items) ? body.items : [];
  const workers = items.map((item) => ({
    worker_id: item?.worker_id ?? null,
    status: item?.status ?? null,
    liveness: item?.liveness ?? null,
    current_operation_id: item?.current_operation_id ?? null,
  }));
  const available = workers.filter(
    (item) =>
      String(item.liveness).toLowerCase() === 'healthy' &&
      !item.current_operation_id &&
      ['idle', 'ready', 'available'].includes(String(item.status).toLowerCase()),
  ).length;
  console.log(
    `GUI WORKER AUDIT source=dev published=${workers.length} available=${available} workers=${JSON.stringify(workers)}`,
  );
  await page.close();
} else if (overviewCountOnly) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await login(page, credentials.username, credentials.password);
  const count = await readOverviewInstanceCount(page, true);
  console.log(`GUI OVERVIEW active_instances=${count}`);
  await page.close();
} else if (captureIpPrefix) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let capturedItems = [];
  page.on('response', async (response) => {
    try {
      const url = new URL(response.url());
      if (
        url.pathname !== '/api/v2/instances' ||
        response.request().method() !== 'GET' ||
        url.searchParams.has('name')
      )
        return;
      const body = await response.json().catch(() => null);
      if (body && typeof body === 'object' && Array.isArray(body.items)) capturedItems = body.items;
    } catch {
      // Ignore responses replaced during source selection; the next list response wins.
    }
  });
  await login(page, credentials.username, credentials.password);
  await page.goto(`${BASE_URL}/app/instances`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await selectDevSource(page);
  await page.waitForTimeout(8_000);
  const selected = capturedItems.filter((item) =>
    String(item.name ?? '').startsWith(captureIpPrefix),
  );
  for (const item of selected) {
    const network = item.network && typeof item.network === 'object' ? item.network : {};
    console.log(
      `GUI IP SOURCE ${JSON.stringify({
        name: item.name,
        instance_id: item.instance_id,
        vmid: item.vmid,
        status: item.status,
        normalized_status: item.normalized_status,
        power_state: item.power_state,
        plan: item.plan,
        image: item.image,
        list_ip_addresses: item.ip_addresses,
        network_instance_id: network.instance_id,
        network_ip_addresses: network.ip_addresses,
        raw_observed_ipv4: network.observed_ipv4,
        raw_current_ip_addresses: network.current_ip_addresses,
        raw_ips: network.ips,
        raw_ip: network.ip,
        raw_addresses: network.addresses,
        raw_address: network.address,
        network_observation: network.network_observation,
        network_allocation: network.network_allocation,
      })}`,
    );
  }
  console.log(`GUI IP SOURCE SUMMARY prefix=${captureIpPrefix} records=${selected.length}`);
  await page.close();
  if (selected.length === 0) process.exitCode = 1;
} else if (inspectName) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await login(page, credentials.username, credentials.password);
  await page.goto(`${BASE_URL}/app/instances`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await selectDevSource(page);
  const statusFilter = page.locator('select').nth(1);
  if (await statusFilter.locator('option[value="all"]').count())
    await statusFilter.selectOption('all');
  const inventory = await queryInventoryByName(page, inspectName);
  const matchingItems = inventory?.filter((item) => String(item.name ?? '') === inspectName) ?? [];
  const inventorySummary = matchingItems.map((item) => ({
    name: item.name,
    instance_id: item.instance_id,
    vmid: item.vmid,
    status: item.status,
    normalized_status: item.normalized_status,
    power_state: item.power_state,
    ip_addresses: item.ip_addresses,
  }));
  console.log(
    `GUI INSPECT INVENTORY name=${inspectName} count=${matchingItems.length} records=${safeText(JSON.stringify(inventorySummary))}`,
  );
  await page.goto(`${BASE_URL}/app/operations`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await selectDevSource(page);
  const filter = page.getByPlaceholder('filtrar historial');
  await filter.fill(inspectName);
  await page.waitForTimeout(5_000);
  const operations = await page.locator('.remote-record-card').allInnerTexts();
  console.log(
    `GUI INSPECT OPERATIONS name=${inspectName} count=${operations.length} records=${safeText(operations.join(' || '))}`,
  );
  await page.goto(`${BASE_URL}/app/events`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await selectDevSource(page);
  const eventFilter = page.getByPlaceholder('filtrar historial');
  await eventFilter.fill(inspectName);
  await page.waitForTimeout(5_000);
  const events = await page.locator('.remote-record-card').allInnerTexts();
  console.log(
    `GUI INSPECT EVENTS name=${inspectName} count=${events.length} records=${safeText(events.join(' || '))}`,
  );
  const eventCard = page.locator('.remote-record-card').filter({ hasText: inspectName }).first();
  if ((await eventCard.count()) > 0) {
    await eventCard.click();
    const eventDetail = page.getByRole('dialog').last();
    await eventDetail.waitFor({ state: 'visible', timeout: 30_000 });
    console.log(
      `GUI INSPECT EVENT_DETAIL name=${inspectName} detail=${safeText(await eventDetail.innerText())}`,
    );
    await closeDetail(page);
  }
  await page.close();
} else if (listPrefix) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  if (process.env.IACOC_GUI_DEBUG_HTTP === '1') {
    page.on('response', async (response) => {
      if (!response.url().includes('/api/v2/instances')) return;
      const body = await response.text().catch(() => '');
      console.log(
        `LIST HTTP status=${response.status()} url=${response.url().replace(/connectionId=[^&]+/u, 'connectionId=<id>')} body=${body.replace(/\s+/gu, ' ').slice(0, 3000)}`,
      );
    });
  }
  await login(page, credentials.username, credentials.password);
  const names = await collectInventoryNames(page, listPrefix);
  for (const name of names) console.log(`LIST name=${name}`);
  console.log(`GUI LIST SUMMARY prefix=${listPrefix} total=${names.length}`);
  await page.close();
} else if (ipAudit) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const snapshots = new Map();
  page.on('response', async (response) => {
    try {
      const url = new URL(response.url());
      if (
        url.pathname !== '/api/v2/instances' ||
        response.request().method() !== 'GET' ||
        url.searchParams.has('name')
      )
        return;
      const body = await response.json().catch(() => null);
      if (body && typeof body === 'object' && Array.isArray(body.items)) {
        snapshots.set(url.searchParams.get('connectionId') ?? 'unknown', body.items);
      }
    } catch {
      // The UI may close a response while changing sources; the next poll is authoritative.
    }
  });
  await login(page, credentials.username, credentials.password);
  await collectInventoryNames(page, '');
  const devConnectionId = await page.locator('select').nth(0).inputValue();
  const owners = new Map();
  let activeCount = 0;
  for (const item of snapshots.get(devConnectionId) ?? []) {
    if (String(item.status ?? item.normalized_status ?? '').toLowerCase() === 'deleted') continue;
    activeCount += 1;
    const addresses = Array.isArray(item.ip_addresses) ? item.ip_addresses : [];
    const name = String(item.name ?? item.instance_id ?? 'unknown-instance');
    for (const address of addresses) {
      if (typeof address !== 'string' || !address) continue;
      const list = owners.get(address) ?? [];
      if (!list.includes(name)) list.push(name);
      owners.set(address, list);
    }
  }
  const duplicates = [...owners.entries()].filter(([, names]) => new Set(names).size > 1);
  for (const [address, names] of duplicates)
    console.log(`IP DUPLICATE address=${address} instances=${[...new Set(names)].join('|')}`);
  console.log(
    `GUI IP AUDIT source=dev active_instances=${activeCount} duplicate_ips=${duplicates.length}`,
  );
  await page.close();
} else if (cleanupPrefix) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('dialog', async (dialog) => {
    console.log(`DIALOG cleanup type=${dialog.type()}`);
    await dialog.accept();
  });
  await login(page, credentials.username, credentials.password);
  const candidates = (await collectInventoryNames(page, cleanupPrefix)).filter(disposableTestName);
  console.log(`GUI PREFIX CLEANUP START prefix=${cleanupPrefix} candidates=${candidates.length}`);
  let deleted = 0;
  let failures = 0;
  for (const name of candidates) {
    const result = await cleanup(page, name);
    console.log(`CLEAN name=${name} result=${result}`);
    if (result === 'cleanup-completado') deleted += 1;
    else failures += 1;
  }
  const remaining = (await collectInventoryNames(page, cleanupPrefix)).filter(disposableTestName);
  console.log(
    `GUI PREFIX CLEANUP SUMMARY candidates=${candidates.length} deleted=${deleted} failed=${failures} remaining=${remaining.length}`,
  );
  for (const name of remaining) console.log(`REMAINING name=${name}`);
  await page.close();
  if (failures > 0 || remaining.length > 0) process.exitCode = 1;
} else if (cleanupManifestFile) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('dialog', async (dialog) => dialog.accept());
  await login(page, credentials.username, credentials.password);
  const manifest = JSON.parse(await readFile(cleanupManifestFile, 'utf8'));
  const records = Array.isArray(manifest) ? manifest : manifest.results;
  if (!Array.isArray(records)) throw new GuiError('El manifiesto de limpieza no es una lista.');
  let failures = 0;
  for (const record of records) {
    const name = String(record?.name ?? '');
    const instanceId = String(record?.instanceId ?? '');
    const vmid = Number(record?.vmid);
    const hasVmid = Number.isInteger(vmid) && vmid > 0;
    if (!/^iacoc-test2?-\d{2}$/u.test(name) || !instanceId) {
      failures += 1;
      console.error(`CLEAN_DEFERRED name=${name || '<missing>'} reason=identity-missing`);
      continue;
    }
    const outcome = await cleanup(page, name, { instanceId, ...(hasVmid ? { vmid } : {}) });
    if (outcome === 'cleanup-completado') {
      try {
        await confirmDeleted(page, name);
      } catch (error) {
        failures += 1;
        console.error(
          `CLEAN_FAIL name=${name} error=${safeText(error instanceof Error ? error.message : error)}`,
        );
        continue;
      }
    } else if (outcome !== 'cleanup-confirmado-eliminada') {
      failures += 1;
      console.error(`CLEAN_FAIL name=${name} result=${outcome}`);
      continue;
    }
    console.log(
      `CLEAN_PASS name=${name} instance_id=${instanceId} vmid=${hasVmid ? vmid : 'not-published'}`,
    );
  }
  await page.close();
  console.log(`GUI CLEANUP MANIFEST SUMMARY total=${records.length} failed=${failures}`);
  if (failures > 0) process.exitCode = 1;
} else if (cleanupNames.length > 0) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('dialog', async (dialog) => {
    console.log(`DIALOG cleanup type=${dialog.type()}`);
    await dialog.accept();
  });
  await login(page, credentials.username, credentials.password);
  let cleanupFailures = 0;
  for (const name of cleanupNames) {
    const result = await cleanup(page, name);
    console.log(`CLEAN name=${name} result=${result}`);
    if (result.startsWith('cleanup-falló')) cleanupFailures += 1;
  }
  await page.close();
  console.log(`GUI CLEANUP SUMMARY total=${cleanupNames.length} failed=${cleanupFailures}`);
  if (cleanupFailures > 0) process.exitCode = 1;
} else if (BATCH_12) {
  await runBatch12(browser, credentials);
} else {
  const cases = [];
  let index = 1;
  for (const image of IMAGES) {
    for (const plan of PLANS) {
      for (const mode of ['password', 'key']) {
        cases.push({ image, plan, mode, index });
        index += 1;
      }
    }
  }
  const selectedCases = cases.slice(START_INDEX - 1, START_INDEX - 1 + CASE_LIMIT);
  if (selectedCases.length === 0) throw new GuiError('El rango solicitado no contiene casos.');
  if (BATCH_WAVE && !resultFile)
    throw new GuiError('IACOC_GUI_BATCH_WAVE requiere IACOC_GUI_RESULT_FILE.');
  let baselineItems = [];
  let baselineMachines = new Map();
  let baselineIps = new Map();
  let baselineConnectionId = null;
  let auditPage = null;
  if (BATCH_WAVE) {
    if (!/^iacoc-test2?$/u.test(NAME_PREFIX))
      throw new GuiError(
        'La matriz por lotes requiere IACOC_GUI_NAME_PREFIX=iacoc-test o iacoc-test2.',
      );
    auditPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await login(auditPage, credentials.username, credentials.password);
    await auditPage.goto(`${BASE_URL}/app/provisioning`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    baselineConnectionId = await selectDevSource(auditPage);
    const catalogSelects = auditPage.locator('select');
    await waitFor(
      'catálogo completo de planes e imágenes',
      async () => ({
        plans: await catalogSelects
          .nth(1)
          .locator('option')
          .evaluateAll((options) => options.map((option) => option.value).filter(Boolean)),
        images: await catalogSelects
          .nth(2)
          .locator('option')
          .evaluateAll((options) => options.map((option) => option.value).filter(Boolean)),
      }),
      (catalog) =>
        PLANS.every((plan) => catalog.plans.includes(plan)) &&
        IMAGES.every((image) => catalog.images.includes(image)),
      auditPage,
      60_000,
    );
    await auditPage.goto(`${BASE_URL}/app/instances`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    const selectedNames = selectedCases.map(
      (item) => `${NAME_PREFIX}-${String(item.index).padStart(2, '0')}`,
    );
    await assertNamesUnused(auditPage, selectedNames);
    baselineItems = await readActiveInventory(auditPage, baselineConnectionId);
    baselineMachines = machineSnapshot(baselineItems);
    for (const item of baselineItems) {
      const owner = String(item.name ?? item.instance_id ?? item.vmid ?? 'instancia-sin-id');
      for (const address of inventoryAddresses(item)) {
        const owners = baselineIps.get(address) ?? [];
        if (!owners.includes(owner)) owners.push(owner);
        baselineIps.set(address, owners);
      }
    }
    console.log(
      `WAVE PREFLIGHT start=${START_INDEX} count=${selectedCases.length} active=${baselineItems.length} baseline_ips=${baselineIps.size} source=dev`,
    );
  }
  console.log(
    `GUI MATRIX START run_id=${RUN_ID} total=${selectedCases.length} start=${START_INDEX} concurrency=${MAX_CONCURRENCY} source=dev portal=${BASE_URL}`,
  );
  const results = [];
  for (let offset = 0; offset < selectedCases.length; offset += MAX_CONCURRENCY) {
    const wave = selectedCases.slice(offset, offset + MAX_CONCURRENCY);
    const waveResults = await Promise.all(wave.map((item) => runCase(browser, credentials, item)));
    results.push(...waveResults);
    console.log(
      `WAVE done=${Math.min(offset + wave.length, selectedCases.length)}/${selectedCases.length} passed=${waveResults.filter((item) => item.ok).length} failed=${waveResults.filter((item) => !item.ok).length}`,
    );
  }
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  if (BATCH_WAVE) {
    let duplicateIps = 0;
    let duplicateVmids = 0;
    try {
      const currentItems = await readActiveInventory(auditPage, baselineConnectionId);
      const changed = changedMachines(baselineMachines, currentItems);
      for (const change of changed)
        console.error(
          `BASELINE_CHANGED_DURING_WAVE name=${change.previous.name} vmid=${change.previous.vmid}`,
        );
      if (changed.length > 0) process.exitCode = 1;
      const currentIps = new Map();
      const currentVmids = new Map();
      for (const item of currentItems) {
        const name = String(item.name ?? item.instance_id ?? 'instancia-sin-id');
        const vmid = Number(item.vmid);
        if (Number.isInteger(vmid) && vmid > 0) {
          const owners = currentVmids.get(vmid) ?? [];
          if (!owners.includes(name)) owners.push(name);
          currentVmids.set(vmid, owners);
        }
        for (const address of inventoryAddresses(item)) {
          const owners = currentIps.get(address) ?? [];
          if (!owners.includes(name)) owners.push(name);
          currentIps.set(address, owners);
        }
      }
      for (const [vmid, owners] of currentVmids) {
        if (owners.length < 2) continue;
        duplicateVmids += 1;
        console.error(`VMID_DUPLICATE_CURRENT vmid=${vmid} owners=${owners.join('|')}`);
      }
      for (const [address, owners] of currentIps) {
        if (owners.length < 2) continue;
        duplicateIps += 1;
        console.error(`IP_DUPLICATE_CURRENT address=${address} owners=${owners.join('|')}`);
      }
      for (const result of results.filter((item) => item.ok)) {
        const current = currentItems.find(
          (item) => String(item.instance_id ?? item.id ?? '') === result.instanceId,
        );
        if (!current) {
          process.exitCode = 1;
          console.error(
            `TEST_INSTANCE_NOT_IN_CURRENT_INVENTORY name=${result.name} instance_id=${result.instanceId}`,
          );
        } else if (Number(current.vmid) !== result.vmid) {
          process.exitCode = 1;
          console.error(
            `TEST_VMID_CHANGED name=${result.name} expected=${result.vmid} current=${current.vmid ?? 'not-published'}`,
          );
        }
      }
    } catch (error) {
      console.error(
        `BASELINE_AUDIT_FAIL error=${safeText(error instanceof Error ? error.message : error)}`,
      );
      process.exitCode = 1;
    }
    await writeFile(
      resultFile,
      JSON.stringify(
        {
          start: START_INDEX,
          count: selectedCases.length,
          results,
          duplicateIps,
          duplicateVmids,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    await auditPage.close();
    console.log(
      `WAVE SUMMARY total=${results.length} passed=${passed} failed=${failed} duplicate_ips=${duplicateIps} duplicate_vmids=${duplicateVmids} manifest=${resultFile}`,
    );
    if (failed || duplicateIps > 0 || duplicateVmids > 0 || results.length !== selectedCases.length)
      process.exitCode = 1;
  } else {
    console.log(`GUI MATRIX SUMMARY total=${results.length} passed=${passed} failed=${failed}`);
    if (failed || results.length !== selectedCases.length) process.exitCode = 1;
  }
}
await browser.close();
