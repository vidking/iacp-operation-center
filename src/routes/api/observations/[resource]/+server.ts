import { authorizedRead, portalData } from "#lib/server/connections/service.ts";
import { safeError } from "#lib/server/security/http.ts";
import { SecurityError } from "#lib/server/security/config.ts";
export const GET = async ({ locals, params, url }) => {
  try {
    if (params.resource === "sync")
      return Response.json(await portalData(locals.user));
    switch (params.resource) {
      case "operations":
        return Response.json(
          await authorizedRead(locals.user, (source) =>
            source.operations(Number(url.searchParams.get("offset") ?? 0)),
          ),
        );
      case "events": {
        const page = await authorizedRead(locals.user, (source) =>
          source.events(Number(url.searchParams.get("after") ?? 0)),
        );
        const queriedAt = new Date().toISOString();
        const observedAt = page.events.reduce<string | null>(
          (latest, event) =>
            !latest || Date.parse(event.occurred_at) > Date.parse(latest)
              ? event.occurred_at
              : latest,
          null,
        );
        return Response.json(
          {
            ...page,
            queriedAt,
            observedAt,
            freshness: observedAt ? "fresh" : "unknown",
            evidence: {
              source: "IACP /v1/events",
              queriedAt,
              observedAt,
              freshness: observedAt ? "fresh" : "unknown",
              status: "observed",
            },
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      case "observability":
        return Response.json(
          await authorizedRead(locals.user, (source) => source.observability()),
        );
      case "ready":
        return Response.json(
          await authorizedRead(locals.user, (source) => source.ready()),
        );
      default:
        throw new SecurityError("NOT_FOUND", 404);
    }
  } catch (e) {
    return safeError(e);
  }
};
