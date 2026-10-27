import { z } from "zod";
import { read } from "../crm/service.ts";
import { operationSchema } from "../../types/observation.ts";
import type { Principal } from "../../types/security.ts";
import { connectionContext } from "../connections/service.ts";
import { SecurityError } from "../security/config.ts";
import { singleFlight } from "../../refresh.ts";
function newestFirst(a: { updated_at: string }, b: { updated_at: string }) {
  return Date.parse(b.updated_at) - Date.parse(a.updated_at);
}
export async function operationPage(
  user: Principal | undefined,
  input: unknown,
) {
  const query = z
    .object({
      offset: z.number().int().nonnegative().optional(),
      recent: z.boolean().default(false),
      instance: z.uuid().optional(),
      status: z
        .enum(["queued", "running", "completed", "failed", "uncertain"])
        .optional(),
      query: z.string().trim().max(128).optional(),
    })
    .strict()
    .parse(input);
  const c = connectionContext(user);
  return singleFlight(
    `operation-page:${c.id}:${c.version}:${JSON.stringify(query)}`,
    async () => {
      const page = (offset: number) =>
        read(
          user,
          `/v1/operations?limit=50&offset=${offset}${query.instance ? "&instance_id=" + query.instance : ""}${query.status ? "&status=" + query.status : ""}`,
          operationSchema.array(),
        );
      let offset = query.offset ?? 0,
        operations;
      if (query.query) {
        // IACP exposes only instance/status filters. Search the complete
        // technical pagination; IaCoC does not impose a history cap.
        const needle = query.query.toLowerCase();
        const matches = [];
        for (let pageOffset = 0; ; pageOffset += 50) {
          const pageItems = await page(pageOffset);
          matches.push(
            ...pageItems.filter((operation) =>
              `${operation.operation_id} ${operation.instance_id} ${operation.kind}`
                .toLowerCase()
                .includes(needle),
            ),
          );
          if (pageItems.length < 50) break;
        }
        operations = matches.sort(newestFirst).slice(offset, offset + 50);
      } else if (query.recent) {
        // IACP's deployed ordering is oldest first, with no count or descending parameter.
        // Locate the tail in O(log pages) requests; never download the full history.
        operations = await page(0);
        if (operations.length === 50) {
          let low = 0,
            high = 1;
          while ((await page(high * 50)).length) {
            low = high;
            high *= 2;
            if (!Number.isSafeInteger(high * 50))
              throw new SecurityError("INVALID_OFFSET");
          }
          while (high - low > 1) {
            const mid = Math.floor((low + high) / 2);
            if ((await page(mid * 50)).length) low = mid;
            else high = mid;
          }
          offset = low * 50;
          operations = await page(offset);
        }
      } else operations = await page(offset);
      operations = [...operations].sort(newestFirst);
      const current = connectionContext(user);
      if (
        current.id !== c.id ||
        current.version !== c.version ||
        current.tenant !== c.tenant
      )
        throw new SecurityError("CONNECTION_CHANGED", 409);
      const queriedAt = new Date().toISOString();
      const observedAt = operations.reduce<string | null>(
        (latest, operation) =>
          !latest || Date.parse(operation.updated_at) > Date.parse(latest)
            ? operation.updated_at
            : latest,
        null,
      );
      return {
        operations,
        offset,
        hasMore: operations.length === 50,
        queriedAt,
        observedAt,
        evidence: {
          source: "IACP /v1/operations",
          queriedAt,
          observedAt,
          freshness: observedAt ? "fresh" : "unknown",
          status: "observed",
        },
        scope:
          "Página consultada; ordenada de más reciente a más antigua por updated_at. IACP pagina técnicamente en orden ascendente.",
      };
    },
  );
}
