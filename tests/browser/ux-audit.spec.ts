import { test, expect, signIn } from "./fixtures";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const port = 4181;
const fixtureFile = `.artifacts/e2e-${port}/upstream.json`;
const evidencePhase =
  process.env.UX_AUDIT_PHASE === "after" ? "after" : "before";
const evidenceDir = `docs/evidence/ux-ui/${evidencePhase}`;
const primaryRoutes = [
  ["overview", "/"],
  ["operations", "/operations"],
  ["events", "/events"],
  ["workers", "/workers"],
  ["incidents", "/incidents"],
] as const;
const supplementalRoutes = [
  ["crm", "/crm"],
  ["users", "/administration/users"],
] as const;
const auditedRoutes =
  evidencePhase === "after"
    ? [...primaryRoutes, ...supplementalRoutes]
    : primaryRoutes;
const auditWidths = [390, 768, 1024, 1366, 1440, 1920] as const;
const captureWidths = [390, 1440] as const;
const requestedRoute = process.env.UX_AUDIT_ROUTE;
const routeSet = requestedRoute
  ? auditedRoutes.filter(([name]) => name === requestedRoute)
  : process.env.UX_AUDIT_QUICK
    ? auditedRoutes.slice(0, 1)
    : auditedRoutes;
const requestedWidth = Number(process.env.UX_AUDIT_WIDTH);
const widthSet =
  Number.isFinite(requestedWidth) && requestedWidth > 0
    ? [requestedWidth]
    : process.env.UX_AUDIT_QUICK
      ? ([1440] as const)
      : auditWidths;

function seedReadableOperationalState() {
  const state = JSON.parse(readFileSync(fixtureFile, "utf8"));
  const instances = Array.from({ length: 4 }, (_, index) => {
    const suffix = String(index + 1).padStart(12, "0");
    return {
      instance_id: `00000000-0000-4000-8000-${suffix}`,
      tenant_id: state.tenant,
      operation_id: `10000000-0000-4000-8000-${suffix}`,
      name: [
        "control-plane-api",
        "billing-worker",
        "observability-kvm",
        "staging-runner",
      ][index],
      image: "ubuntu-2404",
      vcpus: index + 1,
      memory_mb: 1024 * (index + 2),
      disk_gb: 30 + index * 10,
      status: index === 3 ? "provisioning" : "ready",
      infrastructure_kind: "kvm",
      vmid: 30059 + index,
      node: index % 2 ? "mng02" : "mng01",
      ip_addresses: index === 1 ? ["10.40.50.22"] : [],
      power: index === 3 ? "stopped" : "running",
      created_at: "2026-10-27T20:00:00.000Z",
      updated_at: "2026-10-28T01:43:42.000Z",
    };
  });
  const operations = Array.from({ length: 72 }, (_, index) => {
    const instance = instances[index % instances.length];
    const suffix = String(index + 1).padStart(12, "0");
    const failed = index % 13 === 0;
    const uncertain = !failed && index % 17 === 0;
    const status = failed
      ? "failed"
      : uncertain
        ? "uncertain"
        : index % 23 === 0
          ? "running"
          : "completed";
    const timestamp = new Date(
      Date.parse("2026-10-28T01:43:42.000Z") - index * 75_000,
    ).toISOString();
    return {
      operation_id: `10000000-0000-4000-8000-${suffix}`,
      instance_id: instance.instance_id,
      kind: failed
        ? "instance.delete"
        : index % 3 === 0
          ? "instance.power.shutdown"
          : "instance.network.initialize",
      status,
      normalized_status: status,
      requested_by: "ux-audit",
      error_code: failed
        ? "PLAN_INTEGRITY_FAILED"
        : uncertain
          ? "UPSTREAM_CURSOR_STALLED"
          : null,
      recovery_required: failed || uncertain,
      created_at: timestamp,
      updated_at: timestamp,
      events: [],
    };
  });
  const events = operations.slice(0, 48).map((operation, index) => ({
    event_id: index + 1,
    correlation_id: operation.operation_id,
    operation_id: operation.operation_id,
    instance_id: operation.instance_id,
    tenant_id: state.tenant,
    occurred_at: operation.updated_at,
    kind: operation.kind + "." + operation.normalized_status,
    status: operation.normalized_status,
    code: operation.error_code ?? "OPERATION_COMPLETED",
    actor: index % 2 ? "IaC Worker" : "IACP Orchestrator",
    service: index % 2 ? "IaC Worker" : "IACP Orchestrator",
  }));
  state.commercial = true;
  state.acceptance20 = true;
  state.catalogBlocked = false;
  state.instances = instances;
  state.operations = operations;
  state.events = events;
  state.commands = [];
  delete state.deleteFailureCode;
  writeFileSync(fixtureFile, JSON.stringify(state), { mode: 0o600 });
  return state as { token: string };
}

