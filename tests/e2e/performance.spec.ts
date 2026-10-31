import { expect, test } from '@playwright/test';

const session = {
  authenticated: true,
  user: {
    id: 'performance-user',
    username: 'operator.performance',
    role: 'Operador',
    tenant: 'performance-tenant',
  },
  csrfToken: 'performance-csrf',
};

const overview = {
  connectionState: 'disconnected',
  source: null,
  evidence: 'not-published',
  activeOperations: null,
  incidents: null,
  lastEvidenceAt: null,
  message: 'Fixture de prueba: el runtime productivo no contiene este dato.',
};

test('cambia de ruta al primer clic con upstream entre 100 ms y 10 s', async ({ page }) => {
  await page.route('**/api/v2/session', (route) => route.fulfill({ json: session }));

  for (const delay of [100, 500, 2_000, 10_000]) {
    await page.unroute('**/api/v2/overview');
    await page.route('**/api/v2/overview', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      await route.fulfill({ json: overview });
    });

    await page.goto('/app/overview');
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
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
          if (performance.now() - started > 1_000) {
            reject(new Error('La ruta no cambió al primer clic'));
            return;
          }
          requestAnimationFrame(check);
        };
        check();
      });
    });
    expect(elapsed, `latencia upstream simulada: ${delay} ms`).toBeLessThan(200);
  }
});
