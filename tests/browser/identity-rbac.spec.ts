import { test, expect, api, fixtureCredentials, signIn } from "./fixtures";
import { randomBytes } from "node:crypto";

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

test("the supplied IACP artwork is reserved for login and Overview stays data-first", async ({
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
  await expect(page.locator(".overview-intro")).toBeVisible();
  await expect(page.locator(".orchestration-hero-art")).toHaveCount(0);
  await expect(
    page.getByText("Actividad reciente", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".overview-intro")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Administrator creates a user from GUI and the new account logs in independently", async ({
  page,
  browser,
}) => {
  await signIn(page, "Administrator");
  await page.goto("/administration/users");
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const username = `gui.viewer.${randomBytes(5).toString("hex")}`;
  const password = randomBytes(24).toString("base64url");
  const createForm = page.locator(".user-form-panel form");
  await createForm.locator('input[name="username"]').fill(username);
  await createForm.locator('input[name="displayName"]').fill("Lector GUI");
  await createForm.locator('select[name="role"]').selectOption("Viewer");
  await createForm.locator('input[name="password"]').fill(password);
  await createForm.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("status")).toContainText("Cambios guardados");
  await expect(page.getByText(username, { exact: true })).toBeVisible();

  const secondContext = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const secondPage = await secondContext.newPage();
  try {
    await secondPage.goto("http://127.0.0.1:4173/login");
    await secondPage.getByLabel("Usuario", { exact: true }).fill(username);
    await secondPage.getByLabel("Contraseña", { exact: true }).fill(password);
    await secondPage
      .getByRole("button", { name: "Iniciar sesión", exact: true })
      .click();
    await expect(secondPage).toHaveURL("http://127.0.0.1:4173/");
    await expect(
      secondPage.getByRole("button", { name: "Abrir menú de perfil" }),
    ).toBeVisible();
    expect((await api(secondPage, "/api/admin/connections")).status).toBe(403);
    expect(
      (await secondPage.request.get("/administration/users")).status(),
    ).toBe(403);
  } finally {
    await secondPage.close({ runBeforeUnload: false });
    // The browser fixture owns the parent process and closes any remaining
    // contexts at the end of the test run. Closing this context here can wait
    // on the CRM polling loop after the page has already been closed.
  }
});

test("Administrator separates profile edits, password resets and account status", async ({
  page,
  browser,
}) => {
  await signIn(page, "Administrator");
  await page.goto("/administration/users");
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const username = `gui.operator.${randomBytes(5).toString("hex")}`;
  const password = randomBytes(24).toString("base64url");
  const replacement = randomBytes(24).toString("base64url");
  const createForm = page.locator(".user-form-panel form");
  await createForm.locator('input[name="username"]').fill(username);
  await createForm.locator('input[name="displayName"]').fill("Operador GUI");
  await createForm.locator('select[name="role"]').selectOption("Operator");
  await createForm.locator('input[name="password"]').fill(password);
  await createForm.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("status")).toContainText("Cambios guardados");

  const row = () => page.locator("tbody tr").filter({ hasText: username });
  await row().getByText("Editar", { exact: true }).click();
  await row().locator('input[name="displayName"]').fill("Operador renombrado");
  await row().getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Cambios guardados");
  await expect(row()).toContainText("Operador renombrado");

  await row().getByText("Restablecer contraseña", { exact: true }).click();
  const reset = row().locator("form.password-reset-form");
  await reset.locator('input[name="newPassword"]').fill(replacement);
  await reset.locator('input[name="confirmPassword"]').fill(replacement);
  await reset.locator('input[name="confirmReset"]').check();
  await reset.getByRole("button", { name: "Restablecer", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Contraseña restablecida",
  );

  await row().getByText("Editar", { exact: true }).click();
  await row().locator('input[name="disabled"][type="checkbox"]').check();
  await row().getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(row()).toContainText("Desactivada");

  const disabledContext = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const disabledPage = await disabledContext.newPage();
  await disabledPage.goto("http://127.0.0.1:4173/login");
  await disabledPage.getByLabel("Usuario", { exact: true }).fill(username);
  await disabledPage
    .getByLabel("Contraseña", { exact: true })
    .fill(replacement);
  await disabledPage
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await expect(disabledPage.getByRole("alert")).toContainText(
    "No fue posible iniciar sesión",
  );
  await disabledPage.close({ runBeforeUnload: false });

  await row().getByText("Editar", { exact: true }).click();
  await row().locator('input[name="disabled"][type="checkbox"]').uncheck();
  await row().getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(row()).toContainText("Activa");

  const enabledContext = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const enabledPage = await enabledContext.newPage();
  await enabledPage.goto("http://127.0.0.1:4173/login");
  await enabledPage.getByLabel("Usuario", { exact: true }).fill(username);
  await enabledPage.getByLabel("Contraseña", { exact: true }).fill(replacement);
  await enabledPage
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await expect(enabledPage).toHaveURL("http://127.0.0.1:4173/");
  expect((await api(enabledPage, "/api/admin/connections")).status).toBe(403);
  await enabledPage.close({ runBeforeUnload: false });

  const administrator = fixtureCredentials("Administrator");
  const adminRow = page
    .locator("tbody tr")
    .filter({ hasText: administrator.username });
  await adminRow.getByText("Editar", { exact: true }).click();
  await adminRow.locator('select[name="role"]').selectOption("Operator");
  await adminRow.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Debe permanecer al menos un Administrador activo",
  );
});
