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
  // Keep the assertion below the perceptible transition budget while allowing
  // the container scheduler a small amount of jitter on the largest viewport.
  expect(elapsed).toBeLessThan(300);
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

test('muestra eliminadas solo en el historial explícito', async ({ page }) => {
  await page.unroute('**/api/v2/connections');
  const connection = {
    id: 'controlplane-v2-history-test',
    name: 'ControlPlaneV2 history fixture',
    endpoint: 'https://fixture.invalid',
    kind: 'controlplane-v2',
    status: 'active',
    scopeConfirmed: true,
    mode: 'LIVE',
    active: true,
    tenantId: 'test-tenant',
    tenantPublished: true,
    dependencies: 'published',
    lastValidationAt: '2026-10-31T00:00:00.000Z',
    evidenceAt: '2026-10-31T00:00:00.000Z',
    credentialVersion: 1,
    contractFingerprint: 'fixture-contract',
  };
  const requests: URL[] = [];
  await page.route('**/api/v2/connections', (route) => route.fulfill({ json: [connection] }));
  await page.route('**/api/v2/instances?**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const deleted = url.searchParams.get('include_deleted') === 'true';
    await route.fulfill({
      json: {
        connectionId: connection.id,
        items: deleted
          ? [{ instance_id: 'deleted-history-1', name: 'deleted-history-vm', status: 'deleted' }]
          : [{ instance_id: 'active-history-1', name: 'active-history-vm', status: 'ready' }],
        evidence: { source: 'published', available: true, count: 1, reason: null },
      },
    });
  });
  await page.goto('/app/instances');
  await expect(page.getByText('active-history-vm', { exact: true })).toBeVisible();
  await page.locator('select').nth(1).selectOption('deleted');
  await expect(page.getByText('deleted-history-vm', { exact: true })).toBeVisible();
  expect(requests.some((url) => url.searchParams.get('include_deleted') === 'true')).toBe(true);
});

test('incluye fallidas apagadas en el filtro de apagadas y excluye eliminadas', async ({
  page,
}) => {
  await page.unroute('**/api/v2/connections');
  const connection = {
    id: 'controlplane-v2-stopped-test',
    name: 'ControlPlaneV2 stopped fixture',
    endpoint: 'https://fixture.invalid',
    kind: 'controlplane-v2',
    status: 'active',
    scopeConfirmed: true,
    mode: 'LIVE',
    active: true,
    tenantId: 'test-tenant',
    tenantPublished: true,
    dependencies: 'published',
    lastValidationAt: '2026-10-31T00:00:00.000Z',
    evidenceAt: '2026-10-31T00:00:00.000Z',
    credentialVersion: 1,
    contractFingerprint: 'fixture-contract',
  };
  const requests: URL[] = [];
  await page.route('**/api/v2/connections', (route) => route.fulfill({ json: [connection] }));
  await page.route('**/api/v2/instances?**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const includeDeleted = url.searchParams.get('include_deleted') === 'true';
    await route.fulfill({
      json: {
        connectionId: connection.id,
        items: includeDeleted
          ? [
              {
                instance_id: 'failed-stopped-1',
                name: 'failed-stopped-vm',
                status: 'failed',
                power_state: 'stopped',
                vmid: 40005,
              },
              {
                instance_id: 'deleted-stopped-1',
                name: 'deleted-stopped-vm',
                status: 'deleted',
                power_state: 'stopped',
                vmid: 40006,
              },
            ]
          : [{ instance_id: 'ready-1', name: 'ready-vm', status: 'ready', power_state: 'running' }],
        evidence: {
          source: 'published',
          available: true,
          count: includeDeleted ? 2 : 1,
          reason: null,
        },
      },
    });
  });
  await page.goto('/app/instances');
  await expect(page.getByText('ready-vm', { exact: true })).toBeVisible();
  await page.locator('select').nth(1).selectOption('stopped');
  await expect(page.getByText('failed-stopped-vm', { exact: true })).toBeVisible();
  await expect(page.getByText('deleted-stopped-vm', { exact: true })).toHaveCount(0);
  expect(requests.some((url) => url.searchParams.get('include_deleted') === 'true')).toBe(true);
});

