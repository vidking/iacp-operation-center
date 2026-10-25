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
      command:
        "HOST=127.0.0.1 PORT=4173 DATA_MODE=MOCK IACP_BASE_URL=https://offline.invalid node .artifacts/build",
      port: 4173,
      reuseExistingServer: false,
    },
    {
      command:
        "HOST=127.0.0.1 PORT=4174 DATA_MODE=IACP IACP_BASE_URL=https://offline.invalid IACP_READER_TOKEN=test-only-sentinel IACP_TENANT_ID=demo node .artifacts/build",
      port: 4174,
      reuseExistingServer: false,
    },
  ],
});
