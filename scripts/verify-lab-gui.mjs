// Explicitly invoked Docker E2E. Uses only new disposable MNG KVMs via the IaCoC GUI/BFF.
// Integration credentials arrive on stdin; no secret, body or browser error is logged.
import { assertReadOnlyAcceptance } from "./real-e2e-policy.mjs";
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
assertReadOnlyAcceptance("lifecycle");
let raw = "",
  browser,
  phase = "credentials";
const evidence = [];
const emit = (type, data) => {
  console.log(JSON.stringify({ type, at: new Date().toISOString(), ...data }));
};
try {
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (raw.length > 10000) throw new Error();
  }
  const credentials = JSON.parse(raw);
  raw = "";
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
  phase = "configure integration through GUI";
  await page.goto("/administration/connections");
  const connection = page.getByRole("region", { name: "Conexión IACP" });
  if (
    !(await connection
      .getByRole("button", { name: "Desconectar", exact: true })
      .isVisible())
  ) {
    await connection
      .getByRole("button", { name: "Conectar", exact: true })
      .click();
    await connection
      .getByLabel("Clave de acceso a IACP")
      .fill(credentials.observation);
    await connection
      .getByRole("button", { name: "Guardar y conectar" })
      .click();
    await connection
      .getByRole("button", { name: "Desconectar", exact: true })
      .waitFor();
  }
  const lifecycle = page.getByRole("region", { name: "Acceso de lifecycle" });
  if ((await lifecycle.locator("strong").innerText()) !== "Configurado") {
    await lifecycle
      .getByLabel("Clave de acceso de lifecycle")
      .fill(credentials.lifecycle);
    await lifecycle.getByRole("checkbox").check();
    await lifecycle
      .getByRole("button", { name: "Guardar acceso cifrado" })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="Acceso de lifecycle"] strong')
          ?.textContent === "Configurado",
    );
  }
  credentials.observation = "";
  credentials.lifecycle = "";
  async function get(path) {
    const response = await page.request.get(path);
    const data = await response.json();
    if (!response.ok) {
      emit("IACP_READ_REJECTED", {
        path,
        status: response.status(),
        code: data.error,
      });
      throw new Error();
    }
    return data;
  }
  async function accepted(action, click) {
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/crm/commands") &&
        r.request().method() === "POST",
    );
    await click();
    const r = await response,
      d = await r.json();
    if (!r.ok() || d.admission !== "accepted") {
      emit("IACP_REQUEST_RESULT", {
        action,
        http: r.status(),
        status: d.status,
        code: d.error,
        intent_id: d.intentId,
        instance_id: d.instance_id,
        operation_id: d.operation_id,
      });
      throw new Error();
    }
    evidence.push({
      action,
      instance_id: d.instance_id,
      operation_id: d.operation_id,
    });
    emit("IACP_ACCEPTED", evidence.at(-1));
    if (await page.getByRole("dialog").isVisible())
      await page.getByRole("button", { name: "Cerrar detalle" }).click();
    return d;
  }
  async function waitOperation(id) {
    const deadline = Date.now() + 900000;
    let prior = "";
    while (Date.now() < deadline) {
      const op = await get("/api/observations/operations/" + id);
      const state =
        op.normalized_status +
        ":" +
        (op.fulfillment?.status ?? "") +
        ":" +
        (op.fulfillment?.phase ?? "");
      if (state !== prior) {
        emit("IACP_OPERATION", {
          operation_id: id,
          status: op.status,
          normalized_status: op.normalized_status,
          phase: op.fulfillment?.phase ?? op.power?.phase ?? null,
          fulfillment_status: op.fulfillment?.status ?? null,
          error_code: op.error_code,
        });
        prior = state;
      }
      if (["failed", "uncertain"].includes(op.normalized_status))
        throw new Error();
      if (op.normalized_status === "completed") return op;
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error();
  }
  async function open(id) {
    await page.goto("/crm?instance=" + id);
    await page
      .getByRole("heading", { level: 2 })
      .filter({ hasText: "iacoc-e2e-060-" })
      .first()
      .waitFor();
  }
  async function ready(id) {
    const deadline = Date.now() + 900000;
    while (Date.now() < deadline) {
      const d = await get("/api/crm/instances/" + id);
      if (d.instance.status === "ready" && d.power?.mutations_available) {
        assert.equal(d.instance.infrastructure_kind, "kvm");
        assert.ok(["mng01", "mng02"].includes(d.instance.node));
        assert.ok(
          d.instance.vmid >= 30000 &&
            ![104, 106, 29000].includes(d.instance.vmid),
        );
        return d;
      }
      if (["failed", "deleted"].includes(d.instance.status)) throw new Error();
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error();
  }
  phase = "catalog";
  const catalog = await get("/api/crm/catalog");
  assert.equal(catalog.creationContract, "commercial");
  const profile = catalog.profiles.find((p) => p.profile === "lab-dhcp");
  assert.ok(
    profile?.nodes.length &&
      profile.nodes.every((n) => ["mng01", "mng02"].includes(n)),
  );
  const eligible = catalog.plans.filter(
    (p) =>
      p.availability.available &&
      catalog.images.some(
        (i) =>
          i.authorized &&
          ["certificada", "habilitada"].includes(i.status) &&
          i.availability.available &&
          i.compatible_plans.includes(p.plan_id),
      ),
  );
  emit("IACP_CATALOG", {
    published_plans: catalog.plans.map((p) => ({
      id: p.plan_id,
      available: p.availability.available,
      reasons: p.availability.reasons,
    })),
    eligible: eligible.map((p) => p.plan_id),
  });
  if (!eligible.length) throw new Error();
  const plan = eligible[0],
    prefix = "iacoc-e2e-060-" + Date.now().toString(36);
  for (const suffix of ["a", "b"]) {
    let name = prefix + "-" + suffix;
    let admission;
    if (suffix === "a" && process.argv[2]) {
      admission = {
        instance_id: process.argv[2],
        operation_id: process.argv[3],
      };
      if (
        !/^[a-f0-9-]{36}$/.test(admission.instance_id) ||
        !/^[a-f0-9-]{36}$/.test(admission.operation_id) ||
        !process.argv[4]?.startsWith("iacoc-e2e-060-")
      )
        throw new Error();
      name = process.argv[4];
      const prior = await get("/api/crm/instances/" + admission.instance_id);
      assert.equal(prior.instance.name, name);
      evidence.push({ action: "continue_after_observation", ...admission });
      emit("IACP_CONTINUE_SAME_UUID", admission);
    } else {
      phase = "create " + name;
      await page.goto("/crm");
      await page
        .getByRole("button", {
          name: "Seleccionar producto " + plan.name,
          exact: true,
        })
        .click();
      await page.getByLabel("Nombre de instancia", { exact: true }).fill(name);
      await page
        .getByLabel("Contraseña inicial root")
        .fill(randomBytes(24).toString("base64url"));
      await page.getByRole("button", { name: "Revisar", exact: true }).click();
      admission = await accepted("create", () =>
        page
          .getByRole("button", { name: "Crear instancia real", exact: true })
          .click(),
      );
    }
    await waitOperation(admission.operation_id);
    let detail = await ready(admission.instance_id);
    emit("IACP_INSTANCE", {
      instance_id: admission.instance_id,
      vmid: detail.instance.vmid,
      node: detail.instance.node,
      power: detail.power.power_state,
      access_status: detail.instance.access?.status ?? null,
    });
    let found = false;
    for (let offset = 0; ; offset += 100) {
      const inventory = await get("/api/crm/instances?offset=" + offset);
      found ||= inventory.instances.some(
        (i) => i.instance_id === admission.instance_id,
      );
      if (found || !inventory.hasMore) break;
    }
    assert.ok(found);
    for (const [action, label] of [
      ["shutdown", "Apagar"],
      ["start", "Encender"],
      ["reboot", "Reiniciar"],
      ["shutdown", "Apagar"],
    ]) {
      detail = await ready(admission.instance_id);
      if (action === "shutdown" && detail.power.power_state === "stopped")
        continue;
      phase = action + " " + admission.instance_id;
      await open(admission.instance_id);
      const result = await accepted(action, () =>
        page.getByRole("button", { name: label, exact: true }).click(),
      );
      assert.equal(result.instance_id, admission.instance_id);
      await waitOperation(result.operation_id);
    }
    phase = "export " + admission.instance_id;
    const report = await page.request.get(
      "/api/reports/instances/" + admission.instance_id,
    );
    assert.ok(report.ok());
    const exported = await report.json();
    assert.equal(exported.instance.instance_id, admission.instance_id);
    assert.equal(exported.time_zone, "America/Costa_Rica");
    phase = "delete " + admission.instance_id;
    await open(admission.instance_id);
    await page
      .locator("details summary")
      .filter({ hasText: "Eliminar esta instancia" })
      .click();
    await page.getByLabel("Escribe el nombre para confirmar").fill(name);
    const deleted = await accepted("delete", () =>
      page
        .getByRole("button", { name: "Eliminar instancia real", exact: true })
        .click(),
    );
    await waitOperation(deleted.operation_id);
    const final = await get("/api/crm/instances/" + admission.instance_id);
    assert.equal(final.instance.status, "deleted");
    emit("IACP_TEST_INSTANCE_DELETED", {
      instance_id: admission.instance_id,
      vmid: final.instance.vmid,
    });
  }
  emit("LAB_GUI_LIFECYCLE_PASS", {
    actions: evidence,
    scope: "new disposable MNG KVMs only",
    observability: "worker identity/heartbeat not published",
  });
  await context.close();
} catch {
  emit("LAB_GUI_LIFECYCLE_NOT_COMPLETED", {
    phase,
    accepted_actions: evidence,
    note: "No retry, force action, quota change or mutation of pre-existing resources was performed. Known test UUIDs retain their IACP evidence.",
  });
  process.exitCode = 1;
} finally {
  raw = "";
  await browser?.close();
}
