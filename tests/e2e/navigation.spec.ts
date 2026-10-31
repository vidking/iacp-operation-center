import { expect, test } from '@playwright/test';

const session = {
  authenticated: true,
  user: {
    id: 'test-user',
    username: 'operator.test',
    role: 'Administrador',
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
        sources: [],
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
  await page.route('**/api/v2/settings**', (route) =>
    route.fulfill({ json: { theme: 'graphite', fontScale: 'normal' } }),
  );
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

test('muestra una sola confirmación y no reinicia el alcance pendiente', async ({ page }) => {
  await page.unroute('**/api/v2/connections');
  const connection = {
    id: 'controlplane-v2-test',
    name: 'ControlPlaneV2 fixture',
    endpoint: 'https://fixture.invalid',
    kind: 'controlplane-v2',
    status: 'pending-confirmation',
    scopeConfirmed: false,
    mode: 'READ_ONLY',
    active: false,
    tenantId: null,
    tenantPublished: false,
    dependencies: 'not-published',
    lastValidationAt: '2026-10-31T00:00:00.000Z',
    evidenceAt: '2026-10-31T00:00:00.000Z',
    credentialVersion: 1,
    contractFingerprint: 'fixture-contract',
  };
  let current = { ...connection };
  let activationBody: unknown = null;
  let validationCalls = 0;
  await page.route('**/api/v2/connections', async (route) => {
    if (route.request().method() === 'POST') {
      current = { ...connection };
      await route.fulfill({ status: 201, json: current });
      return;
    }
    await route.fulfill({ json: [current] });
  });
  await page.route('**/api/v2/connections/*/validate', async (route) => {
    validationCalls += 1;
    await route.fulfill({ json: current });
  });
  await page.route('**/api/v2/connections/*/activate', async (route) => {
    activationBody = route.request().postDataJSON();
    current = {
      ...current,
      status: 'active-partial',
      scopeConfirmed: true,
      mode: 'LIVE',
      active: true,
    };
    await route.fulfill({
      json: {
        ...current,
        message: 'Alcance single-tenant confirmado. La conexión quedó activa',
      },
    });
  });

  await page.goto('/app/connectors');
  await page.getByLabel('Nombre').fill('ControlPlaneV2 fixture');
  await page.getByLabel('Endpoint HTTPS permitido').fill('https://fixture.invalid');
  await page.getByLabel('Bearer temporal').fill('fixture-token');
  await page.getByRole('button', { name: 'Agregar y validar' }).click();
  await expect(page.getByText('Confirma el único alcance remoto autorizado')).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(1);

  await page.getByRole('button', { name: 'Conectar', exact: true }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  expect(validationCalls).toBe(0);

  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirmar y conectar' }).click();
  await expect(
    page.getByText('Alcance single-tenant confirmado. La conexión quedó activa'),
  ).toBeVisible();
  expect(activationBody).toEqual({ action: 'activate', confirmSingleTenant: true });
});

test('muestra los seis workers en una grilla uniforme y abre su detalle', async ({ page }) => {
  await page.unroute('**/api/v2/connections');
  const connection = {
    id: 'controlplane-v2-workers-test',
    name: 'ControlPlaneV2 dev',
    endpoint: 'https://dev-iac.fixture.invalid',
    kind: 'controlplane-v2',
    status: 'active-partial',
    scopeConfirmed: true,
    mode: 'LIVE',
    active: true,
    tenantId: 'tenant-workers',
    tenantPublished: true,
    dependencies: 'published',
    lastValidationAt: '2026-10-31T00:00:00.000Z',
    evidenceAt: '2026-10-31T00:00:00.000Z',
    credentialVersion: 1,
    contractFingerprint: 'fixture-contract',
  };
  const workers = Array.from({ length: 6 }, (_, index) => ({
    worker_id: `worker-${index + 1}`,
    status: 'idle',
    liveness: 'healthy',
    node: 'mng01',
    queue: 'iacp-operations',
    last_heartbeat: '2026-10-31T00:00:00.000Z',
    heartbeat_age_seconds: index + 1,
    last_operation: {
      operation_id: `operation-${index + 1}`,
      kind: index % 2 === 0 ? 'instance.create' : 'instance.network.discover',
      status: 'completed',
      instance_id: `instance-${index + 1}`,
      vmid: 40000 + index,
      updated_at: '2026-10-31T00:00:00.000Z',
    },
  }));
  await page.route('**/api/v2/connections', (route) => route.fulfill({ json: [connection] }));
  await page.route('**/api/v2/workers**', (route) =>
    route.fulfill({
      json: {
        connectionId: connection.id,
        available: true,
        source: 'workers',
        items: workers,
        observability: { active_operations: 1, queue_depth: 0, uncertain_operations: 0 },
        evidence: { source: 'published', available: true, count: 6, reason: null },
      },
    }),
  );
  await page.route('**/api/v2/operations**', (route) =>
    route.fulfill({
      json: {
        connectionId: connection.id,
        items: workers.map((worker) => worker.last_operation),
        evidence: { source: 'published', available: true, count: 6, reason: null },
      },
    }),
  );
  await page.route('**/api/v2/events**', (route) =>
    route.fulfill({
      json: {
        connectionId: connection.id,
        items: [],
        evidence: { source: 'published', available: true, count: 0, reason: null },
      },
    }),
  );

  await page.goto('/app/workers');
  await expect(page.locator('.worker-card')).toHaveCount(6);
  const heights = await page
    .locator('.worker-card')
    .evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBe(1);
  await page.locator('.worker-card').first().click();
  const workerDialog = page.getByRole('dialog');
  await expect(workerDialog).toBeVisible();
  await expect(workerDialog.getByRole('heading', { name: 'worker-1' })).toBeVisible();
  await expect(workerDialog.getByText('Historial de ejecuciones')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('presenta Operations como tarjetas y abre el detalle correlacionado', async ({ page }) => {
  await page.unroute('**/api/v2/connections');
  const connection = {
    id: 'controlplane-v2-operations-test',
    name: 'ControlPlaneV2 production',
    endpoint: 'https://iac.fixture.invalid',
    kind: 'controlplane-v2',
    status: 'active-partial',
    scopeConfirmed: true,
    mode: 'LIVE',
    active: true,
    tenantId: 'tenant-operations',
    tenantPublished: true,
    dependencies: 'published',
    lastValidationAt: '2026-10-31T00:00:00.000Z',
    evidenceAt: '2026-10-31T00:00:00.000Z',
    credentialVersion: 1,
    contractFingerprint: 'fixture-contract',
  };
  const operation = {
    operation_id: 'operation-card-1',
    instance_id: 'instance-card-1',
    vmid: 40001,
    kind: 'instance.create',
    status: 'completed',
    normalized_status: 'completed',
    requested_by: 'operator.test',
    created_at: '2026-10-31T00:00:00.000Z',
    updated_at: '2026-10-31T00:02:00.000Z',
    events: [
      {
        id: 1,
        code: 'instance.created',
        status: 'completed',
        created_at: '2026-10-31T00:01:00.000Z',
      },
    ],
  };
  await page.route('**/api/v2/connections', (route) => route.fulfill({ json: [connection] }));
  await page.route('**/api/v2/operations**', (route) =>
    route.fulfill({
      json: {
        connectionId: connection.id,
        items: [operation],
        evidence: { source: 'published', available: true, count: 1, reason: null },
      },
    }),
  );
  await page.route('**/api/v2/operations/*', (route) =>
    route.fulfill({ json: { connectionId: connection.id, item: operation } }),
  );
  await page.route('**/api/v2/events**', (route) =>
    route.fulfill({
      json: {
        connectionId: connection.id,
        items: [],
        evidence: { source: 'published', available: true, count: 0, reason: null },
      },
    }),
  );

  await page.goto('/app/operations');
  await expect(page.locator('.remote-record-card')).toHaveCount(1);
  await page.locator('.remote-record-card').click();
  const operationDialog = page.getByRole('dialog');
  await expect(operationDialog).toBeVisible();
  await expect(
    operationDialog.getByRole('heading', { name: 'Aprovisionando instancia' }),
  ).toBeVisible();
  await expect(operationDialog.getByText('Pasos publicados')).toBeVisible();
});
