// Ejecutar en el contenedor test compartiendo solo la red del runtime local de prueba.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const fixture = JSON.parse(
  readFileSync("/fixture/persistence-fixture.json", "utf8"),
);
const phase = process.argv[2];
const stateFile = "/app/test-results/persistence-state.json";
const browser = await chromium.launch();
try {
  const context = await browser.newContext(
    phase === "after"
      ? { storageState: JSON.parse(readFileSync(stateFile, "utf8")) }
      : {},
  );
  const page = await context.newPage();
  if (phase === "before") {
    await page.goto("http://localhost:3000/login");
    await page.getByLabel("Usuario", { exact: true }).fill(fixture.username);
    await page.getByLabel("Contraseña", { exact: true }).fill(fixture.password);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
  }
  await page.goto("http://localhost:3000/administration/connections");
  await page
    .getByRole("heading", { level: 1, name: "API Connections" })
    .waitFor();
  const csrf = await page
    .locator('form[action="/logout"] input[name="_csrf"]')
    .inputValue();
  async function api(path, body) {
    return page.evaluate(
      async ({ path, body, csrf }) => {
        const res = await fetch(
          path,
          body
            ? {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-CSRF-Token": csrf,
                },
                body: JSON.stringify(body),
              }
            : {},
        );
        return { status: res.status, body: await res.json() };
      },
      { path, body, csrf },
    );
  }
  const input = {
    name: "Persistence Fixture",
    environment: "development",
    endpoint: "https://iacp-fixture.invalid",
    serviceIdentity: "Reader Fixture",
  };
  if (phase === "before") {
    const created = await api("/api/admin/connections", {
      ...input,
      credential: fixture.token,
    });
    assert.equal(created.status, 201);
    assert.ok(!JSON.stringify(created).includes(fixture.token));
    await context.storageState({ path: stateFile });
    console.log(
      "PERSISTENCE_BEFORE_PASS: authenticated session and encrypted connection stored",
    );
  } else {
    const list = await api("/api/admin/connections");
    assert.equal(list.status, 200);
    const connection = list.body.connections.find((c) => c.name === input.name);
    assert.ok(connection);
    assert.ok(!JSON.stringify(list).includes(fixture.token));
    const changed = await api("/api/admin/connections/" + connection.id, {
      action: "update",
      ...input,
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.connection.credentialVersion, 2);
    const history = await api(
      "/api/admin/connections/" + connection.id + "/history",
    );
    assert.ok(JSON.stringify(history).includes("connection.created"));
    assert.ok(JSON.stringify(history).includes("connection.update"));
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    console.log(
      "PERSISTENCE_AFTER_PASS: session, configuration, audit and decryption survived container recreation",
    );
  }
  await context.close();
} finally {
  await browser.close();
}
