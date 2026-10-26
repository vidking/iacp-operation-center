// Docker-only acceptance. Secrets on stdin, GUI mutations only, no traces or request bodies logged.
import { assertReadOnlyAcceptance } from "./real-e2e-policy.mjs";
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
assertReadOnlyAcceptance(process.argv[2]);

let browser,
  raw = "",
  phase = "login";
const evidence = [],
  timings = [],
  seen = new Map(),
  instances = new Map(),
  commandBodies = [];
let catalogue;
const out = "/app/test-results/product-" + (process.argv[2] ?? "read");
mkdirSync(out, { recursive: true });
const emit = (type, value) =>
  console.log(JSON.stringify({ type, at: new Date().toISOString(), ...value }));
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
  await page.getByLabel("Usuario", { exact: true }).fill(admin.username);
  await page.getByLabel("Contraseña", { exact: true }).fill(admin.password);
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  phase = "reader connection GUI";
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
  phase = "operator connection GUI";
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
  await page.screenshot({ path: out + "/connections.png", fullPage: true });
  emit("GUI_ACCESS_CONFIGURED", {
    observation: true,
    lifecycle: true,
    enterpriseStackModified: false,
  });
  phase = "catalog GUI";
  let at = performance.now();
  await page.goto("/crm");
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
  if (!["lifecycle", "resume", "continue"].includes(process.argv[2])) {
    at = performance.now();
    const inventoryResponse = page.waitForResponse((r) =>
      r.url().includes("/api/crm/instances?"),
    );
    await page
      .getByRole("button", { name: "Mis instancias", exact: true })
      .click();
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
    if (!["resume", "continue"].includes(process.argv[2])) {
      await page
        .getByRole("button", { name: /Seleccionar producto / })
        .first()
        .click();
      const selectedImageId = await page
        .getByLabel("Sistema operativo", { exact: true })
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
    }
    async function accepted(action, click) {
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
    if (["resume", "continue"].includes(process.argv[2])) {
      const prior = JSON.parse(
        readFileSync(
          "/app/test-results/product-lifecycle/evidence.json",
          "utf8",
        ),
      );
      creation = prior.evidence.find((e) => e.action === "create");
      assert.ok(creation);
      evidence.push(creation);
      phase = "diagnose same new UUID";
      await page.goto("/crm?instance=" + creation.instance_id);
      await page
        .getByRole("heading", { level: 2 })
        .filter({ hasText: /iacoc-e2e-061-/ })
        .waitFor();
      const d = instances.get(creation.instance_id);
      assert.ok(d);
      testName = d.instance.name;
      assert.ok(testName.startsWith("iacoc-e2e-061-"));
      selectedImage = publishedImages.find(
        (image) => image.image_id === d.instance.image,
      );
      selectedPlan = publishedPlans.find(
        (plan) =>
          plan.vcpus === d.instance.vcpus &&
          plan.memory_mb === d.instance.memory_mb &&
          plan.disk_gb === d.instance.disk_gb,
      );
      if (process.argv[2] === "continue") {
        await page.goto("/operations?operation=" + creation.operation_id);
        await page.getByRole("dialog").waitFor();
        const deadline = Date.now() + 900000;
        while (Date.now() < deadline) {
          const op = seen.get(creation.operation_id);
          if (
            op?.normalized_status === "completed" &&
            (!op.fulfillment_status || op.fulfillment_status === "completed")
          ) {
            creation.result = op;
            emit("GUI_DELIVERY_RESULT", {
              operation_id: creation.operation_id,
              ...op,
            });
            break;
          }
          await page.waitForTimeout(1000);
        }
        if (!creation.result) throw new Error();
        await page
          .getByRole("button", { name: "Cerrar detalle", exact: true })
          .click();
      } else {
        await page.goto("/incidents?operation=" + creation.operation_id);
        const confirm = page.getByLabel("Confirma UUID de instancia");
        await confirm.waitFor();
        await page.screenshot({
          path: out + "/uncertain-diagnosis.png",
          fullPage: true,
        });
        await confirm.fill(creation.instance_id);
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith("/reconcile") && r.request().method() === "POST",
        );
        await page
          .getByRole("button", {
            name: "Solicitar reconciliación",
            exact: true,
          })
          .click();
        const r = await response,
          v = await r.json();
        if (!r.ok() || v.admission !== "accepted") {
          emit("RECOVERY_NOT_ACCEPTED", { status: r.status(), code: v.error });
          throw new Error();
        }
        evidence.push({
          action: "reconcile",
          instance_id: v.instance_id,
          operation_id: v.operation_id,
        });
        emit("GUI_RECOVERY_ADMISSION", evidence.at(-1));
        phase = "follow reconciliation UI";
        const deadline = Date.now() + 900000;
        while (Date.now() < deadline) {
          const op = seen.get(v.operation_id);
          if (
            op?.normalized_status === "completed" &&
            (!op.fulfillment_status || op.fulfillment_status === "completed")
          ) {
            creation.result = op;
            emit("GUI_RECOVERY_COMPLETED", {
              operation_id: v.operation_id,
              ...op,
            });
            break;
          }
          if (op?.normalized_status === "failed") throw new Error();
          await page.waitForTimeout(1000);
        }
        if (!creation.result) throw new Error();
        await page.screenshot({
          path: out + "/recovery-completed.png",
          fullPage: true,
        });
        await page
          .getByRole("button", { name: "Cerrar incidente", exact: true })
          .click();
      }
    } else {
      phase = "create GUI";
      creation = await accepted("create", () =>
        page
          .getByRole("button", { name: "Crear instancia real", exact: true })
          .click(),
      );
      if (creation.result.normalized_status !== "completed") throw new Error();
    }
    async function open() {
      await page.goto("/crm?instance=" + creation.instance_id);
      await page
        .getByRole("heading", { name: testName, exact: true })
        .waitFor();
      const d = instances.get(creation.instance_id);
      assert.equal(d?.instance.name, testName);
      assert.equal(d?.instance.instance_id, creation.instance_id);
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
        observed_at: new Date().toISOString(),
      };
      assert.ok((await page.locator("body").innerText()).includes(testName));
    }
    await open();
    await page.screenshot({ path: out + "/instance.png", fullPage: true });
    for (const [action, label] of [
      ["start", "Encender"],
      ["shutdown", "Apagar"],
      ["reboot", "Reiniciar"],
      ["shutdown", "Apagar"],
    ]) {
      phase = action + " GUI";
      await open();
      const button = page.getByRole("button", { name: label, exact: true });
      await button.waitFor();
      if (!(await button.isEnabled())) {
        emit("ACTION_UNAVAILABLE", { action });
        throw new Error();
      }
      const result = await accepted(action, () => button.click());
      if (
        result.result.normalized_status !== "completed" &&
        action !== "reboot"
      )
        throw new Error();
    }
    phase = "delete GUI";
    await open();
    await page
      .locator("details summary")
      .filter({ hasText: "Eliminar esta instancia" })
      .click();
    await page.getByLabel("Escribe el nombre para confirmar").fill(testName);
    const deleted = await accepted("delete", () =>
      page
        .getByRole("button", { name: "Eliminar instancia real", exact: true })
        .click(),
    );
    assert.equal(deleted.result.normalized_status, "completed");
    await open();
    assert.ok((await page.locator("body").innerText()).includes("deleted"));
    await page.screenshot({ path: out + "/deleted.png", fullPage: true });
    emit("GUI_LIFECYCLE_COMPLETED", { actions: evidence });
  }
  writeFileSync(
    out + "/evidence.json",
    JSON.stringify({ evidence, timings, commandBodies }, null, 2),
  );
} catch {
  emit("GUI_ACCEPTANCE_INCOMPLETE", { phase, acceptedActions: evidence });
  writeFileSync(
    out + "/evidence.json",
    JSON.stringify({ phase, evidence, timings, commandBodies }, null, 2),
  );
  process.exitCode = 1;
} finally {
  raw = "";
  await browser?.close();
}
