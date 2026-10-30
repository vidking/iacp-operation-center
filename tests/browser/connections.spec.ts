import { test, expect, signIn, api } from "./fixtures";
import { readFileSync, writeFileSync } from "node:fs";
const baseURL = "http://127.0.0.1:4177";
test("existing controls manage three connections without interrupting the active one", async ({
  browser,
}) => {
  const fixture = JSON.parse(
    readFileSync(".artifacts/e2e-4177/upstream.json", "utf8"),
  );
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await signIn(page, "Administrator", "demo", 4177);
  await page.goto("/administration/connections");
  await page
    .getByText("Administrar conexiones · edición, eliminación e historial", {
      exact: true,
    })
    .click();
  const row = (name: string) =>
    page
      .getByRole("row")
      .filter({ has: page.getByText(name, { exact: true }) });
  async function create(name: string, secret = fixture.token) {
    await page
      .getByRole("button", { name: "Nueva conexión", exact: true })
      .click();
    await page.getByLabel("Nombre", { exact: true }).fill(name);

    await page
      .getByLabel("Clave de acceso a IACP", { exact: true })
      .fill(secret);
    await page
      .getByRole("button", { name: "Guardar conexión", exact: true })
      .click();
    await expect(row(name)).toBeVisible();
  }
  await create("Producción");
  await create("Anterior");
  await create("Incompleta", "incorrect-fixture-secret-0123456789");
  await row("Producción")
    .getByRole("button", { name: "Probar conexión", exact: true })
    .click();
  await expect(row("Producción")).toContainText("OK");
  await row("Producción")
    .getByRole("button", { name: "Conectar", exact: true })
    .click();
  await expect(row("Producción")).toContainText("PRODUCTIVA SELECCIONADA");
  await row("Incompleta")
    .getByRole("button", { name: "Probar conexión", exact: true })
    .click();
  await expect(row("Incompleta")).toContainText("UPSTREAM_UNAUTHORIZED");

  const before = (
    await api(page, "/api/admin/connections")
  ).body.connections.find((c: { name: string }) => c.name === "Producción");
  const configure = row("Producción").getByRole("button", {
    name: "Configurar Producción",
    exact: true,
  });
  await configure.focus();
  await configure.press("Enter");
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue(
    "Producción",
  );
  await expect(page.getByLabel("Endpoint autorizado HTTPS")).toHaveValue(
    "https://iac.cyberfuel.com",
  );
  await expect(page.getByLabel("Nueva clave de acceso (opcional)")).toHaveValue(
    "",
  );
  await page.getByLabel("Nombre", { exact: true }).fill("No debe guardarse");
  await page
    .getByLabel("Nueva clave de acceso (opcional)")
    .fill("cancelled-fixture-secret-0123456789");
  await page.getByRole("button", { name: "Cancelar edición" }).click();
  await expect(row("Producción")).toContainText("PRODUCTIVA SELECCIONADA");
  expect(
    (await api(page, "/api/admin/connections")).body.connections.find(
      (c: { id: string }) => c.id === before.id,
    ).name,
  ).toBe("Producción");

  await row("Producción")
    .getByRole("button", { name: "Editar Producción", exact: true })
    .click();
  await page.getByLabel("Nombre", { exact: true }).fill("Producción principal");
  await page.getByLabel("Entorno", { exact: true }).selectOption("staging");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(row("Producción principal")).toContainText(
    "PRODUCTIVA SELECCIONADA",
  );
  const renamed = (
    await api(page, "/api/admin/connections")
  ).body.connections.find((c: { id: string }) => c.id === before.id);
  expect(renamed.credentialVersion).toBe(before.credentialVersion);
  expect(renamed.lastValidation).toBe(before.lastValidation);
  await page.reload();
  await page
    .getByText("Administrar conexiones · edición, eliminación e historial", {
      exact: true,
    })
    .click();
  await expect(row("Producción principal")).toContainText("staging");

  await row("Anterior")
    .getByRole("button", { name: "Editar Anterior", exact: true })
    .click();
  await page.getByLabel("Nombre", { exact: true }).fill("Anterior renombrada");
  await page
    .getByLabel("Endpoint autorizado HTTPS")
    .fill("https://iacp-alt-fixture.invalid");
  await page
    .getByLabel("Nueva clave de acceso (opcional)")
    .fill("replacement-fixture-secret-0123456789");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(row("Anterior renombrada")).toContainText(
    "https://iacp-alt-fixture.invalid",
  );
  await expect(
    row("Anterior renombrada").getByRole("button", {
      name: "Conectar",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(row("Producción principal")).toContainText(
    "PRODUCTIVA SELECCIONADA",
  );
  await row("Anterior renombrada")
    .getByRole("button", { name: "Rotar Anterior renombrada", exact: true })
    .click();
  await expect(
    page.getByLabel("Nueva clave de acceso", { exact: true }),
  ).toHaveValue("");
  await page
    .getByLabel("Nueva clave de acceso", { exact: true })
    .fill(fixture.token);
  await page
    .getByRole("button", { name: "Reemplazar acceso", exact: true })
    .click();
  await row("Anterior renombrada")
    .getByRole("button", { name: "Probar conexión", exact: true })
    .click();
  await expect(row("Anterior renombrada")).toContainText("OK");
  await expect(row("Producción principal")).toContainText(
    "PRODUCTIVA SELECCIONADA",
  );

  await row("Anterior renombrada")
    .getByRole("button", {
      name: "Deshabilitar Anterior renombrada",
      exact: true,
    })
    .click();
  await expect(row("Producción principal")).toContainText(
    "PRODUCTIVA SELECCIONADA",
  );
  await row("Anterior renombrada")
    .getByRole("button", { name: "Habilitar Anterior renombrada", exact: true })
    .click();
  await row("Anterior renombrada")
    .getByRole("button", { name: "Probar conexión", exact: true })
    .click();
  await expect(row("Producción principal")).toContainText(
    "PRODUCTIVA SELECCIONADA",
  );
  await row("Anterior renombrada")
    .getByRole("button", { name: "Editar Anterior renombrada", exact: true })
    .click();
  await page
    .getByLabel("Endpoint autorizado HTTPS")
    .fill("https://not-authorized.invalid");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Destino no autorizado");
  await page
    .getByRole("button", { name: "Cancelar edición", exact: true })
    .click();

  await row("Anterior renombrada")
    .getByRole("button", {
      name: "Eliminar conexión Anterior renombrada",
      exact: true,
    })
    .click();
  let confirm = page.getByRole("region", { name: "Confirmar eliminación" });
  await expect(confirm).toContainText("Anterior renombrada");
  await confirm.getByRole("button", { name: "Cancelar eliminación" }).click();
  await expect(row("Anterior renombrada")).toBeVisible();
  await row("Anterior renombrada")
    .getByRole("button", {
      name: "Eliminar conexión Anterior renombrada",
      exact: true,
    })
    .click();
  await confirm
    .getByRole("button", {
      name: "Confirmar eliminación de Anterior renombrada",
      exact: true,
    })
    .click();
  await expect(row("Anterior renombrada")).toHaveCount(0);
  await expect(
    page.getByText("connection.deleted", { exact: true }),
  ).toBeVisible();
  await expect(row("Producción principal")).toContainText(
    "PRODUCTIVA SELECCIONADA",
  );

  await row("Incompleta")
    .getByRole("button", { name: "Eliminar conexión Incompleta", exact: true })
    .click();
  await confirm
    .getByRole("button", {
      name: "Confirmar eliminación de Incompleta",
      exact: true,
    })
    .click();
  await expect(row("Incompleta")).toHaveCount(0);
  const remaining = await api(page, "/api/admin/connections");
  expect(remaining.body.connections).toHaveLength(1);
  expect(JSON.stringify(remaining.body)).not.toContain(fixture.token);

  for (const role of ["Viewer", "Operator", "Administrator"]) {
    const other = await browser.newContext({ baseURL });
    const otherPage = await other.newPage();
    await signIn(
      otherPage,
      role,
      role === "Administrator" ? "other" : "demo",
      4177,
    );
    expect(
      (
        await api(otherPage, "/api/admin/connections/" + before.id, {
          action: "delete",
          confirmId: before.id,
        })
      ).status,
    ).toBe(role === "Administrator" ? 404 : 403);
    await other.close();
  }

  await row("Producción principal")
    .getByRole("button", {
      name: "Historial Producción principal",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Historial auditable · Producción principal",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Actualizar estado", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Estado actualizado." }),
  ).toBeVisible();
  await row("Producción principal")
    .getByRole("button", {
      name: "Eliminar conexión Producción principal",
      exact: true,
    })
    .click();
  await expect(
    confirm.getByRole("button", {
      name: "Confirmar eliminación de Producción principal",
      exact: true,
    }),
  ).toBeDisabled();
  expect(
    (
      await api(page, "/api/admin/connections/" + before.id, {
        action: "delete",
        confirmId: before.id,
      })
    ).status,
  ).toBe(409);
  await confirm
    .getByRole("button", { name: "Desactivar para eliminar", exact: true })
    .click();
  await expect(
    confirm.getByRole("button", {
      name: "Confirmar eliminación de Producción principal",
      exact: true,
    }),
  ).toBeEnabled();
  await confirm
    .getByRole("button", {
      name: "Confirmar eliminación de Producción principal",
      exact: true,
    })
    .click();
  await expect(row("Producción principal")).toHaveCount(0);
  await page.reload();
  expect(
    (await api(page, "/api/admin/connections")).body.connections,
  ).toHaveLength(0);
  await page
    .getByText("Administrar conexiones · edición, eliminación e historial", {
      exact: true,
    })
    .click();
  await create("Reutilizable");
  const reused = (await api(page, "/api/admin/connections")).body
    .connections[0];
  await row("Reutilizable")
    .getByRole("button", { name: "Deshabilitar Reutilizable", exact: true })
    .click();
  const card = page.getByRole("region", { name: "Conexión IACP" });
  await card
    .getByRole("button", { name: "Actualizar acceso", exact: true })
    .click();
  await card.getByLabel("Clave de acceso a IACP").fill(fixture.token);
  await card
    .getByRole("button", { name: "Guardar y conectar", exact: true })
    .click();
  await expect(row("Reutilizable")).toContainText("OK");
  await row("Reutilizable")
    .getByRole("button", { name: "Deshabilitar Reutilizable", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Conexión IACP" })
    .getByRole("button", { name: "Conectar", exact: true })
    .click();
  await expect(row("Reutilizable")).toContainText("OK");
  const reconnected = await api(page, "/api/admin/connections");
  expect(reconnected.body.connections).toHaveLength(1);
  expect(reconnected.body.connections[0].id).toBe(reused.id);
  expect(reconnected.body.connections[0].active).toBe(true);
  await context.close();
});

test("recovers reader 401 and persists the single Bearer connection", async ({
  browser,
}) => {
  const port = 4180;
  const baseURL = "http://127.0.0.1:" + port;
  const file = ".artifacts/e2e-" + port + "/upstream.json";
  const state = JSON.parse(readFileSync(file, "utf8"));
  const consoleErrors: string[] = [];
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource")
    )
      consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await signIn(page, "Administrator", "demo", port);
  await page.goto("/administration/connections");
  const reader = page.getByRole("region", { name: "Conexión IACP" });
  async function expectReaderActive() {
    const response = await api(page, "/api/admin/connections");
    const current = response.body.connections.find(
      (item: { endpoint: string }) =>
        item.endpoint === "https://iac.cyberfuel.com",
    );
    expect(current.lastCode).toBe("OK");
    expect(current.selected).toBe(true);
    expect(current.active).toBe(true);
  }
  await reader.getByRole("button", { name: "Conectar", exact: true }).click();
  await reader.getByLabel("Clave de acceso a IACP").fill(state.token);
  await reader.getByRole("button", { name: "Guardar y conectar" }).click();
  await expect(
    reader.getByRole("status").filter({ hasText: "Configuración guardada" }),
  ).toBeVisible();
  await expectReaderActive();

  state.readerRevoked = true;
  writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
  await page.reload();
  await expect(reader).toContainText("HTTP 401");
  await expect(
    reader.locator("code").filter({ hasText: "UPSTREAM_UNAUTHORIZED" }).first(),
  ).toBeVisible();
  await expect(
    reader.locator("code").filter({ hasText: "VALIDATION_REQUIRED" }),
  ).toHaveCount(0);

  state.readerRevoked = false;
  state.token = "replacement-reader-token-012345678901234567890123";
  writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
  await page.getByRole("button", { name: "Actualizar acceso" }).click();
  await reader.getByLabel("Clave de acceso a IACP").fill(state.token);
  await reader.getByRole("button", { name: "Guardar y conectar" }).click();
  await expect(
    reader.getByRole("status").filter({ hasText: "Configuración guardada" }),
  ).toBeVisible();
  await expectReaderActive();

  state.commercial = true;
  writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
  await page.goto("/crm");
  await expect(page.getByText("Catálogo KVM de IACP")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Crear KVM", exact: true }).first(),
  ).toBeEnabled();
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test("uses one idempotent ControlPlaneV2 scope confirmation across both connection controls", async ({
  browser,
}) => {
  const port = 4182;
  const baseURL = "http://127.0.0.1:" + port;
  const fixture = JSON.parse(
    readFileSync(".artifacts/e2e-" + port + "/upstream.json", "utf8"),
  );
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const itemRequests: { action?: string; confirmSingleTenant?: boolean }[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (
      request.method() !== "POST" ||
      !/^\/api\/admin\/connections\/[^/]+$/.test(pathname)
    )
      return;
    try {
      itemRequests.push(request.postDataJSON());
    } catch {}
  });
  await signIn(page, "Administrator", "demo", port);
  await page.goto("/administration/connections");
  await page
    .getByText("Administrar conexiones · edición, eliminación e historial", {
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Nueva conexión", exact: true })
    .click();
  await page.getByLabel("Nombre", { exact: true }).fill("ControlPlaneV2");
  await page
    .getByLabel("Endpoint autorizado HTTPS")
    .fill("https://dev-iac.cyberfuel.com");
  await page
    .getByLabel("Clave de acceso a IACP", { exact: true })
    .fill(fixture.token);
  await page
    .getByRole("button", { name: "Guardar conexión", exact: true })
    .click();
  const row = page
    .getByRole("row")
    .filter({ has: page.getByText("ControlPlaneV2", { exact: true }) });
  await expect(row).toBeVisible();

  await row
    .getByRole("button", { name: "Probar conexión", exact: true })
    .click();
  const confirmationText =
    "Confirmo que este endpoint representa el único alcance remoto autorizado";
  await expect(page.getByText(confirmationText, { exact: true })).toHaveCount(
    1,
  );
  await expect(
    page.getByText("SINGLE_TENANT_CONFIRMATION_REQUIRED", { exact: true }),
  ).toHaveCount(0);
  const checkbox = page.getByLabel(confirmationText, { exact: true });
  await checkbox.check();
  const validationsBeforeRepeatedConnect = itemRequests.filter(
    (request) => request.action === "test",
  ).length;

  await row.getByRole("button", { name: "Conectar", exact: true }).click();
  await expect(checkbox).toBeChecked();
  await page
    .getByRole("region", { name: "Conexión IACP" })
    .getByRole("button", { name: "Conectar", exact: true })
    .click();
  await expect(checkbox).toBeChecked();
  expect(
    itemRequests.filter((request) => request.action === "test"),
  ).toHaveLength(validationsBeforeRepeatedConnect);
  await expect(page.getByText(confirmationText, { exact: true })).toHaveCount(
    1,
  );

  await page
    .getByRole("region", { name: "Conexión IACP" })
    .getByRole("button", { name: "Confirmar y conectar", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({
      hasText: "Alcance single-tenant confirmado. La conexión quedó activa",
    }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Conexión activa · evidencia parcial", { exact: true })
      .first(),
  ).toBeVisible();
  expect(
    itemRequests.filter((request) => request.action === "activate"),
  ).toContainEqual({ action: "activate", confirmSingleTenant: true });
  expect(
    itemRequests.filter(
      (request) =>
        request.action === "activate" && request.confirmSingleTenant === true,
    ),
  ).toHaveLength(1);
  const activated = await api(page, "/api/admin/connections");
  expect(activated.body.connections[0]).toMatchObject({
    apiProfile: "controlplane-v2",
    scopeConfirmed: true,
    selected: true,
    active: true,
  });
  await expect(
    page
      .getByRole("region", { name: "Conexión IACP" })
      .getByText("Tenant IACP: No publicado", { exact: false }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Conexión IACP" })
      .getByText("Dependencias: No publicado", { exact: false }),
  ).toBeVisible();

  await page
    .getByRole("region", { name: "Conexión IACP" })
    .getByRole("button", { name: "Conectar", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({
      hasText: "Configuración guardada. Revisa el estado",
    }),
  ).toBeVisible();
  const repeated = await api(page, "/api/admin/connections");
  expect(repeated.body.connections[0]).toMatchObject({
    scopeConfirmed: true,
    selected: true,
    active: true,
  });
  await context.close();
});
