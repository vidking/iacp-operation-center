import { test, expect, signIn } from "./fixtures";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const simulatorFile = ".artifacts/e2e-4181/upstream.json";
const images = [
  { id: "ubuntu-2404", label: "Ubuntu 24.04", prefix: "u2404" },
  { id: "ubuntu-2604", label: "Ubuntu 26.04", prefix: "u2604" },
  { id: "almalinux-9", label: "AlmaLinux 9", prefix: "alma9" },
  { id: "almalinux-10", label: "AlmaLinux 10", prefix: "alma10" },
];

function resetSimulator() {
  const state = JSON.parse(readFileSync(simulatorFile, "utf8"));
  state.commercial = true;
  state.acceptance20 = true;
  state.catalogBlocked = false;
  state.instances = [];
  state.operations = [];
  state.commands = [];
  state.events = [];
  writeFileSync(simulatorFile, JSON.stringify(state), { mode: 0o600 });
}

async function ensureConnection(
  page: import("@playwright/test").Page,
  token: string,
) {
  await page.goto("/administration/connections");
  const card = page.getByRole("region", { name: "Conexión IACP" });
  if (
    await card.getByRole("button", { name: "Desconectar", exact: true }).count()
  ) {
    await card
      .getByRole("button", { name: "Probar conexión", exact: true })
      .click();
    await expect(
      card.getByRole("button", { name: "Desconectar", exact: true }),
    ).toBeVisible();
    return;
  }
  await card.getByRole("button", { name: "Conectar", exact: true }).click();
  if (await card.getByLabel("Clave de acceso a IACP").count()) {
    await card.getByLabel("Clave de acceso a IACP").fill(token);
    await card.getByRole("button", { name: "Guardar y conectar" }).click();
  }
  await expect(
    card.getByRole("button", { name: "Desconectar", exact: true }),
  ).toBeVisible();
}

async function readAllEvents(page: import("@playwright/test").Page) {
  const events: Array<{
    event_id: number;
    operation_id: string;
    status: string;
  }> = [];
  let after = 0;
  for (;;) {
    const response = await page.request.get(
      `/api/observations/events?after=${after}`,
      { timeout: 10000 },
    );
    if (!response.ok())
      throw new Error(
        `events request failed: HTTP ${response.status()} ${await response.text()}`,
      );
    const pageValue = await response.json();
    events.push(...pageValue.events);
    if (pageValue.events.length < 100) return events;
    expect(pageValue.next_after).toBeGreaterThan(after);
    after = pageValue.next_after;
  }
}

async function command(page: import("@playwright/test").Page, button: string) {
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/crm/commands" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: button, exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(202);
  const accepted = await response.json();
  await expect(page.getByRole("dialog")).toBeVisible();
  const terminal = await page.request.get(
    `/api/observations/operations/${accepted.operation_id}`,
    { timeout: 10000 },
  );
  expect(terminal.ok()).toBe(true);
  expect((await terminal.json()).normalized_status).toBe("completed");
  await page
    .getByRole("button", { name: "Cerrar detalle", exact: true })
    .click();
  return accepted as {
    operation_id: string;
    instance_id: string;
    status: string;
  };
}