async function ensureConnection(
  page: import("@playwright/test").Page,
  token: string,
) {
  await page.goto("/administration/connections");
  const csrf = await page
    .locator('form[action="/logout"] input[name="_csrf"]')
    .inputValue();
  const response = await page.request.post("/api/admin/setup", {
    data: { credential: token },
    headers: {
      Origin: `http://127.0.0.1:${port}`,
      "X-CSRF-Token": csrf,
    },
  });
  if (!response.ok())
    throw new Error(
      `Fixture setup HTTP ${response.status()}: ${await response.text()}`,
    );
  await page.request.get("/api/observations/sync");
  await page.goto("/");
  await expect(
    page.getByText("Conectado", { exact: true }).first(),
  ).toBeVisible();
}

async function inspectPage(
  page: import("@playwright/test").Page,
  route: string,
  width: number,
) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main")).toBeVisible();
  await page.waitForTimeout(700);
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    const fontEntries = [...document.querySelectorAll("body *")].map(
      (node) => ({
        node,
        value: Number.parseFloat(getComputedStyle(node).fontSize),
      }),
    );
    const readableFontEntries = fontEntries.filter(({ node, value }) => {
      const style = getComputedStyle(node);
      return Boolean(
        Number.isFinite(value) &&
        node.textContent?.trim() &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        !["SVG", "PATH"].includes(node.tagName),
      );
    });
    const smallest = readableFontEntries.length
      ? Math.min(...readableFontEntries.map(({ value }) => value))
      : null;
    return {
      innerWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      navigationMs: navigation?.domContentLoadedEventEnd ?? null,
      tableRows: document.querySelectorAll("table tbody tr").length,
      panelCount: document.querySelectorAll(".panel").length,
      smallestFontPx: smallest,
      smallestFontNodes: readableFontEntries
        .filter(
          ({ value, node }) => value === smallest && node.textContent?.trim(),
        )
        .slice(0, 8)
        .map(({ node }) => ({
          tag: node.tagName,
          className: node.className,
          text: node.textContent?.trim().slice(0, 80),
        })),
      h1: document.querySelector("h1")?.textContent?.trim() ?? null,
      asideText:
        document.querySelector("aside")?.textContent?.trim().slice(0, 100) ??
        null,
      sidebarScrollTop:
        (document.querySelector(".sidebar-scroll") as HTMLElement | null)
          ?.scrollTop ?? null,
      dependencyRect: (() => {
        const rect = document
          .querySelector(".dependency-rail")
          ?.getBoundingClientRect();
        return rect
          ? { left: rect.left, top: rect.top, width: rect.width }
          : null;
      })(),
      layoutRects: Object.fromEntries(
        [
          ".operations-table-wrap",
          ".operations-table",
          ".advanced-filter-content",
          ".incidents-table-wrap",
        ].map((selector) => {
          const rect = document
            .querySelector(selector)
            ?.getBoundingClientRect();
          return [
            selector,
            rect
              ? { left: rect.left, right: rect.right, width: rect.width }
              : null,
          ];
        }),
      ),
      layoutStyles: Object.fromEntries(
        [".operations-table-wrap", ".operations-table"].map((selector) => {
          const node = document.querySelector(selector) as HTMLElement | null;
          if (!node) return [selector, null];
          const style = getComputedStyle(node);
          return [
            selector,
            {
              overflowX: style.overflowX,
              display: style.display,
              minWidth: style.minWidth,
              position: style.position,
            },
          ];
        }),
      ),
      selectorFonts: Object.fromEntries(
        [
          ".brand small",
          ".workspace-tag",
          ".nav-label",
          ".sandbox-note p",
          ".sidebar-help",
          ".sidebar-help span",
        ].map((selector) => {
          const node = document.querySelector(selector);
          return [selector, node ? getComputedStyle(node).fontSize : null];
        }),
      ),
    };
  });
  return metrics;
}

