import { expect, test } from '@playwright/test';

const session = {
  authenticated: true,
  user: {
    id: 'test-user',
    username: 'operator.test',
    role: 'Operador',
    tenant: 'test-tenant',
  },
  csrfToken: 'test-csrf',
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v2/session', (route) => route.fulfill({ json: session }));
  await page.route('**/api/v2/overview', (route) =>
    route.fulfill({
      json: {
        connectionState: 'disconnected',
        source: null,
        evidence: 'not-published',
        activeOperations: null,
        incidents: null,
        lastEvidenceAt: null,
        message: 'Fixture de prueba: el runtime productivo no contiene este dato.',
      },
    }),
  );
  await page.route('**/api/v2/connections', (route) => route.fulfill({ json: [] }));
});

test('cambia de sección al primer clic aunque el upstream sea lento', async ({ page }) => {
  await page.goto('/app/overview');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  if ((page.viewportSize()?.width ?? 1440) < 700) {
    await page.getByRole('button', { name: 'Abrir navegación' }).click();
  }
  const elapsed = await page.evaluate(() => {
    const link = document.querySelector('a[href="/app/operations"]');
    if (!(link instanceof HTMLElement)) throw new Error('Operations link is not available');
    const started = performance.now();
    link.click();
    return new Promise<number>((resolve, reject) => {
      const check = () => {
        if (window.location.pathname === '/app/operations') {
          resolve(performance.now() - started);
          return;
        }
        if (performance.now() - started > 1000) {
          reject(new Error('La ruta no cambió al primer clic'));
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  });
  expect(elapsed).toBeLessThan(200);
  await expect(page.getByRole('heading', { name: 'Operations' })).toBeVisible();
});

test('abre command palette y cambia tema con teclado y menú', async ({ page }) => {
  await page.goto('/app/overview');
  await page.keyboard.press('Control+K');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByPlaceholder('Ir a un módulo...').fill('Events');
  await page.getByRole('button', { name: /Events/ }).click();
  await expect(page).toHaveURL(/\/app\/events$/);
  await page.locator('.profile-menu summary').click();
  await page.getByRole('button', { name: /Tema/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', /light|graphite/);
});

test('captura el shell responsive con datos de prueba identificados', async ({
  page,
}, testInfo) => {
  await page.goto('/app/overview');
  await expect(page.getByText(/Fixture de prueba/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('overview-fixture.png'), fullPage: true });
});
