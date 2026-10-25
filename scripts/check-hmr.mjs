// Ejecutar únicamente dentro del target test; el host modifica CSS para acreditar HMR.
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto("http://iacoc-web:5173/");
  await page.waitForSelector("h1");
  console.log("HMR_READY: esperando cambio CSS desde el host");
  await page.waitForFunction(
    () =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--iacoc-hmr-probe")
        .trim() === "confirmed",
    {},
    { timeout: 45000 },
  );
  console.log("HMR_PASS: CSS actualizado sin recargar la página");
} finally {
  await browser.close();
}