test('permite solicitar a IACP retirar una provisión fallida sin VMID', async ({ page }) => {
  await page.unroute('**/api/v2/connections');
  const connection = {
    id: 'controlplane-v2-failed-cleanup-test',
    name: 'ControlPlaneV2 failed fixture',
    endpoint: 'https://fixture.invalid',
    kind: 'controlplane-v2',
    status: 'active',
    scopeConfirmed: true,
    mode: 'LIVE',
    active: true,
    tenantId: 'test-tenant',
    tenantPublished: true,
    dependencies: 'published',
    lastValidationAt: '2026-10-31T00:00:00.000Z',
    evidenceAt: '2026-10-31T00:00:00.000Z',
    credentialVersion: 1,
    contractFingerprint: 'fixture-contract',
  };
  const failed = {
    instance_id: 'failed-no-vmid-1',
    name: 'failed-without-vmid',
    status: 'failed',
    power_state: null,
    vmid: null,
  };
  let deleteRequest: { method: string; body: unknown } | null = null;
  page.on('dialog', (dialog) => dialog.accept());
  await page.route('**/api/v2/connections', (route) => route.fulfill({ json: [connection] }));
  await page.route('**/api/v2/instances?**', (route) =>
    route.fulfill({ json: { connectionId: connection.id, items: [failed] } }),
  );
  await page.route('**/api/v2/instances/failed-no-vmid-1?**', (route) =>
    route.fulfill({ json: { connectionId: connection.id, item: failed } }),
  );
  await page.route('**/api/v2/instances/failed-no-vmid-1/power?**', (route) =>
    route.fulfill({ status: 404, json: { error: 'POWER_NOT_PUBLISHED' } }),
  );
  await page.route('**/api/v2/instances/failed-no-vmid-1/network?**', (route) =>
    route.fulfill({ json: { connectionId: connection.id, item: { status: 'unavailable' } } }),
  );
  await page.route('**/api/v2/plans?**', (route) =>
    route.fulfill({ json: { connectionId: connection.id, items: [] } }),
  );
  await page.route('**/api/v2/operations?**', (route) =>
    route.fulfill({ json: { connectionId: connection.id, items: [] } }),
  );
  await page.route('**/api/v2/instances/failed-no-vmid-1?**', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    deleteRequest = { method: route.request().method(), body: route.request().postDataJSON() };
    await route.fulfill({
      status: 202,
      json: { status: 202, result: { operation_id: 'delete-1' } },
    });
  });
  await page.goto('/app/instances');
  await page.locator('select').nth(1).selectOption('failed');
  await page.getByText('failed-without-vmid', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Eliminar instancia' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Eliminar instancia' }).click();
  await expect.poll(() => deleteRequest).not.toBeNull();
  expect(deleteRequest).toEqual({ method: 'DELETE', body: { confirm: true } });
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

test('correlaciona el VMID del inventario en eventos sin VMID duplicado', async ({ page }) => {
  await page.unroute('**/api/v2/connections');
  const connection = {
    id: 'controlplane-v2-events-test',
    name: 'ControlPlaneV2 dev',
    endpoint: 'https://dev-iac.fixture.invalid',
    kind: 'controlplane-v2',
    status: 'active-partial',
    scopeConfirmed: true,
    mode: 'LIVE',
    active: true,
    tenantId: 'tenant-events',
    tenantPublished: true,
    dependencies: 'published',
    lastValidationAt: '2026-10-31T00:00:00.000Z',
    evidenceAt: '2026-10-31T00:00:00.000Z',
    credentialVersion: 1,
    contractFingerprint: 'fixture-contract',
  };
  const event = {
    event_id: 'event-trace-1',
    operation_id: 'operation-trace-1',
    instance_id: 'instance-trace-1',
    instance_name: 'trace-vm-01',
    code: 'instance.create.started',
    status: 'running',
    occurred_at: '2026-10-31T00:01:00.000Z',
    worker_id: 'worker-5',
  };
  const operation = {
    operation_id: 'operation-trace-1',
    instance_id: 'instance-trace-1',
    kind: 'instance.create',
    status: 'running',
    normalized_status: 'running',
  };
  const instance = {
    instance_id: 'instance-trace-1',
    name: 'trace-vm-01',
    status: 'ready',
    vmid: 40042,
    node: 'mng01',
  };
  await page.route('**/api/v2/connections', (route) => route.fulfill({ json: [connection] }));
  await page.route('**/api/v2/events**', (route) =>
    route.fulfill({
      json: {
        connectionId: connection.id,
        items: [event],
        evidence: { source: 'published', available: true, count: 1, reason: null },
      },
    }),
  );
  await page.route('**/api/v2/instances?**', (route) =>
    route.fulfill({
      json: {
        connectionId: connection.id,
        items: [instance],
        evidence: { source: 'published', available: true, count: 1, reason: null },
      },
    }),
  );
  await page.route('**/api/v2/instances/instance-trace-1**', (route) =>
    route.fulfill({ json: { connectionId: connection.id, item: instance } }),
  );
  await page.route('**/api/v2/operations/operation-trace-1**', (route) =>
    route.fulfill({ json: { connectionId: connection.id, item: operation } }),
  );

  await page.goto('/app/events');
  await expect(page.locator('select').first()).toHaveValue(connection.id);
  await expect(page.locator('.remote-record-card')).toHaveCount(1);
  await page.locator('.remote-record-card').click();
  const eventDialog = page.getByRole('dialog');
  await expect(eventDialog).toBeVisible();
  await expect(eventDialog.getByText('40042', { exact: true })).toBeVisible();
  await expect(
    eventDialog.locator('.detail-fact').filter({ hasText: 'Solicitado por' }).locator('strong'),
  ).toHaveText('ControlPlaneV2 dev');
});

