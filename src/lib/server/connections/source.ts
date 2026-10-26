import { z } from "zod";
import { contractPath } from "../../types/iacp-client.ts";
import { sharedRead } from "./reads.ts";
import { SecurityError } from "../security/config.ts";
import {
  operationSchema,
  eventPageSchema,
  diagnosticsSchema,
  type ObservationSource,
} from "../../types/observation.ts";
async function projected<T>(
  endpoint: string,
  token: string,
  path: string,
  schema: z.ZodType<T>,
) {
  try {
    return schema.parse(await sharedRead(endpoint, path, token));
  } catch (e) {
    if (e instanceof SecurityError) throw e;
    throw new SecurityError("UPSTREAM_CONTRACT_ERROR", 502);
  }
}
export const discoverScope = (endpoint: string, token: string) =>
  projected(
    endpoint,
    token,
    contractPath("getTenantDiagnostics"),
    diagnosticsSchema,
  );
export const readReady = (endpoint: string, token: string) =>
  projected(
    endpoint,
    token,
    contractPath("healthReady"),
    z.object({ status: z.literal("ready") }),
  );
export function readonlySource(connection: {
  endpoint: string;
  tenantId: string;
  token: string;
}) {
  async function get<T>(path: string, schema: z.ZodType<T>) {
    try {
      return schema.parse(
        await sharedRead(connection.endpoint, path, connection.token),
      );
    } catch (e) {
      if (e instanceof SecurityError) throw e;
      throw new SecurityError("UPSTREAM_CONTRACT_ERROR", 502);
    }
  }
  let attestation:
    Promise<import("../../types/observation.ts").Diagnostics> | undefined;
  const source: ObservationSource & {
    ready: () => Promise<{ status: "ready" }>;
  } = {
    operations: async (offset = 0) => {
      if (!Number.isSafeInteger(offset) || offset < 0)
        throw new SecurityError("INVALID_OFFSET");
      await source.observability();
      return get(
        `${contractPath("listOperations")}?limit=50&offset=${offset}`,
        z.array(operationSchema),
      );
    },
    operation: async (id) => {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id))
        throw new SecurityError("INVALID_OPERATION");
      await source.observability();
      return get(
        contractPath("getOperation", { operation_id: id }),
        operationSchema,
      );
    },
    events: async (after = 0) => {
      if (!Number.isSafeInteger(after) || after < 0)
        throw new SecurityError("INVALID_CURSOR");
      await source.observability();
      const page = await get(
        `${contractPath("listAuditEvents")}?after=${after}&limit=100`,
        eventPageSchema,
      );
      if (page.events.some((e) => e.tenant_id !== connection.tenantId))
        throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
      return page;
    },
    observability: () =>
      (attestation ??= (async () => {
        const d = await get(
          contractPath("getTenantDiagnostics"),
          diagnosticsSchema,
        );
        if (d.tenant_id !== connection.tenantId)
          throw new SecurityError("UPSTREAM_TENANT_MISMATCH", 502);
        return d;
      })()),
    ready: () =>
      get(
        contractPath("healthReady"),
        z.object({ status: z.literal("ready") }),
      ),
  };
  return source;
}
