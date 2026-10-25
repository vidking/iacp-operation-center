import { history } from "#lib/server/connections/service.ts";
import { safeError } from "#lib/server/security/http.ts";
export const GET = ({ locals, params }) => {
  try {
    return Response.json({ history: history(locals.user, params.id) });
  } catch (e) {
    return safeError(e);
  }
};
