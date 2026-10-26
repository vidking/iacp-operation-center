import { connectIacp } from "#lib/server/connections/service.ts";
import { safeError } from "#lib/server/security/http.ts";
export const POST = async ({ locals }) => {
  try {
    return Response.json({
      connection: await connectIacp(locals.user, locals.body),
    });
  } catch (e) {
    return safeError(e);
  }
};
