// Docker-only acceptance. Secrets on stdin, GUI mutations only, no traces or request bodies logged.
import { assertAuthorizedAcceptance } from "./real-e2e-policy.mjs";
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const acceptanceScope = assertAuthorizedAcceptance(
  process.argv[2],
  process.argv[3],
);

let browser,
  raw = "",
  phase = "login";
const evidence = [],
  timings = [],
  uiActions = [],
  seen = new Map(),
  instances = new Map(),
  commandBodies = [];
let catalogue;
const out = "/app/test-results/product-" + (process.argv[2] ?? "read");
mkdirSync(out, { recursive: true });
const emit = (type, value) =>
  console.log(JSON.stringify({ type, at: new Date().toISOString(), ...value }));
const recordUiAction = (action, target) => {
  uiActions.push({
    action,
    target,
    at: new Date().toISOString(),
    channel: "playwright-ui",
  });
};
emit("GUI_SCOPE", { scope: acceptanceScope });
try {
  for await (const c of process.stdin) {
    raw += c;
    if (raw.length > 10000) throw new Error();
  }
  const credentials = JSON.parse(raw);
  raw = "";
  const admin = JSON.parse(readFileSync("/fixture/lab-admin.json", "utf8"));
  browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: "http://localhost:3000",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("response", async (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith("/api/")) {
      const t = r.request().timing();
      if (!r.ok()) {
        try {
          const v = await r.json();
          emit("BFF_REJECTION", { path, status: r.status(), code: v.error });
        } catch {}
      }
      timings.push({
        path,
        status: r.status(),
        milliseconds: Math.round(t.responseStart),
        backend: r.headers()["server-timing"] ?? null,
        channel: "browser-network-observation",
      });
    }
    if (path === "/api/crm/catalog" && r.ok()) {
      try {
        catalogue = await r.json();
      } catch {}
    }
    if (/^\/api\/crm\/instances\/[a-f0-9-]{36}$/.test(path) && r.ok()) {
      try {
        const d = await r.json();
        instances.set(d.instance.instance_id, d);
      } catch {}
    }
    if (
      (/\/api\/observations\/operations\//.test(path) ||
        /^\/api\/incidents\/[a-f0-9-]{36}$/.test(path)) &&
      r.ok()
    ) {
      try {
        const json = await r.json(),
          op = json.operation ?? json;
        seen.set(op.operation_id, {
          status: op.status,
          normalized_status: op.normalized_status,
          error_code: op.error_code,
          phase: op.fulfillment?.phase ?? op.power?.phase ?? null,
          fulfillment_status: op.fulfillment?.status ?? null,
          observed_at: new Date().toISOString(),
          updated_at: op.updated_at,
        });
      } catch {}
    }
  });
  page.on("request", (request) => {
    if (
      request.url().endsWith("/api/crm/commands") &&
      request.method() === "POST"
    ) {
      const body = request.postDataJSON();
      if (body?.action === "create") {
        const payload = body.payload ?? {};
        commandBodies.push({
          action: body.action,
          payloadKeys: Object.keys(payload).sort(),
          hasTechnicalOverrides: [
            "cpu",
            "vcpus",
            "memory",
            "memory_mb",
            "disk",
            "disk_gb",
            "node",
            "node_preference",
            "bridge",
            "vlan_tag",
          ].some((key) => key in payload),
          start_on_create: payload.start_on_create,
          plan_id: payload.plan_id,
          image_id: payload.image_id,
          network_profile_id: payload.network?.profile_id,
        });
      }
    }
  });
  await page.goto("/login");
  recordUiAction("navigate", "/login");
  await page.getByLabel("Usuario", { exact: true }).fill(admin.username);
  await page.getByLabel("Contraseña", { exact: true }).fill(admin.password);
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  recordUiAction("click", "Iniciar sesión");
  phase = "reader connection GUI";
  await page.goto("/administration/connections");
  recordUiAction("navigate", "/administration/connections");
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
    recordUiAction("click", "Guardar y conectar reader");
    await connection
      .getByRole("button", { name: "Desconectar", exact: true })
      .waitFor();
  }
  phase = "operator connection GUI";
  const lifecycle = page.getByRole("region", { name: "Acceso de lifecycle" });
  if (!(await lifecycle.locator("strong").innerText()).includes("Registrado")) {
    const separate = lifecycle.getByRole("button", {
      name: "Usar una credencial operator separada",
      exact: true,
    });
    if (await separate.count()) await separate.click();
    await lifecycle
      .getByLabel("Clave para crear y operar")
      .fill(credentials.lifecycle);
    await lifecycle.getByRole("checkbox").check();
    await lifecycle
      .getByRole("button", { name: "Guardar acceso de operaciones" })
      .click();
    recordUiAction("click", "Guardar acceso operator");
    await page.waitForFunction(() =>
      document
        .querySelector('[aria-label="Acceso de lifecycle"] strong')
        ?.textContent?.includes("Registrado"),
    );
  }
  credentials.observation = "";
  credentials.lifecycle = "";
  await page.screenshot({ path: out + "/connections.png", fullPage: true });
  emit("GUI_ACCESS_CONFIGURED", {
    observation: true,
    lifecycle: true,
    enterpriseStackModified: false,
  });
  phase = "catalog GUI";
  let at = performance.now();
  await page.goto("/crm");
  recordUiAction("navigate", "/crm");
  await page
    .getByRole("button", { name: /Seleccionar producto / })
    .first()
    .waitFor();
  const products = await page
    .getByRole("button", { name: /Seleccionar producto / })
    .count();
  emit("GUI_CATALOG", {
    products,
    loadMs: Math.round(performance.now() - at),
    canSelect: await page
      .getByRole("button", { name: /Seleccionar producto / })
      .first()
      .isEnabled(),
  });
  await page.screenshot({ path: out + "/catalog.png", fullPage: true });
  if (process.argv[2] === "baseline" || process.argv[2] === "read") {
    at = performance.now();
    const inventoryResponse = page.waitForResponse((r) =>
      r.url().includes("/api/crm/instances?"),
    );
    await page
      .getByRole("button", { name: "Mis instancias", exact: true })
      .click();
    recordUiAction("click", "Mis instancias");
    await inventoryResponse;
    await page.getByRole("table").waitFor();
    emit("GUI_INVENTORY", { loadMs: Math.round(performance.now() - at) });
    await page.goto("/workers");
    emit("WORKERS_TEMPLATE", {
      literalElse: (await page.locator("body").innerText()).includes(":else}"),
    });
  } else {
    emit("CATALOG_SCOPE", {
      profiles: catalogue?.profiles.map((p) => ({
        profile: p.profile,
        nodes: p.nodes,
      })),
      plans: catalogue?.plans.map((p) => ({
        id: p.plan_id,
        availability: p.availability,
      })),
    });
    const publishedPlans = catalogue?.plans ?? [],
      publishedImages = catalogue?.images ?? [];
    assert.ok(publishedPlans.length && publishedImages.length);
    const profile = catalogue?.profiles.find((p) => p.profile === "lab-dhcp");
    assert.ok(
      profile?.nodes.length &&
        profile.nodes.every((n) => ["mng01", "mng02"].includes(n)),
    );
    let testName = "iacoc-e2e-061-" + Date.now().toString(36),
      creation,
      selectedPlan,
      selectedImage;
    {
      await page
        .getByRole("button", { name: /Seleccionar producto / })
        .first()
        .click();
      recordUiAction("click", "Seleccionar producto publicado");
      const selectedImageId = await page
        .getByLabel("Sistema operativo", { exact: false })
        .inputValue();
      const selectedPlanName = await page
        .getByRole("heading", { level: 2 })
        .innerText();
      selectedPlan = publishedPlans.find((plan) =>
        selectedPlanName.includes(plan.name),
      );
      selectedImage = publishedImages.find(
        (image) => image.image_id === selectedImageId,
      );
      assert.ok(selectedPlan);
      assert.ok(
        selectedImage &&
          ["certificada", "habilitada"].includes(selectedImage.status) &&
          selectedImage.authorized &&
          selectedImage.availability.available &&
          selectedImage.compatible_plans.includes(selectedPlan.plan_id),
      );
      const startControl = page.getByLabel(
        "Solicitar arranque posterior autorizado",
        { exact: false },
      );
      if (await startControl.isChecked()) await startControl.uncheck();
      await page
        .getByLabel("Nombre de instancia", { exact: true })
        .fill(testName);
      await page
        .getByLabel("Contraseña inicial root")
        .fill(randomBytes(24).toString("base64url"));
      await page.getByRole("button", { name: "Revisar", exact: true }).click();
      recordUiAction("click", "Revisar solicitud comercial");
    }
    async function accepted(action, click) {
      recordUiAction("click", action);
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/crm/commands") &&
          r.request().method() === "POST",
      );
      await click();
      const r = await response,
        v = await r.json();
      if (!r.ok() || v.admission !== "accepted") {
        emit("REQUEST_REJECTED", {
          action,
          status: r.status(),
          code: v.error,
          intentId: v.intentId,
        });
        throw new Error();
      }
      evidence.push({
        action,
        instance_id: v.instance_id,
        operation_id: v.operation_id,
        admitted_at: new Date().toISOString(),
      });
      emit("GUI_ADMISSION", evidence.at(-1));
      await page.getByRole("dialog").waitFor();
      const deadline = Date.now() + 900000;
      while (Date.now() < deadline) {
        const op = seen.get(v.operation_id);
        if (
          op &&
          ["completed", "failed", "uncertain"].includes(op.normalized_status) &&
          (op.normalized_status !== "completed" ||
            !op.fulfillment_status ||
            op.fulfillment_status === "completed")
        ) {
          const result = {
            operation_id: v.operation_id,
            ...op,
            result_observed_at: new Date().toISOString(),
          };
          evidence.at(-1).result = result;
          emit("GUI_OPERATION_RESULT", result);
          if (
            op.normalized_status !== "completed" ||
            (op.fulfillment_status && op.fulfillment_status !== "completed")
          ) {
            emit("GUI_MUTATION_HALTED", {
              action,
              operation_id: v.operation_id,
              normalized_status: op.normalized_status,
              fulfillment_status: op.fulfillment_status,
            });
            throw new Error("MUTATION_NOT_COMPLETED");
          }
          await page.screenshot({
            path: out + "/" + action + "-operation.png",
            fullPage: true,
          });
          await page
            .getByRole("button", { name: "Cerrar detalle", exact: true })
            .click();
          return { ...v, result: op };
        }
        await page.waitForTimeout(1000);
      }
      throw new Error();
    }
    phase = "create GUI";
    creation = await accepted("create", () =>
      page.getByRole("button", { name: "Crear KVM", exact: true }).click(),
    );
    async function open({ expectedPower, expectedStatus } = {}) {
      const detailResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            "/api/crm/instances/" + creation.instance_id && response.ok(),
      );
      await page.goto("/crm?instance=" + creation.instance_id);
      recordUiAction("navigate", "/crm?instance=" + creation.instance_id);
      await page
        .getByRole("heading", { name: testName, exact: true })
        .waitFor();
      const d = await detailResponse.then((response) => response.json());
      instances.set(creation.instance_id, d);
      assert.equal(d?.instance.name, testName);
      assert.equal(d?.instance.instance_id, creation.instance_id);
      if (expectedStatus) assert.equal(d?.instance.status, expectedStatus);
      if (expectedPower) assert.equal(d?.power?.power_state, expectedPower);
      if (expectedPower)
        assert.match(
          await page.locator("body").innerText(),
          new RegExp("Energía\\s+" + expectedPower),
        );
      const isDeleted = d?.instance.status === "deleted";
      if (isDeleted) {
        assert.ok((await page.locator("body").innerText()).includes("deleted"));
        return d;
      }
      selectedPlan ??= publishedPlans.find(
        (plan) =>
          plan.vcpus === d?.instance.vcpus &&
          plan.memory_mb === d?.instance.memory_mb &&
          plan.disk_gb === d?.instance.disk_gb,
      );
      selectedImage ??= publishedImages.find(
        (image) => image.image_id === d?.instance.image,
      );
      assert.equal(d?.instance.infrastructure_kind, "kvm");
      assert.ok(["mng01", "mng02"].includes(d?.instance.node));
      assert.ok(
        d.instance.vmid >= 30000 &&
          ![104, 106, 29000].includes(d.instance.vmid),
      );
      const createCommand = commandBodies.find(
        (body) => body.action === "create",
      );
      if (createCommand) {
        assert.deepEqual(createCommand.payloadKeys.sort(), [
          "access",
          "image_id",
          "name",
          "network",
          "plan_id",
          "start_on_create",
        ]);
        assert.equal(createCommand.hasTechnicalOverrides, false);
        assert.equal(createCommand.start_on_create, false);
        assert.equal(createCommand.plan_id, selectedPlan?.plan_id);
        assert.equal(createCommand.image_id, selectedImage?.image_id);
        assert.equal(createCommand.network_profile_id, "lab-dhcp");
      }
      assert.equal(d.instance.vcpus, selectedPlan?.vcpus);
      assert.equal(d.instance.memory_mb, selectedPlan?.memory_mb);
      assert.equal(d.instance.disk_gb, selectedPlan?.disk_gb);
      assert.equal(d.instance.image, selectedImage?.image_id);
      evidence.find((item) => item.action === "create").hardware = {
        infrastructure_kind: d.instance.infrastructure_kind,
        vmid: d.instance.vmid,
        node: d.instance.node,
        vcpus: d.instance.vcpus,
        memory_mb: d.instance.memory_mb,
        disk_gb: d.instance.disk_gb,
        image: d.instance.image,
        cpu_model: "not_published",
        observed_at: new Date().toISOString(),
      };
      assert.ok((await page.locator("body").innerText()).includes(testName));
      return d;
    }
    await open({ expectedPower: "stopped", expectedStatus: "ready" });
    await page.screenshot({ path: out + "/instance.png", fullPage: true });
    for (const [action, label] of [
      ["start", "Encender"],
      ["reboot", "Reiniciar"],
      ["shutdown", "Apagar"],
      ["start", "Encender"],
      ["shutdown", "Apagar"],
    ]) {
      phase = action + " GUI";
      const expectedBefore = action === "start" ? "stopped" : "running";
      const expectedAfter = action === "shutdown" ? "stopped" : "running";
      await open({ expectedPower: expectedBefore, expectedStatus: "ready" });
      const button = page.getByRole("button", { name: label, exact: true });
      await button.waitFor();
      if (!(await button.isEnabled())) {
        emit("ACTION_UNAVAILABLE", { action });
        throw new Error();
      }
      const result = await accepted(action, () => button.click());
      assert.equal(result.result.normalized_status, "completed");
      await open({ expectedPower: expectedAfter, expectedStatus: "ready" });
    }
    phase = "delete GUI";
    await open({ expectedPower: "stopped", expectedStatus: "ready" });
    await page
      .locator("details summary")
      .filter({ hasText: "Eliminar esta instancia" })
      .click();
    recordUiAction("click", "Eliminar esta instancia");
    await page.getByLabel("Escribe el nombre para confirmar").fill(testName);
    const deleted = await accepted("delete", () =>
      page
        .getByRole("button", { name: "Eliminar instancia real", exact: true })
        .click(),
    );
    assert.equal(deleted.result.normalized_status, "completed");
    await open({ expectedStatus: "deleted" });
    await page.screenshot({ path: out + "/deleted.png", fullPage: true });
    emit("GUI_LIFECYCLE_COMPLETED", { actions: evidence });
  }
  writeFileSync(
    out + "/evidence.json",
    JSON.stringify(
      {
        scope: acceptanceScope,
        evidence,
        uiActions,
        apiObservations: timings,
        commandBodies,
      },
      null,
      2,
    ),
  );
} catch {
  emit("GUI_ACCEPTANCE_INCOMPLETE", { phase, acceptedActions: evidence });
  writeFileSync(
    out + "/evidence.json",
    JSON.stringify(
      {
        scope: acceptanceScope,
        phase,
        evidence,
        uiActions,
        apiObservations: timings,
        commandBodies,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  raw = "";
  await browser?.close();
}
