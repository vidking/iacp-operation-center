import { liveSource } from "#lib/server/connections/service.ts";
import { safeError } from "#lib/server/security/http.ts";
export const GET = async ({ locals, params }) => {
  try {
    return Response.json(
      await liveSource(locals.user).source.operation(params.id),
    );
  } catch (e) {
    return safeError(e);
  }
};
