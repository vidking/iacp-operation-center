import { test as base, expect } from "@playwright/test";
import type { Browser, Page, BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
export const fixtureCredentials = (
  role = "Viewer",
  tenant = "demo",
  port = 4173,
) =>
  JSON.parse(readFileSync(`test-results/credentials-${port}.json`, "utf8"))[
    role + "-" + tenant
  ] as { username: string; password: string };
export async function signIn(
  page: Page,
  role = "Viewer",
  tenant = "demo",
  port = 4173,
) {
  await page.context().clearCookies();
  const credentials = fixtureCredentials(role, tenant, port);
  await page.goto(`http://127.0.0.1:${port}/login`);
  await page.getByLabel("Usuario", { exact: true }).fill(credentials.username);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(credentials.password);
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await expect(page).toHaveURL(`http://127.0.0.1:${port}/`);
}
export async function csrf(page: Page) {
  return page
    .locator('form[action="/logout"] input[name="_csrf"]')
    .inputValue();
}
export async function api(
  page: Page,
  path: string,
  body?: unknown,
  token?: string,
) {
  const value = token ?? (body ? await csrf(page) : "");
  return page.evaluate(
    async ({ path, body, value }) => {
      const res = await fetch(
        path,
        body
          ? {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": value,
              },
              body: JSON.stringify(body),
            }
          : undefined,
      );
      return { status: res.status, body: await res.json() };
    },
    { path, body, value },
  );
}
export const test = base.extend<
  {},
  {
    authenticatedState: Awaited<ReturnType<BrowserContext["storageState"]>>;
  }
>({
  authenticatedState: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await signIn(page);
      await use(await context.storageState());
      await context.close();
    },
    { scope: "worker" },
  ],
  storageState: async ({ authenticatedState }, use) => {
    await use(authenticatedState);
  },
});
export { expect };
