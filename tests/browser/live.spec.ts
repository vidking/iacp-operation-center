import { test, expect, signIn, api } from "./fixtures";
import { readFileSync, writeFileSync } from "node:fs";
const fixtureFile = ".artifacts/e2e-4176/upstream.json";
test("simple setup separates identities and supports LIVE without simulated dashboard data", async ({
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
  await expect(card).toContainText("Desconectado");
  await expect(page.getByText("Tenant:", { exact: false })).toHaveCount(0);
  await card
    .getByRole("button", { name: "Conectar IACP", exact: true })
    .click();
  await card.getByLabel("Clave de conexión").fill(fixture.token);
  await card
    .getByRole("button", { name: "Guardar y verificar acceso" })
    .click();
  await expect(
    card.getByRole("button", { name: "Confirmar conexión y activar LIVE" }),
  ).toBeVisible();
  await expect(card).not.toContainText(fixture.tenant);
  await card
    .getByRole("button", { name: "Confirmar conexión y activar LIVE" })
    .click();
  await expect(card).toContainText("Conectado");
  await page.goto("/");
  await expect(page.getByText("LIVE · SOLO LECTURA")).toBeVisible();
  await expect(
    page.getByText("live-operation-001", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("MOCK WORKSPACE")).toHaveCount(0);
  await expect(page.getByText("demo-op-001", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Ver detalle live-operation-001" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("verified-detail");
  await page.getByRole("button", { name: "Cerrar detalle" }).click();
  await page.goto("/events");
  await page.locator("details.event summary").first().click();
  await expect(
    page.getByText("live-correlation-001", { exact: true }).first(),
  ).toBeVisible();
  await page.goto("/workers");
  await expect(page.getByText("Profundidad de colas")).toBeVisible();
  await expect(
    page.getByText("unknown", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Terraform Worker", { exact: true })).toHaveCount(
    0,
  );
  await page.goto("/incidents");
  await expect(
    page.getByText("PROVISIONING_UNCERTAIN", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("INC-", { exact: false })).toHaveCount(0);
  await page.goto("/administration/connections");
  await expect(card).not.toContainText("Sin sincronizar");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect
    .poll(() =>
      page.locator("aside").evaluate((el) => el.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0);
  expect(
    await card.evaluate((el) => el.getBoundingClientRect().right <= innerWidth),
  ).toBe(true);
  expect(
    await card
      .locator(".setup-body")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/setup004-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/setup004-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await expect(card).toContainText("Conectado");
  await card.getByRole("button", { name: "Volver a MOCK" }).click();
  const retained = await api(page, "/api/admin/connections");
  expect(retained.body.connections).toHaveLength(1);
  expect(retained.body.connections[0].credentialsConfigured).toBe(true);
  await card
    .getByRole("button", { name: "Probar conexión", exact: true })
    .click();
  await card
    .getByRole("button", { name: "Confirmar conexión y activar LIVE" })
    .click();
  for (const role of ["Viewer", "Operator"]) {
    const other = await browser.newContext({
      baseURL: "http://127.0.0.1:4176",
    });
    const otherPage = await other.newPage();
    await signIn(otherPage, role, "demo", 4176);
    await expect(
      otherPage.getByText("live-operation-001", { exact: true }),
    ).toBeVisible();
    expect((await api(otherPage, "/api/admin/setup", {})).status).toBe(403);
    await other.close();
  }
  fixture.revoked = true;
  writeFileSync(fixtureFile, JSON.stringify(fixture), { mode: 0o600 });
  await page.goto("/");
  await expect(
    page.getByText("live-operation-001", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("MOCK WORKSPACE")).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "401" }),
  ).toBeVisible();
  fixture.revoked = false;
  fixture.tenant = "other-authenticated-scope";
  writeFileSync(fixtureFile, JSON.stringify(fixture), { mode: 0o600 });
  await page.goto("/administration/connections");
  await card
    .getByRole("button", { name: "Probar conexión", exact: true })
    .click();
  await expect(card).toContainText("alcance ya autorizado");
  await expect(
    card.getByRole("button", { name: "Confirmar conexión y activar LIVE" }),
  ).toHaveCount(0);
  await context.close();
});
