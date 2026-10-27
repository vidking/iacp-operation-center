// Docker-only acceptance. Secrets on stdin, GUI mutations only, no traces or request bodies logged.
import {
  acceptanceOption,
  assertAuthorizedAcceptance,
} from "./real-e2e-policy.mjs";
import {
  publishedHardwareEvidence,
  readHardwareEvidence,
} from "./hardware-evidence.mjs";
import { chromium } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const mode = process.argv[2] ?? "read";
const options = process.argv.slice(4);
const acceptanceScope = assertAuthorizedAcceptance(
  mode,
  process.argv[3],
  options,
);
const continuation = mode === "continue";
const stopAfterProvision = options.includes("--stop-after-provision");
const checkpointPath = acceptanceOption(options, "--checkpoint=");
const hardwareEvidencePath = acceptanceOption(options, "--hardware-evidence=");

let browser,
  raw = "",
  phase = "login",
  stopAtCheckpoint = false;
const evidence = [],
  timings = [],
  uiActions = [],
  seen = new Map(),
  instances = new Map(),
  commandBodies = [];
let catalogue;
const out = "/app/test-results/product-" + mode;
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
const writeEvidence = (extra = {}) =>
  writeFileSync(
    out + "/evidence.json",
    JSON.stringify(
      {
        scope: acceptanceScope,
        ...extra,
        evidence,
        uiActions,
        apiObservations: timings,
        commandBodies,
      },
      null,
      2,
    ),
  );
