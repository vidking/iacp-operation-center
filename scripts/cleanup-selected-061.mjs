// Explicit user authorization: VM 30029 and VM 30030 only. All mutations use the IaCoC GUI -> IACP.
import { assertReadOnlyAcceptance } from "./real-e2e-policy.mjs";
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
// One-off cleanup ended. Further intervention was taken over by the user.
assertReadOnlyAcceptance("cleanup");
const root = "/app/test-results/authorized-cleanup-061";
mkdirSync(root, { recursive: true });
let browser,
  phase = "login";
const evidence = [];
const emit = (type, data) =>
  console.log(JSON.stringify({ type, at: new Date().toISOString(), ...data }));
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
  async function get(path) {
    const r = await page.request.get(path);
    const v = await r.json();
    if (!r.ok()) {
      emit("READ_REJECTED", { path, status: r.status(), code: v.error });
      throw new Error();
    }
    return v;
  }
  const found = [];
  for (let offset = 0; ; offset += 100) {
    const p = await get("/api/crm/instances?offset=" + offset);
    for (const i of p.instances)
      if ([30028, 30029, 30030].includes(i.vmid)) found.push(i);
    if (!p.hasMore) break;
  }
  emit("IDENTIFIED", {
    instances: found.map((i) => ({
      vmid: i.vmid,
      instance_id: i.instance_id,
      name: i.name,
      node: i.node,
      status: i.status,
    })),
  });
  writeFileSync(
    root + "/identified.json",
    JSON.stringify(
      found.map(
        ({
          instance_id,
          vmid,
          name,
          node,
          status,
          image,
          vcpus,
          memory_mb,
          disk_gb,
          created_at,
          updated_at,
        }) => ({
          instance_id,
          vmid,
          name,
          node,
          status,
          image,
          vcpus,
          memory_mb,
          disk_gb,
          created_at,
          updated_at,
        }),
      ),
      null,
      2,
    ),
  );
  const historical = await get(
    "/api/crm/instances/a5318da2-79bd-485f-b334-79ba739f3666",
  );
  emit("VM30028_HISTORICAL", {
    status: historical.instance.status,
    mutations: 0,
  });
  for (const vmid of [30030, 30029]) {
    const i = found.find((i) => i.vmid === vmid);
    if (!i) {
      emit("NOT_VISIBLE", { vmid });
      continue;
    }
    assert.ok(["mng01", "mng02"].includes(i.node));
    assert.ok(
      vmid === 30030
        ? i.instance_id === "9a48e673-14c5-4ae0-9bbf-bb2e2c9aece2" &&
            i.name.startsWith("iacoc-e2e-061-")
        : i.name.startsWith("e2e-g-kvm1-20261026-0100"),
    );
    const report = await get("/api/reports/instances/" + i.instance_id);
    writeFileSync(
      root + "/" + vmid + "-before.json",
      JSON.stringify(report, null, 2),
    );
    if (i.status === "deleted") {
      emit("ALREADY_DELETED", { vmid });
      continue;
    }
    async function open() {
      await page.goto("/crm?instance=" + i.instance_id);
      await page.getByRole("heading", { name: i.name, exact: true }).waitFor();
    }
    async function execute(action, label) {
      const d = await get("/api/crm/instances/" + i.instance_id);
      assert.equal(d.instance.vmid, vmid);
      assert.equal(d.instance.name, i.name);
      assert.ok(["mng01", "mng02"].includes(d.instance.node));
      if (action === "shutdown" && d.power?.power_state === "stopped") return;
      if (action === "delete") assert.equal(d.power?.power_state, "stopped");
      await open();
      if (action === "delete") {
        await page
          .locator("details summary")
          .filter({ hasText: "Eliminar esta instancia" })
          .click();
        await page.getByLabel("Escribe el nombre para confirmar").fill(i.name);
      }
      const button = page.getByRole("button", { name: label, exact: true });
      assert.ok(await button.isEnabled());
      const pending = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/crm/commands") &&
          r.request().method() === "POST",
      );
      await button.click();
      const response = await pending,
        v = await response.json();
      if (!response.ok() || v.admission !== "accepted") {
        emit("CLEANUP_REJECTED", {
          vmid,
          action,
          status: response.status(),
          code: v.error,
          intentId: v.intentId,
        });
        throw new Error();
      }
      evidence.push({
        vmid,
        action,
        instance_id: i.instance_id,
        operation_id: v.operation_id,
      });
      emit("CLEANUP_ACCEPTED", evidence.at(-1));
      const deadline = Date.now() + 240000;
      let final;
      while (Date.now() < deadline) {
        const op = await get("/api/observations/operations/" + v.operation_id);
        if (
          ["completed", "failed", "uncertain"].includes(op.normalized_status)
        ) {
          final = op;
          break;
        }
        await page.waitForTimeout(4000);
      }
      if (!final || final.normalized_status !== "completed") {
        emit("CLEANUP_NOT_COMPLETED", {
          vmid,
          action,
          status: final?.normalized_status,
          code: final?.error_code,
        });
        throw new Error();
      }
      emit("CLEANUP_COMPLETED", { vmid, action, operation_id: v.operation_id });
    }
    phase = "normal shutdown " + vmid;
    await execute("shutdown", "Apagar");
    phase = "authorized delete " + vmid;
    await execute("delete", "Eliminar instancia real");
    const final = await get("/api/crm/instances/" + i.instance_id);
    assert.equal(final.instance.status, "deleted");
    const reportFinal = await get("/api/reports/instances/" + i.instance_id);
    writeFileSync(
      root + "/" + vmid + "-after.json",
      JSON.stringify(reportFinal, null, 2),
    );
    await open();
    await page.screenshot({
      path: root + "/" + vmid + "-deleted.png",
      fullPage: true,
    });
    emit("RESOURCE_DELETED_BY_IACP", {
      vmid,
      instance_id: i.instance_id,
      status: final.instance.status,
    });
  }
} catch {
  emit("CLEANUP_STOPPED", { phase, evidence });
  process.exitCode = 1;
} finally {
  writeFileSync(root + "/actions.json", JSON.stringify(evidence, null, 2));
  await browser?.close();
}
