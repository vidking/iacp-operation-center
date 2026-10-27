import { test, expect } from "@playwright/test";
import { signIn, api, csrf, fixtureCredentials } from "./fixtures";
import { randomBytes } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
let adminState: Awaited<ReturnType<BrowserContext["storageState"]>>;
let connectionId = "";
const secret = randomBytes(32).toString("base64url");
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, "Administrator");
  adminState = await context.storageState();
  await context.close();
});
test("unauthenticated pages and endpoints disclose no operational data", async ({
  page,
  request,
}) => {
  await page.goto("/operations");
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get("/api/admin/connections")).status()).toBe(401);
  expect((await request.get("/api/observations/operations")).status()).toBe(
    401,
  );
  const login = await request.get("/login");
  expect(await login.text()).not.toContain("demo-op-001");
  const health = await request.get("/health");
  expect(await health.json()).toEqual({ status: "ok", application: "iacoc" });
});
test("incorrect login, correct login, secure cookies, logout and session replay", async ({
  page,
  request,
}) => {
  const credentials = fixtureCredentials();
  await page.goto("/login");
  await page.getByLabel("Usuario", { exact: true }).fill(credentials.username);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("incorrect-test-password");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("alert")).toContainText("No fue posible");
  await page.getByLabel("Usuario", { exact: true }).fill(credentials.username);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(credentials.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Overview" }),
  ).toBeVisible();
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "__Host-iacoc-session",
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.secure).toBe(true);
  expect(cookie.sameSite).toBe("Lax");
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Overview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (
      await request.get("/api/admin/connections", {
        headers: { cookie: `${cookie.name}=${cookie.value}` },
      })
    ).status(),
  ).toBe(401);
});

test("two independent browser sessions keep CSRF and logout isolated", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const firstPage = await first.newPage();
  const secondPage = await second.newPage();

  await signIn(firstPage, "Administrator");
  await signIn(secondPage, "Administrator");
  const firstCookie = (await first.cookies()).find(
    (cookie) => cookie.name === "__Host-iacoc-session",
  );
  const secondCookie = (await second.cookies()).find(
    (cookie) => cookie.name === "__Host-iacoc-session",
  );
  expect(firstCookie?.httpOnly && firstCookie.secure).toBe(true);
  expect(secondCookie?.httpOnly && secondCookie.secure).toBe(true);
  expect(firstCookie?.value).not.toBe(secondCookie?.value);

  await firstPage.reload();
  await secondPage.reload();
  await expect(
    firstPage.getByRole("heading", { name: "Overview", level: 1 }),
  ).toBeVisible();
  await expect(
    secondPage.getByRole("heading", { name: "Overview", level: 1 }),
  ).toBeVisible();

  await firstPage.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(firstPage).toHaveURL(/\/login$/);
  await secondPage.reload();
  await expect(
    secondPage.getByRole("heading", { name: "Overview", level: 1 }),
  ).toBeVisible();
  await first.close();
  await second.close();
});

test("Viewer and Operator cannot edit connections even with valid CSRF", async ({
  page,
}) => {
  for (const role of ["Viewer", "Operator"]) {
    await signIn(page, role);
    await expect(
      page.getByRole("link", { name: "API Connections" }),
    ).toHaveCount(0);
    expect((await api(page, "/api/admin/connections")).status).toBe(403);
    expect(
      (await api(page, "/api/admin/connections", { name: "forbidden" })).status,
    ).toBe(403);
    expect(
      (
        await api(page, "/api/admin/connections/preflight", {
          endpoint: "https://iacp-fixture.invalid",
        })
      ).status,
    ).toBe(403);
    const response = await page.goto("/administration/connections");
    expect(response?.status()).toBe(403);
  }
});
test("administrative mutations require both exact Origin and CSRF", async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ storageState: adminState });
  const page = await context.newPage();
  await page.goto("/administration/connections");
  const cookie = (await context.cookies()).find(
    (c) => c.name === "__Host-iacoc-session",
  )!;
  const token = await csrf(page);
  expect(
    (
      await request.post("/api/admin/disconnect", {
        headers: {
          cookie: `${cookie.name}=${cookie.value}`,
          Origin: "https://evil.invalid",
          "X-CSRF-Token": token,
        },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (await api(page, "/api/admin/disconnect", {}, "bad-token")).status,
  ).toBe(403);
  expect((await api(page, "/api/admin/disconnect", {})).status).toBe(200);
  await context.close();
});
test("connection management encrypts credentials, resets validation and records history", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: adminState });
  const page = await context.newPage();
  await page.goto("/administration/connections");
  await expect(
    page.getByRole("heading", { level: 1, name: "API Connections" }),
  ).toBeVisible();
  await page
    .getByText("Administrar conexiones · edición, eliminación e historial", {
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Nueva conexión" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Browser Fixture");
  await page
    .getByLabel("Endpoint autorizado HTTPS")
    .fill("https://iacp-fixture.invalid");

  await page.getByLabel("Clave de acceso a IACP", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "Guardar conexión" }).click();
  await expect(page.getByText("Cambio guardado y auditado.")).toBeVisible();
  const listed = await api(page, "/api/admin/connections");
  expect(JSON.stringify(listed.body)).not.toContain(secret);
  connectionId = listed.body.connections[0].id;
  expect(listed.body.connections[0].credentialsConfigured).toBe(true);
  const tested = await api(page, `/api/admin/connections/${connectionId}`, {
    action: "test",
  });
  expect(tested.status).toBe(200);
  expect(tested.body.connection.status).toBe("failed");
  expect(
    (
      await api(page, `/api/admin/connections/${connectionId}`, {
        action: "activate",
      })
    ).status,
  ).toBe(409);
  const rotated = await api(page, `/api/admin/connections/${connectionId}`, {
    action: "rotate",
    credential: randomBytes(32).toString("base64url"),
  });
  expect(rotated.body.connection.status).toBe("unknown");
  expect(rotated.body.connection.credentialVersion).toBe(2);
  const changes = await api(
    page,
    `/api/admin/connections/${connectionId}/history`,
  );
  expect(JSON.stringify(changes.body)).not.toContain(secret);
  expect(JSON.stringify(changes.body)).toContain("connection.rotate");
  await context.close();
});
test("destination policy and tenant isolation cannot be bypassed by an Administrator", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: adminState });
  const page = await context.newPage();
  await page.goto("/administration/connections");
  const input = {
    name: "SSRF Fixture",
    environment: "development",
    serviceIdentity: "Reader Fixture",
    credential: secret,
  };
  for (const endpoint of [
    "http://169.254.169.254",
    "https://127.0.0.1",
    "https://evil.invalid",
    "https://iacp-fixture.invalid/path",
  ])
    expect(
      (await api(page, "/api/admin/connections", { ...input, endpoint }))
        .status,
    ).toBe(400);
  await context.close();
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, "Administrator", "other");
  expect(
    (await api(otherPage, "/api/admin/connections")).body.connections,
  ).toEqual([]);
  expect(
    (await api(otherPage, `/api/admin/connections/${connectionId}/history`))
      .status,
  ).toBe(404);
  expect(
    (
      await api(otherPage, `/api/admin/connections/${connectionId}`, {
        action: "disable",
      })
    ).status,
  ).toBe(404);
  await other.close();
});

