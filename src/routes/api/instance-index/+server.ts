import { instanceReferences } from "#lib/server/incidents/operations.ts";
import { requireRole, throttle } from "#lib/server/security/auth.ts";
import { safeError } from "#lib/server/security/http.ts";

export const GET = async ({ locals }) => {
  try {
    const actor = requireRole(locals.user);
    throttle("instance-index:" + actor.tenantId, 30, 60000);
    return Response.json(
      { instances: await instanceReferences(actor) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return safeError(error);
  }
};