emit("GUI_SCOPE", { scope: acceptanceScope });
try {
  for await (const c of process.stdin) {
    raw += c;
    if (raw.length > 10000) throw new Error();
  }
  const credentials = JSON.parse(raw);
  raw = "";
  const admin = JSON.parse(readFileSync("/fixture/lab-admin.json", "utf8"));
  const checkpoint = continuation
    ? JSON.parse(readFileSync(checkpointPath, "utf8"))
    : null;
  if (!continuation && existsSync(out + "/checkpoint.json"))
    throw new Error("SINGLE_RUN_CHECKPOINT_ALREADY_EXISTS");
  browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: "http://localhost:3000",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  let nextCreateRequestResolve;
  await page.route("**/api/crm/commands", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const body = request.postDataJSON();
    if (body?.action !== "create") return route.continue();
    const payload = body.payload ?? {};
    const audit = {
      action: body.action,
      payloadKeys: Object.keys(payload).sort(),
      hasTechnicalOverrides: [
        "cpu",
        "cpu_model",
        "vcpus",
        "memory",
        "memory_mb",
        "disk",
        "disk_gb",
        "node",
        "node_preference",
        "bridge",
        "vlan_tag",
        "firmware",
        "numa",
        "controller",
      ].some((key) => key in payload),
      start_on_create: payload.start_on_create,
      plan_id: payload.plan_id,
      image_id: payload.image_id,
      network_profile_id: payload.network?.profile_id,
    };
    commandBodies.push(audit);
    nextCreateRequestResolve?.(audit);
    nextCreateRequestResolve = undefined;
    if (audit.hasTechnicalOverrides) {
      emit("GUI_MUTATION_HALTED", {
        action: "create",
        reason: "TECHNICAL_OVERRIDE_DETECTED",
      });
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
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
  await connection.waitFor();
  const disconnectButton = connection.getByRole("button", {
    name: "Desconectar",
    exact: true,
  });
  const connected = await disconnectButton
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!connected) {
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
    await disconnectButton.waitFor({ state: "visible" });
  }
  const testConnection = connection.getByRole("button", {
    name: "Probar conexión",
    exact: true,
  });
  await testConnection.waitFor({ state: "visible" });
  await testConnection.click();
  recordUiAction("click", "Probar conexión reader");
  // The click starts an async validation and the button remains visible while
  // it runs.  Do not navigate to CRM until the GUI has rendered the terminal
  // success state; otherwise catalog can race the persisted validation and
  // receive VALIDATION_REQUIRED even though the check is already succeeding.
  await page
    .getByRole("status")
    .filter({ hasText: "Prueba correcta" })
    .waitFor({ state: "visible" });
  await disconnectButton.waitFor({ state: "visible" });
  credentials.observation = "";
  await page.screenshot({ path: out + "/connections.png", fullPage: true });
  emit("GUI_ACCESS_CONFIGURED", {
    observation: true,
    enterpriseStackModified: false,
  });
  phase = "catalog GUI";
  let at = performance.now();
  await page.goto("/crm");
  recordUiAction("navigate", "/crm");
  await page
    .getByRole("button", { name: "Crear KVM", exact: true })
    .first()
    .waitFor();
  const products = await page
    .getByRole("button", { name: "Crear KVM", exact: true })
    .count();
  emit("GUI_CATALOG", {
    products,
    loadMs: Math.round(performance.now() - at),
    canSelect: await page
      .getByRole("button", { name: "Crear KVM", exact: true })
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
      tenant_id: catalogue?.usage?.tenant_id,
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
    assert.equal(catalogue?.usage?.tenant_id, admin.tenantId);
    const profile = catalogue?.profiles.find((p) => p.profile === "lab-dhcp");
    assert.ok(
      profile?.nodes.length &&
        profile.nodes.every((n) => ["mng01", "mng02"].includes(n)),
    );
    let testName = "iacoc-e2e-063-" + Date.now().toString(36),
      creation,
      selectedPlan,
      selectedImage;
    if (continuation) {
      assert.equal(checkpoint.scope, "single-disposable-mng-provision");
      assert.equal(checkpoint.tenant_id, admin.tenantId);
      assert.match(checkpoint.name, /^iacoc-e2e-063-/);
      testName = checkpoint.name;
      creation = {
        instance_id: checkpoint.instance_id,
        operation_id: checkpoint.operation_id,
      };
      selectedPlan = publishedPlans.find(
        (plan) => plan.plan_id === checkpoint.plan_id,
      );
      selectedImage = publishedImages.find(
        (image) => image.image_id === checkpoint.image,
      );
      assert.ok(selectedPlan && selectedImage);
      evidence.push({
        action: "create",
        instance_id: creation.instance_id,
        operation_id: creation.operation_id,
        admitted_at: checkpoint.admitted_at,
        resumed: true,
      });
      recordUiAction("resume", "checkpoint:" + creation.instance_id);
    } else {
      await page
        .getByRole("button", { name: "Crear KVM", exact: true })
        .first()
        .click();
      recordUiAction("click", "Seleccionar KVM 1");
      selectedPlan = publishedPlans.find((plan) => plan.plan_id === "kvm-1");
      assert.ok(selectedPlan);
      await page
        .getByLabel("Sistema operativo", { exact: false })
        .selectOption("ubuntu-2404");
      const selectedImageId = "ubuntu-2404";
      const selectedPlanName = await page
        .getByRole("heading", { level: 2 })
        .innerText();
      assert.ok(selectedPlanName.includes(selectedPlan.name));
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
      assert.equal(
        await page.getByLabel("Red publicada").inputValue(),
        "lab-dhcp",
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
      assert.ok(
        await page
          .getByRole("button", { name: "Crear KVM", exact: true })
          .isEnabled(),
      );
    }
    async function accepted(action, click) {
      recordUiAction("click", action);
      let createRequest;
      if (action === "create")
        createRequest = new Promise((resolve) => {
          nextCreateRequestResolve = resolve;
        });
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/crm/commands") &&
          r.request().method() === "POST",
      );
      await click();
      if (createRequest) {
        const requestAudit = await createRequest;
        if (requestAudit.hasTechnicalOverrides)
          throw new Error("TECHNICAL_OVERRIDE_DETECTED");
      }
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
    if (!continuation) {
      phase = "create GUI";
      creation = await accepted("create", () =>
        page.getByRole("button", { name: "Crear KVM", exact: true }).click(),
      );
    }
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
      assert.equal(d?.instance.operation_id, creation.operation_id);
      if (checkpoint) {
        assert.equal(d?.instance.vmid, checkpoint.vmid);
        assert.equal(d?.instance.node, checkpoint.node);
        assert.equal(d?.instance.image, checkpoint.image);
      }
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
          ![104, 106, 29000, 30029].includes(d.instance.vmid),
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
      const publicHardware = publishedHardwareEvidence(d);
      const createEvidence = evidence.find((item) => item.action === "create");
      assert.ok(createEvidence);
      createEvidence.hardware = {
        infrastructure_kind: d.instance.infrastructure_kind,
        vmid: d.instance.vmid,
        node: d.instance.node,
        vcpus: d.instance.vcpus,
        memory_mb: d.instance.memory_mb,
        disk_gb: d.instance.disk_gb,
        image: d.instance.image,
        cpu_model: publicHardware?.cpu_model ?? null,
        cpu_model_source: publicHardware?.source ?? null,
        cpu_model_certified: publicHardware?.certified ?? false,
        observed_at: new Date().toISOString(),
      };
      assert.ok((await page.locator("body").innerText()).includes(testName));
      return d;
    }
    phase = continuation ? "resume provisioned GUI" : "provisioned GUI";
    const provisioned = await open({
      expectedPower: "stopped",
      expectedStatus: "ready",
    });
    const createEvidence = evidence.find((item) => item.action === "create");
    assert.ok(createEvidence);
    const checkpoint = {
      scope: "single-disposable-mng-provision",
      tenant_id: admin.tenantId,
      name: testName,
      instance_id: creation.instance_id,
      operation_id: creation.operation_id,
      plan_id: selectedPlan?.plan_id,
      image: selectedImage?.image_id,
      network_profile: "lab-dhcp",
      vmid: provisioned.instance.vmid,
      node: provisioned.instance.node,
      status: provisioned.instance.status,
      power_state: provisioned.power?.power_state,
      admitted_at: createEvidence.admitted_at,
      observed_at: new Date().toISOString(),
    };
    if (!continuation) {
      writeFileSync(
        out + "/checkpoint.json",
        JSON.stringify(checkpoint, null, 2),
        {
          mode: 0o600,
        },
      );
      const publicHardware = publishedHardwareEvidence(provisioned);
      if (stopAfterProvision || !publicHardware) {
        emit("GUI_PROVISION_CHECKPOINT", {
          instance_id: checkpoint.instance_id,
          operation_id: checkpoint.operation_id,
          vmid: checkpoint.vmid,
          node: checkpoint.node,
          hardware: createEvidence.hardware,
          lifecycle: "blocked_pending_hardware_evidence",
        });
        emit("HARDWARE_EVIDENCE_REQUIRED", {
          instance_id: checkpoint.instance_id,
          operation_id: checkpoint.operation_id,
          source: "IACP_PUBLIC_CONTRACT_OR_MANUAL_READ_ONLY_ATTESTATION",
        });
        writeEvidence({
          phase: "awaiting_hardware_evidence",
          checkpoint,
        });
        stopAtCheckpoint = true;
      }
    } else {
      const hardware = readHardwareEvidence(hardwareEvidencePath, {
        instance_id: provisioned.instance.instance_id,
        operation_id: provisioned.instance.operation_id,
        image: provisioned.instance.image,
      });
      assert.equal(hardware.vmid, provisioned.instance.vmid);
      assert.equal(hardware.node, provisioned.instance.node);
      assert.equal(
        hardware.vcpus ?? provisioned.instance.vcpus,
        provisioned.instance.vcpus,
      );
      assert.equal(
        hardware.memory_mb ?? provisioned.instance.memory_mb,
        provisioned.instance.memory_mb,
      );
      assert.equal(
        hardware.disk_gb ?? provisioned.instance.disk_gb,
        provisioned.instance.disk_gb,
      );
      createEvidence.hardware.cpu_model = hardware.cpu_model;
      createEvidence.hardware.cpu_model_source = hardware.source;
      createEvidence.hardware.cpu_model_certified = true;
      emit("HARDWARE_EVIDENCE_VERIFIED", {
        instance_id: provisioned.instance.instance_id,
        operation_id: provisioned.instance.operation_id,
        vmid: hardware.vmid,
        node: hardware.node,
        source: hardware.source,
      });
    }
    if (!stopAtCheckpoint) {
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
  }
  writeEvidence({
    phase: stopAtCheckpoint ? "awaiting_hardware_evidence" : "completed",
    ...(stopAtCheckpoint ? { checkpoint } : {}),
  });
} catch (error) {
  const diagnostic =
    error instanceof Error ? error.message : "GUI_ACCEPTANCE_INCOMPLETE";
  emit("GUI_ACCEPTANCE_INCOMPLETE", {
    phase,
    diagnostic,
    acceptedActions: evidence,
  });
  writeEvidence({ phase, diagnostic });
  process.exitCode = 1;
} finally {
  raw = "";
  await browser?.close();
}
