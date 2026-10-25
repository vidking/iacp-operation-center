import { defineEnvVars } from "@sveltejs/kit/env";
export const variables = defineEnvVars({
  DATA_MODE: { schema: (value) => value ?? "MOCK" },
  IACP_BASE_URL: { schema: (value) => value ?? "" },
  IACP_READER_TOKEN: { schema: (value) => value ?? "" },
  IACP_TENANT_ID: { schema: (value) => value ?? "" },
});
