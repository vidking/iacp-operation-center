import { operationPage } from "#lib/server/incidents/operations.ts";
import { requireRole, throttle } from "#lib/server/security/auth.ts";
import { safeError } from "#lib/server/security/http.ts";
export const GET = async ({ locals, url }) => {
  try {
    const actor = requireRole(locals.user);
    throttle("operations-page:" + actor.tenantId, 60, 60000);
    return Response.json(
      await operationPage(actor, {
        offset: Number(url.searchParams.get("offset") ?? 0),
        pageSize: Number(url.searchParams.get("pageSize") ?? 50),
        recent: url.searchParams.get("recent") === "true",
        ...(url.searchParams.get("instance")
          ? { instance: url.searchParams.get("instance") }
          : {}),
        ...(url.searchParams.get("status")
          ? { status: url.searchParams.get("status") }
          : {}),
        ...(url.searchParams.get("kind")
          ? { kind: url.searchParams.get("kind") }
          : {}),
        ...(url.searchParams.get("q")
          ? { query: url.searchParams.get("q") }
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
