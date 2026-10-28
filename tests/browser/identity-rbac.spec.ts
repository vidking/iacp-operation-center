import { test, expect, api, signIn } from "./fixtures";

test("Administrator can use the profile menu, global palette and admin screens", async ({
  page,
}) => {
  await signIn(page, "Administrator");

  await expect(page.locator(".brand")).toContainText("Infrastructure as Code");
  await page.getByRole("button", { name: "Abrir menú de perfil" }).click();
  const profileMenu = page.getByLabel("Menú de perfil");
  await expect(
    profileMenu.getByRole("link", { name: "Mi perfil" }),
  ).toBeVisible();
  await expect(
    profileMenu.getByRole("link", { name: "Usuarios y permisos" }),
  ).toBeVisible();
  await expect(
    profileMenu.getByRole("link", { name: "Configuración" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("dialog", { name: "Búsqueda global" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Búsqueda global" }),
  ).toHaveCount(0);

  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { level: 1, name: "Mi perfil" }),
  ).toBeVisible();
  await page.goto("/administration/users");
  await expect(
    page.getByRole("heading", { level: 1, name: "Usuarios y permisos" }),
  ).toBeVisible();
  await page.goto("/administration/settings");
  await expect(
    page.getByRole("heading", { level: 1, name: "Configuración" }),
  ).toBeVisible();
});

test("Viewer and Operator see the workspace without administrative controls", async ({
  page,
}) => {
  for (const role of ["Viewer", "Operator"] as const) {
    await signIn(page, role);
    await expect(
      page.getByRole("button", { name: "Abrir menú de perfil" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Abrir menú de perfil" }).click();
    await expect(page.getByRole("link", { name: "Mi perfil" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Usuarios y permisos" }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Configuración" })).toHaveCount(
      0,
    );
    await page.keyboard.press("Escape");
    expect((await api(page, "/api/admin/connections")).status).toBe(403);
    expect((await page.goto("/administration/users"))?.status()).toBe(403);
  }
});

test("profile and preferences pages preserve visible identity and Costa Rica defaults", async ({
  page,
}) => {
  await signIn(page, "Administrator");
  await page.goto("/profile");
  await expect(
    page
      .locator(".profile-summary")
      .getByText("Administrador", { exact: true }),
  ).toBeVisible();
  await page.goto("/administration/settings");
  await expect(page.getByLabel("Zona horaria")).toHaveValue(
    "America/Costa_Rica",
  );
  await expect(page.locator(".settings-panel p.micro")).toBeVisible();
});

test("the supplied IACP artwork is used responsively on login and Overview", async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto("/login");
  const loginArt = page.locator(
    '.auth-visual img[alt*="IACP Operation Center"]',
  );
  await expect(loginArt).toBeVisible();
  await expect
    .poll(() =>
      loginArt.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);

  await signIn(page, "Administrator");
  const overviewArt = page.locator(".orchestration-hero-art img");
  await expect(overviewArt).toBeVisible();
  await expect
    .poll(() =>
      overviewArt.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".orchestration-hero")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
