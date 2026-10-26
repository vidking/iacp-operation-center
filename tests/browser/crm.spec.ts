import { test, expect, signIn, api } from "./fixtures";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

async function ensureCrmAccess(
  page: import("@playwright/test").Page,
  state: { token: string; operatorToken: string },
) {
  await page.goto("/administration/connections");
  const reader = page.getByRole("region", { name: "Conexión IACP" });
  if (
    !(await reader
      .getByRole("button", { name: "Desconectar", exact: true })
      .count())
  ) {
    await reader.getByRole("button", { name: "Conectar", exact: true }).click();
    if (await reader.getByLabel("Clave de acceso a IACP").count()) {
      await reader.getByLabel("Clave de acceso a IACP").fill(state.token);
      await reader.getByRole("button", { name: "Guardar y conectar" }).click();
    }
    await expect(
      reader.getByRole("button", { name: "Desconectar", exact: true }),
    ).toBeVisible();
  }
  const lifecycle = page.getByRole("region", { name: "Acceso de lifecycle" });
  if (await lifecycle.getByText("Sin configurar", { exact: true }).count()) {
    await lifecycle
      .getByLabel("Clave para crear y operar")
      .fill(state.operatorToken);
    await lifecycle.getByRole("checkbox").check();
    await lifecycle
      .getByRole("button", { name: "Guardar acceso de operaciones" })
      .click();
    await expect(lifecycle).toContainText("Configurado");
  }
}

