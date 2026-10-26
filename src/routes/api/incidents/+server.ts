import { incidentList } from "#lib/server/incidents/service.ts";
import { requireRole, throttle } from "#lib/server/security/auth.ts";
import { safeError } from "#lib/server/security/http.ts";
export const GET = async ({ locals, url }) => {
  try {
    const actor = requireRole(locals.user);
    throttle("incident-read:" + actor.tenantId, 60, 60000);
    return Response.json(
      await incidentList(actor, Number(url.searchParams.get("offset") ?? 0)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return safeError(e);
  }
};
