import { incidentList } from "#lib/server/incidents/service.ts";
import { requireRole, throttle } from "#lib/server/security/auth.ts";
import { safeError } from "#lib/server/security/http.ts";
export const GET = async ({ locals, url }) => {
  try {
    const actor = requireRole(locals.user);
    throttle("incident-read:" + actor.tenantId, 60, 60000);
    return Response.json(
      await incidentList(actor, {
        offset: Number(url.searchParams.get("offset") ?? 0),
        pageSize: Number(url.searchParams.get("pageSize") ?? 50),
        ...(url.searchParams.get("state")
          ? { state: url.searchParams.get("state") }
          : {}),
        ...(url.searchParams.get("kind")
          ? { kind: url.searchParams.get("kind") }
          : {}),
        ...(url.searchParams.get("code")
          ? { code: url.searchParams.get("code") }
          : {}),
        ...(url.searchParams.get("q")
          ? { query: url.searchParams.get("q") }
          : {}),
        ...(url.searchParams.get("from")
          ? { from: url.searchParams.get("from") + "T00:00:00-06:00" }
          : {}),
        ...(url.searchParams.get("until")
          ? { until: url.searchParams.get("until") + "T23:59:59.999-06:00" }
          : {}),
        ...(url.searchParams.get("sortBy")
          ? { sortBy: url.searchParams.get("sortBy") }
          : {}),
        ...(url.searchParams.get("direction")
          ? { direction: url.searchParams.get("direction") }
          : {}),
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return safeError(e);
  }
};
