import { authorizedRead } from "#lib/server/connections/service.ts";
import { requireRole, throttle } from "#lib/server/security/auth.ts";
import { safeError } from "#lib/server/security/http.ts";
export const GET = async ({ locals, params }) => {
  try {
    const actor = requireRole(locals.user);
    throttle("operation-poll:" + actor.tenantId, 120, 60000);
    return Response.json(
      await authorizedRead(locals.user, (source) =>
        source.operation(params.id),
      ),
    );
  } catch (e) {
    return safeError(e);
  }
};
