#!/usr/bin/env node
/* global console, process */

import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = (process.env.IACOC_GUI_BASE_URL ?? 'https://iacoc.cyberfuel.com').replace(
  /\/$/u,
  '',
);
const input = await readFile('/dev/stdin', 'utf8');
const [username, password] = input.split(/\r?\n/u);
if (!username?.trim() || !password) throw new Error('stdin requiere usuario y contraseña.');

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

async function waitFor(label, read, ready, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await read();
    if (ready(last)) return last;
    await page.waitForTimeout(2_000);
  }
  throw new Error(`Timeout ${label}: ${String(last ?? '')}`);
}

async function login() {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByLabel('Usuario').fill(username.trim());
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.waitForURL('**/app/overview', { timeout: 45_000 });
}

async function selectDevSource() {
  const source = page.locator('select').nth(0);
  await waitFor(
    'fuente dev',
    () => source.locator('option').filter({ hasText: 'dev-iac.cyberfuel.com' }).count(),
    (count) => Number(count) > 0,
  );
  const option = source.locator('option').filter({ hasText: 'dev-iac.cyberfuel.com' }).first();
  await source.selectOption((await option.getAttribute('value')) ?? '');
}

async function visit(route, heading) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByRole('heading', { name: heading, exact: true }).waitFor({
    state: 'visible',
    timeout: 45_000,
  });
}

async function closeDetail() {
  const close = page.getByRole('button', { name: 'Cerrar detalle', exact: true });
  if (await close.count()) await close.click();
}

async function run(label, action) {
  await action();
  console.log(`MODULE PASS ${label}`);
}

await login();

await run('overview', async () => {
  await visit('/app/overview', 'Overview');
  await page.getByRole('link', { name: 'Instances', exact: true }).click();
  await page.waitForURL('**/app/instances');
  await page.goBack();
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
});

await run('instances-ip-detail', async () => {
  await visit('/app/instances', 'Instances');
  await selectDevSource();
  const rows = page.locator('.instance-row-button');
  await page.waitForTimeout(4_000);
  if ((await rows.count()) > 0) {
    await rows.first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 30_000 });
    await dialog.getByText('IP publicada', { exact: true }).waitFor();
    await closeDetail();
  }
});

await run('provisioning-contract-fields', async () => {
  await visit('/app/provisioning', 'Provisioning');
  await selectDevSource();
  await page.getByText('Contexto comercial opcional', { exact: true }).click();
  await page.getByLabel('Customer ID').waitFor();
  await page.getByLabel('Customer tag').waitFor();
  await page.getByLabel('Order ID').waitFor();
  await page.getByLabel('Product ID').waitFor();
});

await run('operations-card-detail-refresh', async () => {
  await visit('/app/operations', 'Operations');
  await selectDevSource();
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  const cards = page.locator('.remote-record-card');
  await waitFor(
    'operaciones publicadas',
    () => cards.count(),
    (count) => Number(count) > 0,
  );
  await cards.first().click();
  await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 30_000 });
  await closeDetail();
});

await run('events-card-detail-refresh', async () => {
  await visit('/app/events', 'Events');
  await selectDevSource();
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  const cards = page.locator('.remote-record-card');
  await waitFor(
    'eventos publicados',
    () => cards.count(),
    (count) => Number(count) > 0,
  );
  await cards.first().click();
  await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 30_000 });
  await closeDetail();
});

await run('workers-grid-detail-refresh', async () => {
  await visit('/app/workers', 'Workers & Queues');
  await selectDevSource();
  await page.getByRole('button', { name: 'Actualizar evidencia', exact: true }).click();
  const cards = page.locator('.worker-card');
  await waitFor(
    'workers publicados',
    () => cards.count(),
    (count) => Number(count) > 0,
  );
  await cards.first().click();
  await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 30_000 });
  await closeDetail();
});

await run('incidents-sort-detail-refresh', async () => {
  await visit('/app/incidents', 'Incidents & Recovery');
  await selectDevSource();
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await page.getByRole('button', { name: /Más recientes|Más antiguas/ }).click();
  const rows = page.locator('.incident-row-button');
  if ((await rows.count()) > 0) {
    await rows.first().click();
    await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 30_000 });
    await closeDetail();
  }
});

await run('connectors-edit-current-source', async () => {
  await visit('/app/connectors', 'Connectors');
  const rows = page.locator('.connector-row');
  await waitFor(
    'conectores registrados',
    () => rows.count(),
    (count) => Number(count) > 0,
  );
  await rows.first().getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByRole('heading', { name: 'Editar fuente IACP', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Nueva fuente', exact: true }).click();
});

await run('users-access-render', async () => {
  await visit('/app/users', 'Users & Access');
  await page.getByRole('heading', { name: 'Crear usuario local', exact: true }).waitFor();
  await page.getByText('CONTROL DE ACCESO', { exact: true }).waitFor();
});

await run('settings-save-preferences', async () => {
  await visit('/app/settings', 'Settings');
  await page.getByRole('button', { name: 'Guardar preferencias', exact: true }).click();
  await page.getByText('Preferencias guardadas para esta identidad.', { exact: true }).waitFor();
});

console.log('GUI MODULE SUMMARY passed=10 failed=0');
await browser.close();