test("real-contract portal journey uses backend credentials, asynchronous operations and unchanged desktop/mobile shell", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const state = JSON.parse(
    readFileSync(".artifacts/e2e-4178/upstream.json", "utf8"),
  );
  const context = await browser.newContext({
      baseURL: "http://127.0.0.1:4178",
    }),
    page = await context.newPage();
  await test.step("sign in to dedicated CRM fixture", () =>
    signIn(page, "Administrator", "demo", 4178));

  await page.goto("/administration/connections");

  const reader = page.getByRole("region", { name: "Conexión IACP" });
  await reader.getByRole("button", { name: "Conectar", exact: true }).click();

  await reader.getByLabel("Clave de acceso a IACP").fill(state.token);
  await reader.getByRole("button", { name: "Guardar y conectar" }).click();
  await expect(
    reader.getByRole("button", { name: "Desconectar", exact: true }),
  ).toBeVisible();
  const lifecycle = page.getByRole("region", { name: "Acceso de lifecycle" });
  await lifecycle
    .getByLabel("Clave para crear y operar")
    .fill(state.operatorToken);
  await lifecycle.getByRole("checkbox").check();
  await lifecycle
    .getByRole("button", { name: "Guardar acceso de operaciones" })
    .click();
  await expect(lifecycle).toContainText("Configurado");
  await page.goto("/crm");
  await expect(page.getByText("authorized-profile · KVM")).toBeVisible();
  await page.getByRole("button", { name: "Seleccionar producto" }).click();
  await page
    .getByLabel("Nombre de instancia", { exact: true })
    .fill("portal-test-vm");
  await page.getByRole("button", { name: "Revisar", exact: true }).click();
  await expect(
    page.getByText(/Crear una instancia nueva: portal-test-vm/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Crear instancia real", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Solicitud aceptada" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("completed");
  await page.getByRole("button", { name: "Cerrar detalle" }).click();
  const snapshot = () =>
    JSON.parse(readFileSync(".artifacts/e2e-4178/upstream.json", "utf8"));
  expect(
    snapshot().commands.filter(
      (c: { action: string }) => c.action === "create",
    ),
  ).toHaveLength(1);
  await page
    .getByRole("button", { name: "Mis instancias", exact: true })
    .click();
  await page
    .getByRole("button", { name: "portal-test-vm", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Encender", exact: true }),
  ).toBeEnabled();
  const report = await page.request.get(
    "/api/reports/instances/" + snapshot().instances[0].instance_id,
  );
  expect(report.ok()).toBe(true);
  expect(report.headers()["content-disposition"]).toContain("attachment");
  expect((await report.json()).time_zone).toBe("America/Costa_Rica");
  for (const action of ["Encender", "Reiniciar", "Apagar"]) {
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("completed");
    await page.getByRole("button", { name: "Cerrar detalle" }).click();
    await page.getByRole("button", { name: "Actualizar", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: action === "Apagar" ? "Encender" : "Apagar",
        exact: true,
      }),
    ).toBeEnabled();
  }
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .locator("details summary")
    .filter({ hasText: "Red, acceso y continuación autorizada" })
    .click();
  for (const label of [
    "Descubrir IP",
    "Verificar acceso",
    "Solicitar inicialización",
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("completed");
    await page
      .getByRole("button", { name: "Cerrar detalle", exact: true })
      .click();
  }
  await page
    .locator("details summary")
    .filter({ hasText: "Eliminar esta instancia" })
    .click();
  await page
    .getByLabel("Escribe el nombre para confirmar")
    .fill("portal-test-vm");
  await page.getByRole("button", { name: "Eliminar instancia real" }).click();
  await expect(page.getByRole("dialog")).toContainText("completed");
  await page.getByRole("button", { name: "Cerrar detalle" }).click();
  await page.getByRole("link", { name: /Volver a crear/ }).click();
  await page.getByRole("button", { name: "Seleccionar producto" }).click();
  await page
    .getByLabel("Nombre de instancia", { exact: true })
    .fill("portal-new-vm");
  await page.getByRole("button", { name: "Revisar", exact: true }).click();
  await page
    .getByRole("button", { name: "Crear instancia real", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("completed");
  await page.getByRole("button", { name: "Cerrar detalle" }).click();
  expect(snapshot().commands.map((c: { action: string }) => c.action)).toEqual([
    "create",
    "start",
    "reboot",
    "shutdown",
    "discover",
    "verify",
    "initialize",
    "delete",
    "create",
  ]);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: `test-results/crm060-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(
    await page.evaluate(
      () => JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
    ),
  ).not.toContain(state.operatorToken);
  await signIn(page, "Viewer", "demo", 4178);
  const denied = await api(page, "/api/crm/commands", {
    key: crypto.randomUUID(),
    action: "start",
    instanceId: snapshot().instances[0].instance_id,
  });
  expect(denied.status).toBe(403);
  await context.close();
});

test("commercial catalog respects current eligibility and sends the published commercial request", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const file = ".artifacts/e2e-4178/upstream.json",
    state = JSON.parse(readFileSync(file, "utf8"));
  state.commercial = true;
  state.catalogBlocked = true;
  state.instances = [];
  state.operations = [];
  state.commands = [];
  writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
  const context = await browser.newContext({
      baseURL: "http://127.0.0.1:4178",
    }),
    page = await context.newPage();
  await signIn(page, "Administrator", "demo", 4178);
  await ensureCrmAccess(page, state);
  await page.goto("/crm");
  await expect(
    page.getByText("COMMERCIAL_PLAN_NOT_AUTHORIZED", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Crear KVM", exact: true }),
  ).toBeDisabled();
  const latest = JSON.parse(readFileSync(file, "utf8"));
  latest.catalogBlocked = false;
  writeFileSync(file, JSON.stringify(latest), { mode: 0o600 });
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await page.getByRole("button", { name: "Crear KVM", exact: true }).click();
  await page
    .getByLabel("Nombre de instancia", { exact: true })
    .fill("contract-commercial-vm");
  await page
    .getByLabel("Contraseña inicial root")
    .fill(randomBytes(24).toString("base64url"));
  await page.getByRole("button", { name: "Revisar", exact: true }).click();
  await page.getByRole("button", { name: "Crear KVM", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("completed");
  await page.getByRole("button", { name: "Cerrar detalle" }).click();
  const submitted = JSON.parse(readFileSync(file, "utf8")).commands;
  expect(submitted).toHaveLength(1);
  expect(submitted[0]).toMatchObject({
    planId: "contract-plan",
    legacyProfile: null,
  });
  await page
    .getByRole("button", { name: "Mis instancias", exact: true })
    .click();
  await page
    .getByRole("button", { name: "contract-commercial-vm", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Encender", exact: true }),
  ).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({
    path: "test-results/crm060-commercial-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.close();
});

test("CRM regression: certified Golden Image keeps Crear KVM usable and records browser evidence", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const file = ".artifacts/e2e-4178/upstream.json";
  const state = JSON.parse(readFileSync(file, "utf8"));
  state.commercial = true;
  state.catalogBlocked = false;
  state.instances = [];
  state.operations = [];
  state.commands = [];
  writeFileSync(file, JSON.stringify(state), { mode: 0o600 });

  const evidence: {
    startedAt: string;
    finishedAt?: string;
    consoleErrors: Array<string>;
    failedRequests: Array<unknown>;
    responses: Array<unknown>;
    screenshots: string[];
    operationId?: string;
    instanceId?: string;
    vmid?: number | null;
    states: Array<{
      capturedAt: string;
      source: string;
      operationId?: string;
      instanceId?: string;
      status?: string;
      normalizedStatus?: string;
      updatedAt?: string;
      vmid?: number | null;
    }>;
  } = {
    startedAt: new Date().toISOString(),
    consoleErrors: [],
    failedRequests: [],
    responses: [],
    screenshots: [],
    states: [],
  };
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4178",
  });
  const page = await context.newPage();
  const requestStarted = new WeakMap<object, number>();
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    evidence.failedRequests.push({
      method: request.method(),
      url: new URL(request.url()).pathname,
      error: request.failure()?.errorText ?? "unknown",
    });
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) {
      requestStarted.set(request, Date.now());
    }
  });
  page.on("response", (response) => {
    const request = response.request();
    const path = new URL(response.url()).pathname;
    if (path.startsWith("/api/")) {
      const startedAt = requestStarted.get(request);
      evidence.responses.push({
        method: request.method(),
        path,
        status: response.status(),
        durationMs:
          startedAt === undefined ? null : Math.max(0, Date.now() - startedAt),
      });
    }
  });
  try {
    await signIn(page, "Administrator", "demo", 4178);
    await ensureCrmAccess(page, state);
    await page.goto("/crm");
    await expect(page.getByText(/contract-image · certificada/)).toBeVisible();
    const productButton = page
      .getByRole("button", { name: "Crear KVM", exact: true })
      .first();
    await expect(productButton).toBeEnabled();
    await page.screenshot({
      path: "test-results/crm-certified-before-select.png",
      fullPage: true,
    });
    evidence.screenshots.push("crm-certified-before-select.png");
    await productButton.click();
    await expect(
      page.getByLabel("Sistema operativo", { exact: false }),
    ).toHaveValue("contract-image");
    await page
      .getByLabel("Nombre de instancia", { exact: true })
      .fill("certified-image-regression");
    await page
      .getByLabel("Contraseña inicial root")
      .fill(randomBytes(24).toString("base64url"));
    await page.getByRole("button", { name: "Revisar", exact: true }).click();
    const createButton = page.getByRole("button", {
      name: "Crear KVM",
      exact: true,
    });
    await expect(createButton).toBeEnabled();
    await page.screenshot({
      path: "test-results/crm-certified-ready-to-create.png",
      fullPage: true,
    });
    evidence.screenshots.push("crm-certified-ready-to-create.png");
    const admittedResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/crm/commands" &&
        response.request().method() === "POST",
    );
    await createButton.click();
    const accepted = await (await admittedResponse).json();
    evidence.operationId = accepted.operation_id;
    evidence.instanceId = accepted.instance_id;
    evidence.states.push({
      capturedAt: new Date().toISOString(),
      source: "browser /api/crm/commands admission",
      operationId: accepted.operation_id,
      instanceId: accepted.instance_id,
      status: accepted.status,
    });
    await expect(
      page.getByRole("status").filter({ hasText: "Solicitud aceptada" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/crm-certified-admitted.png",
      fullPage: true,
    });
    evidence.screenshots.push("crm-certified-admitted.png");
    const operationResponse = await page.request.get(
      `/api/observations/operations/${accepted.operation_id}`,
    );
    expect(operationResponse.ok()).toBe(true);
    const operation = await operationResponse.json();
    evidence.states.push({
      capturedAt: new Date().toISOString(),
      source: "browser /api/observations/operations polling result",
      operationId: operation.operation_id,
      instanceId: operation.instance_id,
      status: operation.status,
      normalizedStatus: operation.normalized_status,
      updatedAt: operation.updated_at,
    });
    const instanceResponse = await page.request.get(
      `/api/crm/instances/${accepted.instance_id}`,
    );
    expect(instanceResponse.ok()).toBe(true);
    const instanceResult = await instanceResponse.json();
    evidence.vmid = instanceResult.instance.vmid ?? null;
    evidence.states.push({
      capturedAt: new Date().toISOString(),
      source: "browser /api/crm/instances inventory result",
      instanceId: instanceResult.instance.instance_id,
      status: instanceResult.instance.status,
      updatedAt: instanceResult.instance.updated_at,
      vmid: evidence.vmid,
    });
    expect(JSON.parse(readFileSync(file, "utf8")).commands).toHaveLength(1);
  } finally {
    evidence.finishedAt = new Date().toISOString();
    writeFileSync(
      "test-results/crm-certified-image-regression.json",
      JSON.stringify(evidence, null, 2),
      {
        mode: 0o600,
      },
    );
    await context.close();
  }
  expect(evidence.consoleErrors).toEqual([]);
  expect(evidence.failedRequests).toEqual([]);
  expect(
    evidence.responses.some(
      (response) => (response as { path: string }).path === "/api/crm/catalog",
    ),
  ).toBe(true);
  expect(
    evidence.responses.some(
      (response) =>
        (response as { path: string }).path === "/api/crm/commands" &&
        (response as { status: number }).status === 202,
    ),
  ).toBe(true);
});
