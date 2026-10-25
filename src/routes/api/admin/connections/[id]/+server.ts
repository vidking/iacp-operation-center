import { mutateConnection } from "#lib/server/connections/service.ts";
import { safeError } from "#lib/server/security/http.ts";
export const POST = async ({ locals, params }) => {
  try {
    return Response.json({
      connection: await mutateConnection(locals.user, params.id, locals.body),
    });
  } catch (e) {
    return safeError(e);
  }
};
