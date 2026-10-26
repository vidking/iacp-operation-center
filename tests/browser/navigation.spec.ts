import { test, expect } from "./fixtures";
test("production navigation has five operational sections and no laboratory routes", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of [
    "Overview",
    "Operations",
    "Events",
    "Workers & Queues",
    "Incidents & Recovery",
  ]) {
    await page
      .getByRole("navigation", { name: "Navegación principal" })
      .getByRole("link", { name, exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.locator("main")).not.toContainText(
      /MOCK|DEMO|Sandbox|demo-op-/,
    );
  }
  expect((await page.goto("/crm"))?.status()).toBe(404);
});
test("unconfigured deployments show real disconnection and no synthetic counters", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("IACP desconectado").first()).toBeVisible();
  await expect(page.getByText("No disponible").first()).toBeVisible();
  await expect(page.locator(".operation-link")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Usar MOCK|Ver notificaciones DEMO/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(page.getByText("IACP desconectado").first()).toBeVisible();
});
test("desktop, tablet and mobile retain the existing layout and keyboard navigation", async ({
  page,
}) => {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390) {
      await page.getByRole("button", { name: "Abrir navegación" }).click();
    }
    await page.getByRole("link", { name: "Operations", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/operations$/);
  }
});
test("health is minimal and legacy selection endpoints cannot activate synthetic sources", async ({
  page,
  request,
}) => {
  await page.goto("/");
  expect(await (await request.get("/health")).json()).toEqual({
    status: "ok",
    application: "iacoc",
  });
  const response = await page.request.post("/api/admin/mode", {
    data: { mode: "MOCK" },
  });
  expect(response.status()).not.toBe(200);
  await expect(page.locator("body")).not.toContainText("demo-op-001");
});
