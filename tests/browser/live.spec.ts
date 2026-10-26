import { test, expect, signIn, api } from "./fixtures";
import { readFileSync, writeFileSync } from "node:fs";
const fixtureFile = ".artifacts/e2e-4176/upstream.json";
test("production setup, evidence, disconnection and revocation use authenticated backend states", async ({
  browser,
}) => {
  const fixture = JSON.parse(readFileSync(fixtureFile, "utf8"));
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4176",
  });
  const page = await context.newPage();
  await signIn(page, "Administrator", "demo", 4176);
  await page.goto("/administration/connections");
  const card = page.getByRole("region", { name: "Conexión IACP" });
  await expect(card).toContainText("IACP desconectado");
  await card.getByRole("button", { name: "Conectar", exact: true }).click();
  await card.getByLabel("Clave de acceso a IACP").fill(fixture.token);
  await card.getByRole("button", { name: "Guardar y conectar" }).click();
  await expect(card).toContainText("Conectado");
  await expect(card).not.toContainText(fixture.tenant);
  for (const [route, name] of [
    ["/", "Overview"],
    ["/operations", "Operations"],
    ["/events", "Events"],
    ["/workers", "Workers & Queues"],
    ["/incidents", "Incidents & Recovery"],
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      /MOCK|DEMO|Sandbox|demo-op-/,
    );
    await page.screenshot({
      path:
        "test-results/production050-" +
        (route === "/" ? "overview" : route.slice(1)) +
        "-desktop.png",
      fullPage: true,
    });
  }
  await page.goto("/operations");
  await page
    .getByRole("button", { name: "Ver detalle live-operation-001" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("verified-detail");
  await page.getByRole("button", { name: "Cerrar detalle" }).click();
  await page.goto("/events");
  await page.locator("details.event summary").first().click();
  await expect(
    page.getByText("live-correlation-001", { exact: true }),
  ).toBeVisible();
  await page.goto("/workers");
  await expect(page.getByText("Sin instrumentación").first()).toBeVisible();
  await page.goto("/administration/connections");
  await expect(card).not.toContainText("Sin sincronizar");
  await page.screenshot({
    path: "test-results/production050-connections-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/",
    "/operations",
    "/events",
    "/workers",
    "/incidents",
    "/administration/connections",
  ]) {
    await page.goto(route);
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll("main *, header *")]
        .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
        .map((el) => ({
          tag: el.tagName,
          cls: el.className,
          right: el.getBoundingClientRect().right,
        })),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      route + JSON.stringify(overflow),
    ).toBe(true);
    await page.screenshot({
      path:
        "test-results/production050-" +
        (route === "/" ? "overview" : route.split("/").at(-1)) +
        "-mobile.png",
      fullPage: true,
    });
  }
  await card.getByRole("button", { name: "Desconectar", exact: true }).click();
  await expect(card).toContainText("IACP desconectado");
  const retained = await api(page, "/api/admin/connections");
  expect(retained.body.connections).toHaveLength(1);
  expect(retained.body.connections[0].credentialsConfigured).toBe(true);
  await card.getByRole("button", { name: "Conectar", exact: true }).click();
  await expect(card).toContainText("Conectado");
  for (const role of ["Viewer", "Operator"]) {
    const other = await browser.newContext({
      baseURL: "http://127.0.0.1:4176",
    });
    const p = await other.newPage();
    await signIn(p, role, "demo", 4176);
    await expect(
      p.getByText("live-operation-001", { exact: true }),
    ).toBeVisible();
    expect((await api(p, "/api/admin/setup", {})).status).toBe(403);
    await other.close();
  }
  const operationPageLoaded = page.waitForResponse((r) =>
    r.url().includes("/api/operation-pages"),
  );
  await page.goto("/operations");
  await operationPageLoaded;
  await expect(
    page.getByRole("button", { name: "Ver detalle live-operation-001" }),
  ).toBeVisible();
  fixture.revoked = true;
  writeFileSync(fixtureFile, JSON.stringify(fixture), { mode: 0o600 });
  await page
    .getByRole("button", { name: "Ver detalle live-operation-001" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".operation-link")).toHaveCount(0);
  await page.goto("/");
  await expect(
    page.getByText("live-operation-001", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Autenticación requerida").first()).toBeVisible();
  fixture.revoked = false;
  fixture.tenant = "foreign-scope";
  writeFileSync(fixtureFile, JSON.stringify(fixture), { mode: 0o600 });
  await page.goto("/administration/connections");
  await card
    .getByRole("button", { name: "Probar conexión", exact: true })
    .click();
  await expect(card).toContainText("alcance ya autorizado");
  await context.close();
});
