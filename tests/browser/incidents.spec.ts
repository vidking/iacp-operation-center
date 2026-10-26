import { test, expect, signIn } from "./fixtures";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
test("incidents correlate deleted VM 30028, preserve failure and only reconcile eligible active evidence", async ({
  browser,
}) => {
  const filename = ".artifacts/e2e-4179/upstream.json";
  const state = JSON.parse(readFileSync(filename, "utf8"));
  const time = "2026-10-26T06:49:05Z",
    deletedId = "a5318da2-79bd-485f-b334-79ba739f3666",
    rebootId = "1869769b-cfed-4101-97a5-7a6ecd77256c",
    activeId = randomUUID(),
    uncertainId = randomUUID();
  const instance = (id: string, status: string) => ({
    instance_id: id,
    tenant_id: state.tenant,
    operation_id: uncertainId,
    name: id === deletedId ? "historical-vm-30028" : "recoverable-test-vm",
    image: "test-image",
    vcpus: 1,
    memory_mb: 512,
    disk_gb: 8,
    status,
    infrastructure_kind: "kvm",
    vmid: id === deletedId ? 30028 : 30029,
    node: "mng01",
    ip_addresses: [],
    power: "running",
    created_at: time,
    updated_at: time,
  });
  const operation = (id: string, instanceId: string, uncertain = false) => ({
    operation_id: id,
    instance_id: instanceId,
    kind: uncertain ? "instance.create" : "instance.power.reboot",
    status: "failed",
    normalized_status: uncertain ? "uncertain" : "failed",
    error_code: uncertain ? "PROVISIONING_UNCERTAIN" : "POWER_ACPI_TIMEOUT",
    requested_by: "redacted-operator",
    recovery_required: uncertain,
    created_at: time,
    updated_at: time,
    events: [
      {
        id: 1,
        status: "failed",
        code: uncertain ? "PROVISIONING_UNCERTAIN" : "POWER_ACPI_TIMEOUT",
        actor: "IACP",
        created_at: time,
      },
    ],
  });
  state.instances = [
    instance(deletedId, "deleted"),
    instance(activeId, "ready"),
  ];
  state.operations = [
    operation(rebootId, deletedId),
    operation(uncertainId, activeId, true),
  ];
  state.events = [
    {
      event_id: 1,
      operation_id: rebootId,
      instance_id: deletedId,
      tenant_id: state.tenant,
      correlation_id: "redacted-correlated-reboot",
      occurred_at: time,
      kind: "power.failed",
      status: "failed",
      code: "POWER_ACPI_TIMEOUT",
      actor: "redacted-lifecycle",
      service: "Lifecycle Worker",
    },
  ];
  writeFileSync(filename, JSON.stringify(state));
  const context = await browser.newContext({
      baseURL: "http://127.0.0.1:4179",
    }),
    page = await context.newPage();
  await signIn(page, "Administrator", "demo", 4179);
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
    .getByLabel("Clave para crear y operar")
    .fill(state.operatorToken);
  await lifecycle.getByRole("checkbox").check();
  await lifecycle
    .getByRole("button", { name: "Guardar acceso de operaciones" })
    .click();
  await expect(lifecycle).toContainText("Configurado");
  await page.goto("/incidents");
  await expect(
    page.getByRole("cell", { name: /Cerrado por estado posterior/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "instance.power.reboot", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("POWER_ACPI_TIMEOUT");
  await expect(dialog).toContainText("Recurso eliminado");
  await expect(dialog).toContainText("redacted-correlated-reboot");
  await expect(
    dialog.getByRole("button", { name: "Solicitar reconciliación" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/incidents-desktop.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Consultar operación", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("failed");
  await page.getByRole("button", { name: "Cerrar detalle" }).click();
  await page.goto("/incidents?operation=" + rebootId);
  await expect(page.getByRole("dialog")).toContainText("Recurso eliminado");
  await page.getByRole("link", { name: "Ver instancia CRM" }).click();
  await expect(
    page.getByRole("heading", { name: "historical-vm-30028", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reiniciar", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Observar operación incierta",
      exact: true,
    }),
  ).toBeDisabled();
  await page.goto("/incidents?operation=" + uncertainId);
  await expect(
    page.getByRole("button", { name: "Solicitar reconciliación" }),
  ).toBeDisabled();
  await page.getByLabel("Confirma UUID de instancia").fill(activeId);
  await expect(
    page.getByRole("button", { name: "Solicitar reconciliación" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Solicitar reconciliación" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Solicitud aceptada" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("completed");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/incidents?operation=" + rebootId);
  await expect(page.getByRole("dialog")).toContainText("Recurso eliminado");
  await page.screenshot({
    path: "test-results/incidents-mobile.png",
    fullPage: true,
  });
  await page.goto("/workers");
  await expect(page.locator("body")).not.toContainText(":else}");
  await context.close();
});

test("planning continuation and retry use published attempts and API operations from the instance GUI", async ({
  browser,
}) => {
  const filename = ".artifacts/e2e-4179/upstream.json";
  const state = JSON.parse(readFileSync(filename, "utf8"));
  const instance = state.instances.find(
    (i: { status: string }) => i.status === "ready",
  );
  const op = state.operations.find(
    (o: { instance_id: string; kind: string }) =>
      o.instance_id === instance.instance_id && o.kind === "instance.create",
  );
  Object.assign(op, {
    status: "failed",
    normalized_status: "failed",
    recovery_required: false,
    provisioning: {
      service: "provisioning",
      phase: "failed",
      attempt: 2,
      started_at: null,
      finished_at: null,
    },
  });
  instance.infrastructure_kind = "unprovisioned";
  writeFileSync(filename, JSON.stringify(state));
  const context = await browser.newContext({
      baseURL: "http://127.0.0.1:4179",
    }),
    page = await context.newPage();
  await signIn(page, "Administrator", "demo", 4179);
  page.on("dialog", (d) => d.accept());
  await page.goto("/crm?instance=" + instance.instance_id);
  await page
    .locator("details summary")
    .filter({ hasText: "Red, acceso y continuación autorizada" })
    .click();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/crm/commands") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Reintentar planificación", exact: true })
    .click();
  const sent = (await response).request().postDataJSON();
  expect(sent.payload).toEqual({ expected_attempt: 2 });
  expect(sent.instanceId).toBe(instance.instance_id);
  await expect(page.getByRole("dialog")).toContainText("completed");
  await page.getByRole("button", { name: "Cerrar detalle" }).click();
  const latest = JSON.parse(readFileSync(filename, "utf8"));
  const original = latest.operations.find(
    (o: { operation_id: string }) => o.operation_id === op.operation_id,
  );
  original.normalized_status = "queued";
  original.provisioning.phase = "planned";
  writeFileSync(filename, JSON.stringify(latest));
  await page.goto("/crm?instance=" + instance.instance_id);
  await page
    .locator("details summary")
    .filter({ hasText: "Red, acceso y continuación autorizada" })
    .click();
  await page
    .getByRole("button", { name: "Continuar aprovisionamiento", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("completed");
  expect(
    JSON.parse(readFileSync(filename, "utf8")).commands.filter(
      (c: { action: string }) => c.action === "create",
    ),
  ).toHaveLength(0);
  await context.close();
});
