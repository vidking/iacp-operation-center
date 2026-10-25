import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  use: {
    baseURL: "http://127.0.0.1:4173",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
  },
  webServer: [
    {
      command: "node --experimental-strip-types scripts/test-server.mjs 4175",
      url: "http://127.0.0.1:4175/health",
      reuseExistingServer: false,
    },
    {
      command: "node scripts/test-proxy.mjs",
      url: "https://127.0.0.1:4443/health",
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
    },
    {
      command: "node --experimental-strip-types scripts/test-server.mjs 4173",
      port: 4173,
      reuseExistingServer: false,
    },
    {
      command: "node --experimental-strip-types scripts/test-server.mjs 4174",
      port: 4174,
      reuseExistingServer: false,
    },
  ],
});