test(`captures ${evidencePhase}-redesign UX/UI evidence and measurements`, async ({
  browser,
}) => {
  test.setTimeout(120_000);
  mkdirSync(evidenceDir, { recursive: true });
  const state = seedReadableOperationalState();
  const context = await browser.newContext({
    baseURL: `http://127.0.0.1:${port}`,
  });
  const page = await context.newPage();
  const measurements: Record<string, unknown> = {};
  await context.tracing.start({ screenshots: true, snapshots: true });
  try {
    await signIn(page, "Administrator", "demo", port);
    await ensureConnection(page, state.token);
    for (const [name, route] of routeSet) {
      measurements[name] = {};
      for (const width of widthSet) {
        (measurements[name] as Record<string, unknown>)[String(width)] =
          await inspectPage(page, route, width);
      }
      for (const width of captureWidths) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(700);
        await page.screenshot({
          path: join(evidenceDir, `${name}-${width}.png`),
          fullPage: true,
        });
        if (
          evidencePhase === "after" &&
          width === 1440 &&
          primaryRoutes.some(([routeName]) => routeName === name)
        ) {
          await expect(page).toHaveScreenshot(`${name}-1440.png`, {
            fullPage: true,
            animations: "disabled",
            caret: "hide",
            maxDiffPixelRatio: 0.03,
            mask: [
              page.locator(".evidence-footer"),
              page.locator(".micro.muted"),
            ],
          });
        }
      }
    }
    writeFileSync(
      join(evidenceDir, "metrics.json"),
      JSON.stringify(measurements, null, 2),
      { mode: 0o600 },
    );
  } finally {
    await context.tracing.stop({ path: join(evidenceDir, "trace.zip") });
    await context.close();
  }
});

test("acceptance: universal search keeps VMID, name, UUID and code in one flow", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const state = seedReadableOperationalState();
  const context = await browser.newContext({
    baseURL: `http://127.0.0.1:${port}`,
  });
  const page = await context.newPage();
  try {
    await signIn(page, "Administrator", "demo", port);
    await ensureConnection(page, state.token);

    async function searchOperations(value: string) {
      await page.goto("/operations");
      const input = page.getByLabel("Buscar operaciones");
      await input.fill(value);
      await Promise.all([
        page.waitForResponse((response) =>
          response.url().includes("/api/operation-pages"),
        ),
        page.getByRole("button", { name: "Buscar", exact: true }).click(),
      ]);
      await expect(
        page.getByText("INVALID_REQUEST", { exact: false }),
      ).toHaveCount(0);
    }

    await searchOperations("30060");
    await expect(
      page.getByText("billing-worker", { exact: true }).first(),
    ).toBeVisible();
    await searchOperations("billing-worker");
    await expect(
      page.getByText("billing-worker", { exact: true }).first(),
    ).toBeVisible();
    await searchOperations("10000000-0000-4000-8000-000000000004");
    await expect(
      page.getByText("billing-worker", { exact: true }).first(),
    ).toBeVisible();
    await searchOperations("PLAN_INTEGRITY_FAILED");
    await expect(
      page.getByText("PLAN_INTEGRITY_FAILED", { exact: true }).first(),
    ).toBeVisible();

    await page.goto("/");
    await page.getByRole("link", { name: /Ver todas/ }).click();
    await expect(page).toHaveURL(/\/operations/);

    await page.goto("/events");
    await page.getByLabel("Buscar eventos").fill("30060");
    await expect(
      page.locator(".event-resource", { hasText: "billing-worker" }).first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Por instancia", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Por instancia", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.goto("/incidents");
    await page.getByLabel("Buscar incidentes").fill("30060");
    await page
      .getByRole("button", { name: "Buscar historial", exact: true })
      .click();
    await expect(
      page.getByText("billing-worker", { exact: true }).first(),
    ).toBeVisible();
    await page.locator("details.advanced-filter summary").click();
    await page.getByLabel("Código de error").fill("PLAN_INTEGRITY_FAILED");
    await page
      .getByRole("button", { name: "Buscar historial", exact: true })
      .click();
    await expect(
      page.getByText("PLAN_INTEGRITY_FAILED", { exact: true }).first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Abrir diagnóstico/ })
      .first()
      .click();
    await expect(
      page.getByRole("dialog", { name: "Diagnóstico de incidente" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
