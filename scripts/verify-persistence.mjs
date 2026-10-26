// Ejecutar en el contenedor test compartiendo solo la red del runtime local de prueba.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const fixture = JSON.parse(
  readFileSync("/fixture/persistence-fixture.json", "utf8"),
);
const phase = process.argv[2];
const stateFile = "/app/test-results/persistence-state.json";
const validationFile = "/app/test-results/persistence-validation.json";
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
  if (phase === "after" || !process.env.IACOC_UPGRADE_FROM)
    assert.ok(
      !/MOCK|DEMO|Sandbox/.test(await page.locator("body").innerText()),
    );
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
    const obsolete = await api("/api/admin/connections", {
      ...input,
      name: "Persistence Obsolete",
      credential: fixture.token,
    });
    const kept = await api("/api/admin/connections", {
      ...input,
      name: "Persistence Draft",
      credential: fixture.token,
    });
    assert.equal(obsolete.status, 201);
    assert.equal(kept.status, 201);
    const removed = await api(
      "/api/admin/connections/" + obsolete.body.connection.id,
      { action: "delete", confirmId: obsolete.body.connection.id },
    );
    assert.equal(removed.status, 200);
    const edited = await api(
      "/api/admin/connections/" + kept.body.connection.id,
      { action: "update", ...input, name: "Persistence Retained" },
    );
    assert.equal(edited.status, 200);
    const tested = await api(
      "/api/admin/connections/" + created.body.connection.id,
      { action: "test" },
    );
    assert.equal(tested.status, 200);
    assert.equal(tested.body.connection.checks.length, 5);
    assert.equal(tested.body.connection.status, "failed");
    writeFileSync(
      validationFile,
      JSON.stringify({
        lastValidation: tested.body.connection.lastValidation,
        checks: tested.body.connection.checks,
        deletedId: obsolete.body.connection.id,
        retainedId: kept.body.connection.id,
      }),
      { mode: 0o600 },
    );
    await context.storageState({ path: stateFile });
    console.log(
      "PERSISTENCE_BEFORE_PASS: authenticated session, encrypted connection and endpoint diagnostics stored",
    );
  } else {
    const list = await api("/api/admin/connections");
    assert.equal(list.status, 200);
    const connection = list.body.connections.find((c) => c.name === input.name);
    assert.ok(connection);
    const previousValidation = JSON.parse(readFileSync(validationFile, "utf8"));
    assert.equal(connection.lastValidation, previousValidation.lastValidation);
    assert.deepEqual(connection.checks, previousValidation.checks);
    assert.equal(list.body.connections.length, 2);
    assert.ok(
      !list.body.connections.some((c) => c.id === previousValidation.deletedId),
    );
    assert.equal(
      list.body.connections.find((c) => c.id === previousValidation.retainedId)
        .name,
      "Persistence Retained",
    );
    const deletedHistory = await api(
      "/api/admin/connections/" + previousValidation.deletedId + "/history",
    );
    assert.equal(deletedHistory.status, 200);
    assert.ok(JSON.stringify(deletedHistory).includes("connection.deleted"));
    assert.ok(!JSON.stringify(list).includes(fixture.token));
    const changed = await api("/api/admin/connections/" + connection.id, {
      action: "update",
      ...input,
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.connection.credentialVersion, 1);
    assert.deepEqual(changed.body.connection.checks, previousValidation.checks);
    const decrypted = await api("/api/admin/connections/" + connection.id, {
      action: "test",
    });
    assert.equal(decrypted.status, 200);
    assert.equal(decrypted.body.connection.lastCode, "UPSTREAM_DNS_DENIED");
    const history = await api(
      "/api/admin/connections/" + connection.id + "/history",
    );
    assert.ok(JSON.stringify(history).includes("connection.created"));
    assert.ok(JSON.stringify(history).includes("connection.update"));
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    console.log(
      "PERSISTENCE_AFTER_PASS: session, edited records, deletion, endpoint diagnostics, audit and decryption survived container recreation",
    );
  }
  await context.close();
} finally {
  await browser.close();
}
