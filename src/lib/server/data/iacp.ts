import { z } from "zod";
import {
  operationSchema,
  eventPageSchema,
  diagnosticsSchema,
  type ObservationSource,
} from "./contracts";
export interface ReaderContext {
  subject: string;
  role: "reader";
  tenantId: string;
}
export function createIacpSource(
  config: { baseUrl: string; token: string; tenantId: string },
  observer: ReaderContext | undefined,
  http: typeof fetch = fetch,
): ObservationSource {
  if (
    !observer?.subject ||
    observer.role !== "reader" ||
    !config.tenantId ||
    observer.tenantId !== config.tenantId
  )
    throw new Error("Observation authorization required");
  const base = new URL(config.baseUrl);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/" ||
    !config.token
  )
    throw new Error("Invalid server configuration");
  async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const response = await http(new URL(path, base), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`IACP read failed (${response.status})`);
    return schema.parse(await response.json());
  }
  return {
    operations: () =>
      get("/v1/operations?limit=50&offset=0", z.array(operationSchema)),
    operation: (id) =>
      get(`/v1/operations/${encodeURIComponent(id)}`, operationSchema),
    events: (after = 0) => {
      if (!Number.isSafeInteger(after) || after < 0)
        throw new Error("Invalid cursor");
      return get(`/v1/events?after=${after}&limit=100`, eventPageSchema).then(
        (page) => {
          if (page.events.some((e) => e.tenant_id !== config.tenantId))
            throw new Error("Tenant mismatch");
          return page;
        },
      );
    },
    observability: () =>
      get("/v1/observability", diagnosticsSchema).then((d) => {
        if (d.tenant_id !== config.tenantId) throw new Error("Tenant mismatch");
        return d;
      }),
  };
}
