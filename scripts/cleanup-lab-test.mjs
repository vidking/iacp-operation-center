// Explicitly invoked cleanup of one identified disposable KVM; never force or retry a command.
import { assertReadOnlyAcceptance } from "./real-e2e-policy.mjs";
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
assertReadOnlyAcceptance("cleanup");
const [id, expectedName] = process.argv.slice(2);
if (
  !/^[a-f0-9-]{36}$/.test(id ?? "") ||
  !expectedName?.startsWith("iacoc-e2e-060-")
)
  throw new Error("Explicit test identity required");
let browser,
  phase = "read";
try {
  const admin = JSON.parse(readFileSync("/fixture/lab-admin.json", "utf8"));
  browser = await chromium.launch();
  const context = await browser.newContext({
      baseURL: "http://localhost:3000",
    }),
    page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto("/login");
  await page.getByLabel("Usuario", { exact: true }).fill(admin.username);
  await page.getByLabel("Contraseña", { exact: true }).fill(admin.password);
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  const get = async (path) => {
    const r = await page.request.get(path);
    if (!r.ok()) throw new Error();
    return r.json();
  };
  let d = await get("/api/crm/instances/" + id);
  assert.equal(d.instance.name, expectedName);
  assert.equal(d.instance.instance_id, id);
  assert.ok(["mng01", "mng02"].includes(d.instance.node));
  assert.ok(
    d.instance.vmid >= 30000 && ![104, 106, 29000].includes(d.instance.vmid),
  );
  console.log(
    JSON.stringify({
      cleanup_evidence: true,
      instance_id: id,
      vmid: d.instance.vmid,
      power: d.power?.power_state,
      mutations_available: d.power?.mutations_available,
    }),
  );
  const wait = async (opId) => {
    for (let i = 0; i < 120; i++) {
      const op = await get("/api/observations/operations/" + opId);
      if (op.normalized_status === "completed") return;
      if (["failed", "uncertain"].includes(op.normalized_status)) {
        console.log(
          JSON.stringify({
            operation_id: opId,
            normalized_status: op.normalized_status,
            error_code: op.error_code,
          }),
        );
        throw new Error();
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error();
  };
  const action = async (label, prepare = async () => {}) => {
    await page.goto("/crm?instance=" + id);
    await prepare();
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/crm/commands") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: label, exact: true }).click();
    const result = await (await response).json();
    console.log(
      JSON.stringify({
        cleanup_action: label,
        instance_id: result.instance_id,
        operation_id: result.operation_id,
        admission: result.admission ?? result.status,
        error: result.error ?? null,
      }),
    );
    assert.equal(result.instance_id, id);
    assert.equal(result.admission, "accepted");
    if (await page.getByRole("dialog").isVisible())
      await page.getByRole("button", { name: "Cerrar detalle" }).click();
    await wait(result.operation_id);
  };
  if (d.power?.power_state === "running") {
    assert.ok(d.power.mutations_available);
    phase = "normal shutdown";
    await action("Apagar");
    d = await get("/api/crm/instances/" + id);
  }
  assert.equal(d.power?.power_state, "stopped");
  assert.ok(d.power.mutations_available);
  const report = await page.request.get("/api/reports/instances/" + id);
  if (report.ok())
    writeFileSync(
      "/app/test-results/real060-report-lifecycle.json",
      JSON.stringify(await report.json(), null, 2),
    );
  phase = "authorized delete";
  await action("Eliminar instancia real", async () => {
    await page
      .locator("details summary")
      .filter({ hasText: "Eliminar esta instancia" })
      .click();
    await page
      .getByLabel("Escribe el nombre para confirmar")
      .fill(expectedName);
  });
  d = await get("/api/crm/instances/" + id);
  assert.equal(d.instance.status, "deleted");
  console.log(
    JSON.stringify({
      LAB_TEST_CLEANUP_PASS: true,
      instance_id: id,
      vmid: d.instance.vmid,
      status: d.instance.status,
    }),
  );
  await context.close();
} catch {
  console.error(
    JSON.stringify({
      LAB_TEST_CLEANUP_NOT_COMPLETED: true,
      phase,
      instance_id: id,
      note: "No force, mutation retry or other resource touched",
    }),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
}
