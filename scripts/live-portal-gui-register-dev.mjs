#!/usr/bin/env node
/* global console, process */

import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = (process.env.IACOC_GUI_BASE_URL ?? 'http://web:5174').replace(/\/$/u, '');
const input = await readFile('/dev/stdin', 'utf8');
const [username, password, bearer] = input.split(/\r?\n/u);
if (!username?.trim() || !password || !bearer?.trim()) {
  throw new Error('stdin requiere usuario, contraseña y bearer.');
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.getByLabel('Usuario').fill(username.trim());
await page.getByLabel('Contraseña').fill(password);
await page.getByRole('button', { name: 'Continuar', exact: true }).click();
await page.waitForURL('**/app/overview', { timeout: 45_000 });
await page.goto(`${baseUrl}/app/connectors`, {
  waitUntil: 'domcontentloaded',
  timeout: 60_000,
});
await page.getByLabel('Nombre').fill('ControlPlaneV2 dev local');
await page.getByLabel('Entorno de la fuente').selectOption('controlplane-v2');
await page.getByLabel('Endpoint HTTPS permitido').fill('https://dev-iac.cyberfuel.com');
await page.getByLabel('Bearer temporal').fill(bearer.trim());
await page.getByRole('button', { name: 'Agregar y validar', exact: true }).click();
await page.getByText('Confirma el único alcance remoto autorizado', { exact: false }).waitFor({
  state: 'visible',
  timeout: 90_000,
});
await page.locator('#single-tenant-confirmation-checkbox').check();
await page.getByRole('button', { name: 'Confirmar y conectar', exact: true }).click();
await page
  .getByText('Alcance single-tenant confirmado. La conexión quedó activa', { exact: false })
  .waitFor({
    state: 'visible',
    timeout: 90_000,
  });
console.log('GUI DEV CONNECTOR READY');
await browser.close();