test('bloquea energía y eliminación mientras IACP publica una operación activa', async ({
  page,
}) => {
  await page.unroute('**/api/v2/connections');
  const connection = {
    id: 'controlplane-v2-active-operation-test',
    name: 'ControlPlaneV2 dev',
    endpoint: 'https://dev-iac.fixture.invalid',
    kind: 'controlplane-v2',
    status: 'active-partial',
    scopeConfirmed: true,
    mode: 'LIVE',
    active: true,
    tenantId: 'tenant-active-operation',
    tenantPublished: true,
    dependencies: 'published',
    lastValidationAt: '2026-10-31T00:00:00.000Z',
    evidenceAt: '2026-10-31T00:00:00.000Z',
    credentialVersion: 1,
    contractFingerprint: 'fixture-contract',
  };
  const instance = {
    instance_id: 'instance-active-operation-1',
    name: 'active-operation-vm',
    status: 'ready',
    power_state: 'running',
    vmid: 40043,
    node: 'mng01',
    plan_id: 'kvm-1',
    image_id: 'ubuntu-2404',
  };
  const operation = {
    operation_id: 'operation-active-1',
    instance_id: instance.instance_id,
    kind: 'instance.provision',
    status: 'running',
    normalized_status: 'running',
    created_at: '2026-10-31T00:00:00.000Z',
    updated_at: '2026-10-31T00:01:00.000Z',
  };
  await page.route('**/api/v2/connections', (route) => route.fulfill({ json: [connection] }));
  await page.route('**/api/v2/instances?**', (route) =>
    route.fulfill({
      json: { connectionId: connection.id, items: [instance], evidence: { source: 'published' } },
    }),
  );
  await page.route('**/api/v2/instances/instance-active-operation-1', (route) =>
    route.fulfill({ json: { connectionId: connection.id, item: instance } }),
  );
  await page.route('**/api/v2/instances/instance-active-operation-1/power**', (route) =>
    route.fulfill({ json: { connectionId: connection.id, item: { power_state: 'running' } } }),
  );
  await page.route('**/api/v2/instances/instance-active-operation-1/network**', (route) =>
    route.fulfill({
      json: { connectionId: connection.id, item: { ip_addresses: [], status: 'not-published' } },
    }),
  );
  await page.route('**/api/v2/plans**', (route) =>
    route.fulfill({
      json: {
        connectionId: connection.id,
        items: [{ plan_id: 'kvm-1', vcpus: 1, memory_mb: 2048, disk_gb: 50 }],
      },
    }),
  );
  await page.route('**/api/v2/operations**', (route) =>
    route.fulfill({
      json: { connectionId: connection.id, items: [operation], evidence: { source: 'published' } },
    }),
  );

  await page.goto('/app/instances');
  await page.locator('.instance-row-button').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('IACP tiene una operación en curso')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Apagar', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Reiniciar', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Eliminar instancia', exact: true })).toHaveCount(
    0,
  );
});
