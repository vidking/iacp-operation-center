import { test, expect } from "@playwright/test";
const headings = [
  ["Overview", "Overview"],
  ["Operations", "Operations"],
  ["Events", "Events"],
  ["Workers & Queues", "Workers & Queues"],
  ["Incidents & Recovery", "Incidents & Recovery"],
  ["CRM Simulator", "CRM Simulator"],
];
test("six sections remain offline with no browser errors", async ({ page }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:4173")) external.push(r.url());
  });
  await page.goto("/");
  for (const [label, heading] of headings) {
    await page
      .getByRole("navigation")
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: heading, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("MOCK WORKSPACE")).toBeVisible();
  }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("operation filters, detail dialog, persisted status and correlation", async ({
  page,
}) => {
  await page.goto("/operations");
  await page.getByLabel("Filtrar normalized_status").selectOption("uncertain");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("failed");
  await page.getByRole("button", { name: "Ver detalle demo-op-003" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Timeline de ejecución");
  await expect(dialog).toContainText("PROVISIONING_UNCERTAIN");
  await dialog.getByRole("link", { name: "Explorar correlación" }).click();
  await expect(page.locator(".event")).toHaveCount(1);
  await page.locator(".event summary").click();
  await expect(page.getByText("Correlation ID", { exact: true })).toBeVisible();
  await expect(page.locator(".event-expanded")).toContainText("demo-op-003");
});
test("search, sorting and empty filter states", async ({ page }) => {
  await page.goto("/operations");
  await page.getByLabel("Buscar operaciones").fill("not-a-fixture");
  await expect(
    page.getByRole("heading", { name: "Sin resultados" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Limpiar filtros", exact: true })
    .click();
  await page.getByRole("button", { name: "Ordenar por identificador" }).click();
  await expect(page.locator("tbody tr").first()).toContainText("demo-op-006");
  await page.getByLabel("Buscar en operaciones").fill("demo-op-002");
  await page.getByLabel("Buscar en operaciones").press("Enter");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("demo-op-002");
});
test("loading, error and empty scenarios are reversible", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Simular estado de interfaz").selectOption("loading");
  await expect(page.getByText("Preparando la vista de ejemplo")).toBeVisible();
  await page.getByRole("button", { name: "Finalizar carga DEMO" }).click();
  await expect(page.getByText("Actividad de operaciones")).toBeVisible();
  await page.getByLabel("Simular estado de interfaz").selectOption("error");
  await expect(page.getByText("No pudimos cargar la evidencia")).toBeVisible();
  await page.getByRole("button", { name: "Restablecer demo" }).click();
  await page.getByLabel("Simular estado de interfaz").selectOption("empty");
  await expect(
    page.getByText("Aún no hay evidencia en esta vista"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(page.getByText("Actividad de operaciones")).toBeVisible();
});
test("incident history and conceptual assistant without execution", async ({
  page,
}) => {
  await page.goto("/incidents");
  await page.getByRole("button", { name: "Ver ejemplo de análisis" }).click();
  await expect(
    page.getByText("Ejemplo estático para INC-DEMO-001"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Historial 1" }).click();
  await expect(page.locator(".incident-detail")).toContainText(
    "Observación de red completada",
  );
  await page.getByLabel("Filtrar severidad").selectOption("high");
  await expect(page.locator(".incident-list")).toContainText("Sin resultados");
});
test("CRM request is a local preview and never creates an order", async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") mutations.push(r.method());
  });
  await page.goto("/crm");
  await page.getByRole("button", { name: "Clientes", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("Aurora Labs");
  await page.getByRole("button", { name: "Catálogo KVM", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Solicitud DEMO", exact: true })
    .click();
  await page.getByLabel("Nombre de la instancia").fill("aurora-dev-01");
  await page
    .getByRole("button", { name: "Preparar vista previa DEMO", exact: true })
    .click();
  await expect(page.locator(".preview-success")).toContainText("No enviada");
  await page.getByRole("button", { name: "Pedidos", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  expect(mutations).toEqual([]);
});
test("chart controls and notifications", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "6h", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Muestra .*registros DEMO/ }),
  ).toHaveCount(6);
  await page.getByRole("button", { name: "Ver notificaciones DEMO" }).click();
  await expect(
    page.getByRole("region", { name: "Notificaciones" }),
  ).toBeVisible();
});
test("mobile and tablet navigation have no horizontal overflow", async ({
  page,
}) => {
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [label] of headings) {
      await page.goto(
        label === "Overview"
          ? "/"
          : label === "Workers & Queues"
            ? "/workers"
            : label === "Incidents & Recovery"
              ? "/incidents"
              : label === "CRM Simulator"
                ? "/crm"
                : "/" + label.toLowerCase(),
      );
      await expect(
        page.getByRole("heading", { level: 1, name: label, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir navegación" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "CRM Simulator" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "CRM Simulator" }),
  ).toBeVisible();
});
test("health and MOCK remain independent of IACP configuration", async ({
  request,
}) => {
  const response = await request.get("http://127.0.0.1:4174/");
  const body = await response.text();
  expect(response.ok()).toBe(true);
  expect(body).toContain("MOCK WORKSPACE");
  expect(body).not.toContain("test-only-sentinel");
  expect(body).not.toContain("offline.invalid");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect((await request.get("/health")).ok()).toBe(true);
  for (const route of [
    "/api/proxy/v1/operations",
    "/crm-simulator/",
    "/v1/operations",
  ])
    expect((await request.get(route)).status()).toBe(404);
});
test("capture desktop and mobile review artifacts", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 1100 });
  await page.goto("/");
  await page.screenshot({
    animations: "disabled",
    path: "test-results/overview-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.screenshot({
    animations: "disabled",
    path: "test-results/overview-mobile.png",
    fullPage: true,
  });
});
