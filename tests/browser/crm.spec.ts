import { test, expect, signIn, api } from "./fixtures";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
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
    .getByLabel("Clave de acceso de lifecycle")
    .fill(state.operatorToken);
  await lifecycle.getByRole("checkbox").check();
  await lifecycle
    .getByRole("button", { name: "Guardar acceso cifrado" })
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
  await page.goto("/crm");
  await expect(
    page.getByText("COMMERCIAL_PLAN_NOT_AUTHORIZED", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Seleccionar producto Contract KVM",
      exact: true,
    }),
  ).toBeDisabled();
  const latest = JSON.parse(readFileSync(file, "utf8"));
  latest.catalogBlocked = false;
  writeFileSync(file, JSON.stringify(latest), { mode: 0o600 });
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Seleccionar producto Contract KVM",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Nombre de instancia", { exact: true })
    .fill("contract-commercial-vm");
  await page
    .getByLabel("Contraseña inicial root")
    .fill(randomBytes(24).toString("base64url"));
  await page.getByRole("button", { name: "Revisar", exact: true }).click();
  await page
    .getByRole("button", { name: "Crear instancia real", exact: true })
    .click();
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
