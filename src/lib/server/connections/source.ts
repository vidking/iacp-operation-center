import { z } from "zod";
import { secureJson } from "./transport.ts";
import { SecurityError } from "../security/config.ts";
import {
  operationSchema,
  eventPageSchema,
  diagnosticsSchema,
  type ObservationSource,
} from "../../types/observation.ts";
export function readonlySource(connection: {
  endpoint: string;
  tenantId: string;
  token: string;
}) {
  async function get<T>(path: string, schema: z.ZodType<T>) {
    try {
      return schema.parse(
        await secureJson(connection.endpoint, path, connection.token),
      );
    } catch (e) {
      if (e instanceof SecurityError) throw e;
      throw new SecurityError("UPSTREAM_CONTRACT_ERROR", 502);
    }
  }
  const source: ObservationSource & {
    ready: () => Promise<{ status: "ready" }>;
  } = {
    operations: async () => {
      await source.observability();
      return get("/v1/operations?limit=50&offset=0", z.array(operationSchema));
    },
    operation: async (id) => {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id))
        throw new SecurityError("INVALID_OPERATION");
      await source.observability();
      return get("/v1/operations/" + id, operationSchema);
    },
    events: async (after = 0) => {
      if (!Number.isSafeInteger(after) || after < 0)
        throw new SecurityError("INVALID_CURSOR");
      const page = await get(
        `/v1/events?after=${after}&limit=100`,
        eventPageSchema,
      );
      if (page.events.some((e) => e.tenant_id !== connection.tenantId))
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      return page;
    },
    observability: async () => {
      const d = await get("/v1/observability", diagnosticsSchema);
      if (d.tenant_id !== connection.tenantId)
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      return d;
    },
    ready: () => get("/health/ready", z.object({ status: z.literal("ready") })),
  };
  return source;
}