test("HTTPS reverse proxy preserves canonical origin, Secure sessions and CSRF", async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const credentials = fixtureCredentials("Viewer", "demo", 4175);
  const response = await page.goto("https://127.0.0.1:4443/login");
  expect(response?.headers()["strict-transport-security"]).toContain("max-age");
  expect(response?.headers()["content-security-policy"]).toContain("nonce-");
  await page.getByLabel("Usuario", { exact: true }).fill(credentials.username);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(credentials.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL("https://127.0.0.1:4443/");
  await expect(
    page.getByRole("heading", { name: "Overview", level: 1 }),
  ).toBeVisible();
  const cookie = (await context.cookies()).find(
    (c) => c.name === "__Host-iacoc-session",
  )!;
  expect(cookie.secure && cookie.httpOnly).toBe(true);
  expect((await request.get("http://127.0.0.1:4175/login")).status()).toBe(403);
  expect(
    (
      await request.get("http://127.0.0.1:4175/login", {
        headers: { host: "evil.invalid", "x-forwarded-proto": "https" },
      })
    ).status(),
  ).toBe(403);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL("https://127.0.0.1:4443/login");
  await context.close();
});

test("fresh login GET bootstraps CSRF through the HTTPS reverse proxy", async ({
  browser,
}) => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.clearCookies();
  const page = await context.newPage();
  const response = await page.goto("https://127.0.0.1:4443/login");

  expect(response?.status()).toBe(200);
  const loginCookie = (await context.cookies()).find(
    (cookie) => cookie.name === "__Host-iacoc-login",
  );
  expect(loginCookie).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
  });
  await expect(page.locator('form input[name="_csrf"]')).toHaveValue(
    /^[A-Za-z0-9_-]{43}$/,
  );

  const missingToken = await page.evaluate(async () => {
    const result = await fetch("/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "username=probe&password=probe",
    });
    return { status: result.status, body: await result.text() };
  });
  expect(missingToken).toEqual({
    status: 403,
    body: JSON.stringify({ error: "CSRF_TOKEN_DENIED" }),
  });

  await context.close();
});

test("connection administration is one form, preserves errors and never returns secrets", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: adminState });
  const page = await context.newPage();
  await page.goto("/administration/connections");
  await page
    .getByText("Administrar conexiones · edición, eliminación e historial", {
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Nueva conexión", exact: true })
    .click();
  await page.getByLabel("Nombre", { exact: true }).fill("One form");
  await page
    .getByLabel("Endpoint autorizado HTTPS")
    .fill("https://not-authorized.invalid");
  await page.getByLabel("Clave de acceso a IACP", { exact: true }).fill(secret);
  await page
    .getByRole("button", { name: "Guardar conexión", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Destino no autorizado");
  await page
    .getByLabel("Endpoint autorizado HTTPS")
    .fill("https://iacp-fixture.invalid");
  await page.getByLabel("Clave de acceso a IACP", { exact: true }).fill(secret);
  await page
    .getByRole("button", { name: "Guardar conexión", exact: true })
    .click();
  const listed = await api(page, "/api/admin/connections");
  expect(JSON.stringify(listed.body)).not.toContain(secret);
  expect(
    (
      await api(page, "/api/admin/connections/preflight", {
        endpoint: "https://iacp-fixture.invalid",
        addresses: ["169.254.169.254"],
      })
    ).status,
  ).toBe(400);
  await expect(page.getByText("Paso 1 de 2")).toHaveCount(0);
  await context.close();
});
