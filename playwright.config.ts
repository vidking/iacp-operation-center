import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  // The fixture servers intentionally share one tenant-scoped SQLite database
  // per port. Serial workers keep session and audit assertions deterministic;
  // the contractual suite remains fully exercised.
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
  },
  webServer: [
    {
      command: "node --experimental-strip-types scripts/test-server.mjs 4181",
      port: 4181,
      reuseExistingServer: false,
    },
    {
      command: "node --experimental-strip-types scripts/test-server.mjs 4182",
      port: 4182,
      reuseExistingServer: false,
    },
    {
      command: "node --experimental-strip-types scripts/test-server.mjs 4180",
      port: 4180,
      reuseExistingServer: false,
    },
    {
      command: "node --experimental-strip-types scripts/test-server.mjs 4179",
      port: 4179,
      reuseExistingServer: false,
    },
    {
      command: "node --experimental-strip-types scripts/test-server.mjs 4178",
      port: 4178,
      reuseExistingServer: false,
    },
    {
      command: "node --experimental-strip-types scripts/test-server.mjs 4177",
      port: 4177,
      reuseExistingServer: false,
    },
    {
      command: "node --experimental-strip-types scripts/test-server.mjs 4176",
      port: 4176,
      reuseExistingServer: false,
    },
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
