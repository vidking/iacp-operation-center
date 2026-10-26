import { incidentDetail } from "#lib/server/incidents/service.ts";
import { requireRole, throttle } from "#lib/server/security/auth.ts";
import { safeError } from "#lib/server/security/http.ts";
export const GET = async ({ locals, params }) => {
  try {
    const actor = requireRole(locals.user);
    throttle("incident-read:" + actor.tenantId, 60, 60000);
    return Response.json(await incidentDetail(actor, params.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return safeError(e);
  }
};
