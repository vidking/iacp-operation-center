// Read-only enterprise acceptance assistant. Credentials are entered by a human
// in a visible browser; no storageState, cookies, headers, or request bodies are
// persisted. The browser context is closed on exit.
import { chromium } from "@playwright/test";
import { mkdirSync, mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseURL =
  process.env.IACOC_ENTERPRISE_URL ?? "https://iacoc.cyberfuel.com";
const evidenceDir = process.env.IACOC_ASSISTED_EVIDENCE_DIR
  ? process.env.IACOC_ASSISTED_EVIDENCE_DIR
  : mkdtempSync(join(tmpdir(), "iacoc-enterprise-assisted-"), {
      encoding: "utf8",
    });
mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
chmodSync(evidenceDir, 0o700);

const startedAt = new Date().toISOString();
const responses = [];
const failures = [];
const consoleErrors = [];
const pageErrors = [];
const pending = new Set();
const timings = new Map();
const safePath = (url) => {
  try {
    return new URL(url).pathname;
  } catch {
    return "<invalid-url>";
  }
};
const safeResponse = (response) => {
  const path = safePath(response.url());
  return {
    method: response.request().method(),
    path,
    status: response.status(),
    milliseconds: Math.round(
      performance.now() -
        (timings.get(response.request()) ?? performance.now()),
    ),
  };
};

let browser;
let context;
try {
  browser = await chromium.launch({
    headless: false,
    args: ["--disable-dev-shm-usage"],
  });
  context = await browser.newContext({
    baseURL,
    acceptDownloads: false,
    serviceWorkers: "block",
  });
  await context.clearCookies();
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("console", (message) => {
    if (message.type() === "error")
      consoleErrors.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => pageErrors.push({ text: error.message }));
  page.on("request", (request) => {
    const path = safePath(request.url());
    const key = request;
    pending.add(path);
    timings.set(key, performance.now());
  });
  page.on("requestfailed", (request) => {
    const path = safePath(request.url());
    pending.delete(path);
    failures.push({
      method: request.method(),
      path,
      error: request.failure()?.errorText ?? "REQUEST_FAILED",
    });
    timings.delete(request);
  });
  page.on("response", (response) => {
    const request = response.request();
    const path = safePath(response.url());
    pending.delete(path);
    responses.push(safeResponse(response));
    timings.delete(request);
  });

  const loginResponse = await page.goto("/login", {
    waitUntil: "domcontentloaded",
  });
  const loginCookie = (await context.cookies()).find(
    (cookie) => cookie.name === "__Host-iacoc-login",
  );
  const csrfField = page.locator('form input[name="_csrf"]');
  const csrfValue = await csrfField.inputValue().catch(() => "");
  if (
    loginResponse?.status() !== 200 ||
    !loginCookie ||
    !loginCookie.httpOnly ||
    !loginCookie.secure ||
    loginCookie.sameSite !== "Strict" ||
    (await csrfField.count()) !== 1 ||
    !/^[A-Za-z0-9_-]{43}$/.test(csrfValue)
  ) {
    throw new Error("LOGIN_CSRF_BOOTSTRAP_FAILED");
  }
  console.log(
    "LOGIN_READY: complete authentication in the visible Chromium window.",
  );
  console.log(
    "No password, token, cookie, header, or form value will be recorded.",
  );
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 10 * 60 * 1000,
  });

  const record = async (name, action) => {
    const started = performance.now();
    await action();
    return {
      name,
      milliseconds: Math.round(performance.now() - started),
      path: new URL(page.url()).pathname,
    };
  };
  const steps = [];
  steps.push(
    await record("connections", async () => {
      await page.goto("/administration/connections", {
        waitUntil: "domcontentloaded",
      });
      await page.getByRole("region", { name: "Conexión IACP" }).waitFor();
    }),
  );
  console.log(
    "CONNECTIONS_READY: verify the single Bearer connection in the visible browser; no credential value is read by this runner.",
  );
  await page.waitForFunction(
    () => {
      const connection = document.querySelector(
        '[aria-label="Conexión IACP"]',
      )?.textContent;
      return Boolean(connection?.includes("Conectado"));
    },
    undefined,
    { timeout: 10 * 60 * 1000 },
  );
  const connectionText = await page
    .getByRole("region", { name: "Conexión IACP" })
    .innerText();
  const hasPasswordInput = await page.locator('input[type="password"]').count();

  steps.push(
    await record("crm", async () => {
      await page.goto("/crm", { waitUntil: "domcontentloaded" });
      await page.getByText("Catálogo KVM de IACP").waitFor();
    }),
  );
  const createButtons = page.getByRole("button", {
    name: "Crear KVM",
    exact: true,
  });
  const catalog = {
    createButtons: await createButtons.count(),
    enabledCreateButtons: await createButtons.evaluateAll(
      (buttons) => buttons.filter((button) => !button.disabled).length,
    ),
    ubuntu2404: (await page.locator("body").innerText()).includes(
      "Ubuntu 24.04",
    ),
  };

  const screenshotPath = join(evidenceDir, "crm-readonly.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const evidence = {
    startedAt,
    finishedAt: new Date().toISOString(),
    baseURL,
    steps,
    connection: {
      text: connectionText,
      passwordInputsPresent: hasPasswordInput,
    },
    catalog,
    responses,
    failures,
    consoleErrors,
    pageErrors,
    pendingAtFinish: [...pending],
    screenshot: screenshotPath,
    mutationsSent: false,
    storageStateExported: false,
  };
  const evidencePath = join(evidenceDir, "evidence.json");
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), {
    mode: 0o600,
  });
  console.log(`ASSISTED_EVIDENCE: ${evidencePath}`);
  console.log(`ASSISTED_SCREENSHOT: ${screenshotPath}`);
  console.log(
    "READONLY_CHECK_COMPLETE: no creation or lifecycle command was sent.",
  );
  console.log(
    "Press Ctrl-C to close Chromium and destroy the temporary browser context.",
  );
  await new Promise((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
}
