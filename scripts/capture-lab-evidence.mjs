// Docker only; read-only evidence of the specifically authorized new test instance.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const id = process.argv[2],
  operation = process.argv[3];
if (
  !/^[a-f0-9-]{36}$/.test(id ?? "") ||
  !/^[a-f0-9-]{36}$/.test(operation ?? "")
)
  throw new Error("Explicit test UUIDs required");
let browser;
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
  await page.goto("/crm?instance=" + id);
  await page
    .getByRole("button", { name: "Ver detalle " + operation, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByText("uncertain", { exact: true })
    .first()
    .waitFor();
  await page.screenshot({
    path: "/app/test-results/real060-uncertain.png",
    fullPage: true,
  });
  const reportResponse = await page.request.get("/api/reports/instances/" + id);
  if (!reportResponse.ok()) throw new Error();
  const report = await reportResponse.json();
  writeFileSync(
    "/app/test-results/real060-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      instance_id: id,
      operation_id: operation,
      report_exported: true,
      instance: {
        status: report.instance.status,
        vmid: report.instance.vmid,
        node: report.instance.node,
        infrastructure_kind: report.instance.infrastructure_kind,
      },
      operations: report.operations.map((o) => ({
        id: o.operation_id,
        status: o.status,
        normalized_status: o.normalized_status,
        error_code: o.error_code,
        events: o.operation_events.map((e) => ({
          code: e.code,
          actor: e.actor,
          utc: e.created_at,
        })),
      })),
    }),
  );
  if (process.argv[4] === "reconcile") {
    await page.getByRole("button", { name: "Cerrar detalle" }).click();
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/crm/commands") &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Observar operación incierta", exact: true })
      .click();
    const accepted = await (await response).json();
    console.log(
      JSON.stringify({
        action: "manual_observation_reconcile",
        instance_id: accepted.instance_id,
        operation_id: accepted.operation_id,
        admission: accepted.admission ?? accepted.status,
        error: accepted.error ?? null,
      }),
    );
    if (accepted.operation_id) {
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const result = await page.request.get(
          "/api/observations/operations/" + accepted.operation_id,
        );
        const op = await result.json();
        console.log(
          JSON.stringify({
            reconciliation_evidence: true,
            operation_id: accepted.operation_id,
            status: op.status,
            normalized_status: op.normalized_status,
            error_code: op.error_code,
          }),
        );
        if (["completed", "failed", "uncertain"].includes(op.normalized_status))
          break;
      }
    }
  }
  await context.close();
} catch {
  console.error("EVIDENCE_CAPTURE_FAILED: no sensitive details emitted");
  process.exitCode = 1;
} finally {
  await browser?.close();
}