test("contractual IACP consumer completes 20 CRM lifecycles", async ({
  browser,
}) => {
  test.setTimeout(12 * 60 * 1000);
  resetSimulator();
  const fixture = JSON.parse(readFileSync(simulatorFile, "utf8"));
  const perImage = Number(process.env.ACCEPTANCE20_COUNT ?? 5);
  const evidence: {
    startedAt: string;
    source: string;
    realIacpMutations: boolean;
    tests: Array<Record<string, unknown>>;
    screenshots: string[];
    finishedAt?: string;
    [key: string]: unknown;
  } = {
    startedAt: new Date().toISOString(),
    source: "Docker Playwright + contractual IACP simulator",
    realIacpMutations: false,
    tests: [] as Array<Record<string, unknown>>,
    screenshots: [
      "test-results/api-consumer-acceptance-first.png",
      "test-results/api-consumer-acceptance-final.png",
    ],
  };
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4181",
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    failedRequests.push(
      `${request.method()} ${new URL(request.url()).pathname}`,
    ),
  );

  try {
    await signIn(page, "Administrator", "demo", 4181);
    await ensureConnection(page, fixture.token);

    for (const [imageIndex, image] of images.entries()) {
      for (let number = 1; number <= perImage; number++) {
        const name = `iacoc-e2e-${image.prefix}-${String(number).padStart(2, "0")}`;
        const startedAt = Date.now();
        await page.goto("/crm", { timeout: 15000 });
        await expect(page.getByText("Catálogo KVM de IACP")).toBeVisible();
        await page
          .getByRole("button", { name: "Crear KVM", exact: true })
          .first()
          .click();
        await page
          .getByLabel("Sistema operativo", { exact: false })
          .selectOption(image.id);
        await page
          .getByLabel("Nombre de instancia", { exact: true })
          .fill(name);
        await page
          .getByLabel("Contraseña inicial root", { exact: false })
          .fill(`Acceptance-${crypto.randomUUID()}`);
        await page
          .getByRole("button", { name: "Revisar", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Crear KVM", exact: true }),
        ).toBeEnabled();
        if (imageIndex === 0 && number === 1)
          await page.screenshot({
            path: evidence.screenshots[0],
            fullPage: true,
          });

        const create = await command(page, "Crear KVM");
        const operation = await page.request.get(
          `/api/observations/operations/${create.operation_id}`,
          { timeout: 10000 },
        );
        expect(operation.ok()).toBe(true);
        const operationValue = await operation.json();
        expect(operationValue.normalized_status).toBe("completed");

        await page
          .getByRole("button", { name: "Mis instancias", exact: true })
          .click();
        await page.getByRole("button", { name, exact: true }).click();
        const detail = await page.request.get(
          `/api/crm/instances/${create.instance_id}`,
          { timeout: 10000 },
        );
        expect(detail.ok()).toBe(true);
        const detailValue = await detail.json();
        expect(detailValue.instance.infrastructure_kind).toBe("kvm");
        expect(detailValue.instance.status).toBe("ready");
        expect(detailValue.instance.vmid).toBeGreaterThanOrEqual(30000);

        const lifecycle: Array<Record<string, unknown>> = [];
        for (const [action, expectedPower] of [
          ["Encender", "running"],
          ["Reiniciar", "running"],
          ["Apagar", "stopped"],
          ["Encender", "running"],
          ["Apagar", "stopped"],
        ] as const) {
          const accepted = await command(page, action);
          const state = await page.request.get(
            `/api/crm/instances/${create.instance_id}`,
            { timeout: 10000 },
          );
          expect(state.ok()).toBe(true);
          const value = await state.json();
          expect(value.power.power_state).toBe(expectedPower);
          lifecycle.push({
            action,
            operationId: accepted.operation_id,
            status: value.power.power_state,
          });
          const refreshResponse = page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname.startsWith(
                "/api/crm/instances/",
              ) && response.request().method() === "GET",
          );
          await page
            .getByRole("button", { name: "Actualizar", exact: true })
            .click();
          const refreshed = await refreshResponse;
          if (!refreshed.ok())
            throw new Error(
              `instance refresh failed: HTTP ${refreshed.status()} ${await refreshed.text()}`,
            );
        }

        const deleteSection = page
          .locator("details")
          .filter({ hasText: "Eliminar esta instancia" });
        await deleteSection.locator("summary").click();
        const confirmation = deleteSection.getByLabel(
          "Escribe el nombre para confirmar",
          { exact: true },
        );
        await confirmation.fill(name);
        await expect(
          deleteSection.getByRole("button", {
            name: "Eliminar instancia real",
            exact: true,
          }),
        ).toBeEnabled();
        const deleted = await command(page, "Eliminar instancia real");
        const deletedDetail = await page.request.get(
          `/api/crm/instances/${create.instance_id}`,
          { timeout: 10000 },
        );
        expect(deletedDetail.ok()).toBe(true);
        expect((await deletedDetail.json()).instance.status).toBe("deleted");
        await page.goto("/crm");
        await page
          .getByRole("button", { name: "Mis instancias", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name, exact: true }),
        ).toHaveCount(0);

        evidence.tests.push({
          number: evidence.tests.length + 1,
          image: image.label,
          imageId: image.id,
          name,
          planId: "kvm-1",
          network: "lab-dhcp",
          createOperationId: create.operation_id,
          instanceId: create.instance_id,
          vmid: detailValue.instance.vmid,
          createStatus: operationValue.normalized_status,
          lifecycle,
          deleteOperationId: deleted.operation_id,
          terminalStatus: "deleted",
          durationMs: Date.now() - startedAt,
        });
        // Keep the contractual run below IaCoC's 120-read/minute safety
        // throttle with margin. This is pacing, never a retry of a mutation.
        await page.waitForTimeout(25000);
      }
    }

    await page.goto("/events");
    await expect(page.getByText("EVIDENCIA MÁS RECIENTE")).toBeVisible();
    await expect(
      page.getByText("CST (UTC−06:00)", { exact: true }),
    ).toBeVisible();
    await page.goto("/operations");
    await expect(
      page.getByRole("heading", { name: "Operations" }),
    ).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await page.screenshot({ path: evidence.screenshots[1], fullPage: true });

    const events = await readAllEvents(page);
    expect(events.length).toBe(evidence.tests.length * 7 * 2);
    const state = JSON.parse(readFileSync(simulatorFile, "utf8"));
    expect(
      state.instances.every(
        (instance: { status: string }) => instance.status === "deleted",
      ),
    ).toBe(true);
    expect(state.commands).toHaveLength(evidence.tests.length * 7);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
    evidence.finishedAt = new Date().toISOString();
    (evidence as Record<string, unknown>).eventCount = events.length;
    (evidence as Record<string, unknown>).operationCount =
      state.operations.length;
    (evidence as Record<string, unknown>).consoleErrors = consoleErrors;
    (evidence as Record<string, unknown>).failedRequests = failedRequests;
  } finally {
    evidence.finishedAt ??= new Date().toISOString();
    writeFileSync(
      "test-results/api-consumer-acceptance.json",
      JSON.stringify(evidence, null, 2),
      { mode: 0o600 },
    );
    await context.close();
  }
  expect(evidence.tests).toHaveLength(images.length * perImage);
});

