import { reconcileIncident } from "#lib/server/incidents/service.ts";
import { requireRole, throttle } from "#lib/server/security/auth.ts";
import {
  safeError,
  mutationBody,
  checkCsrf,
} from "#lib/server/security/http.ts";
export const POST = async ({ locals, params, request }) => {
  try {
    const actor = requireRole(locals.user, ["Administrator"]);
    const body = await mutationBody(request);
    checkCsrf(request, body, locals.csrf);
    throttle("incident-recovery:" + actor.id, 10, 60000);
    return Response.json(await reconcileIncident(actor, params.id, body));
  } catch (e) {
    return safeError(e);
  }
};