test("renders global Operations pagination and sorting from the browser", async ({
  browser,
}) => {
  const state = JSON.parse(readFileSync(simulatorFile, "utf8"));
  state.commercial = true;
  state.acceptance20 = true;
  state.catalogBlocked = false;
  state.instances = [];
  state.commands = [];
  const groupedInstances = [randomUUID(), randomUUID()];
  state.operations = Array.from({ length: 500 }, (_, index) => ({
    operation_id: randomUUID(),
    instance_id: groupedInstances[index % groupedInstances.length],
    kind: index === 99 ? "instance.delete" : "instance.power.shutdown",
    status: "completed",
    normalized_status: "completed",
    requested_by: "contractual-browser-test",
    error_code: null,
    recovery_required: false,
    created_at: new Date(Date.now() - index * 1000).toISOString(),
    updated_at: new Date(Date.now() - index * 1000).toISOString(),
    events: [],
  }));
  state.instances = groupedInstances.map((instance_id, index) => ({
    instance_id,
    tenant_id: state.tenant,
    operation_id: state.operations[index].operation_id,
    name: `grouped-vm-${index + 1}`,
    image: "ubuntu-2404",
    vcpus: 1,
    memory_mb: 1024,
    disk_gb: 20,
    status: "ready",
    infrastructure_kind: "kvm",
    vmid: 30100 + index,
    node: "mng01",
    ip_addresses: [],
    power: "stopped",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  const eventBase = Math.max(
    1000,
    ...((state.events ?? []) as Array<{ event_id: number }>).map(
      (event) => event.event_id,
    ),
  );
  state.events = [
    {
      event_id: eventBase + 1,
      correlation_id: state.operations[0].operation_id,
      operation_id: state.operations[0].operation_id,
      instance_id: state.operations[0].instance_id,
      tenant_id: state.tenant,
      occurred_at: "2026-10-29T02:28:00.000Z",
      kind: "history.event",
      status: "completed",
      code: "HISTORICAL_EVENT",
      actor: "contractual-browser-test",
      service: "IACP Orchestrator",
    },
    {
      event_id: eventBase + 2,
      correlation_id: state.operations[0].operation_id,
      operation_id: state.operations[0].operation_id,
      instance_id: state.operations[0].instance_id,
      tenant_id: state.tenant,
      occurred_at: "2026-10-29T03:17:00.000Z",
      kind: "recent.event",
      status: "completed",
      code: "LATEST_EVENT",
      actor: "contractual-browser-test",
      service: "IACP Orchestrator",
    },
  ];
  writeFileSync(simulatorFile, JSON.stringify(state), { mode: 0o600 });
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4181",
  });
  const page = await context.newPage();
  await signIn(page, "Administrator", "demo", 4181);
  await ensureConnection(page, state.token);
  await page.goto("/operations");
  await expect(page.getByText("Página 1 de 10", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Registros 1–50 de 500", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Última página" }).click();
  expect(new URL(page.url()).searchParams.get("offset")).toBe("450");
  await expect(
    page.getByText("Página 10 de 10", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Registros 451–500 de 500", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Buscar operaciones").fill("instance.delete");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("q")).toBe("instance.delete");
  await expect(
    page.getByText("1 resultados globales", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ordenar por última evidencia" })
    .click();
  await expect(page.getByRole("button", { name: "Página 1" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.goto("/operations?groupBy=instance");
  await expect(
    page.getByLabel("Operaciones agrupadas por instancia"),
  ).toBeVisible();
  await expect(page.locator(".instance-group")).toHaveCount(2);
  await expect(page.locator(".instance-group").first()).toContainText(
    "grouped-vm",
  );
  await page.goto("/events");
  await expect(page.locator("details.event").first()).toContainText(
    "LATEST_EVENT",
  );
  await expect(page.locator("details.event").nth(1)).toContainText(
    "HISTORICAL_EVENT",
  );
  await page
    .getByRole("button", { name: "Por instancia", exact: true })
    .click();
  await expect(
    page.getByLabel("Eventos agrupados por instancia"),
  ).toBeVisible();
  await context.close();
});
