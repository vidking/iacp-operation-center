import { z } from "zod";
import { disconnectWorkspace } from "#lib/server/connections/service.ts";
import { safeError } from "#lib/server/security/http.ts";
export const POST = ({ locals }) => {
  try {
    z.object({}).strict().parse(locals.body);
    disconnectWorkspace(locals.user);
    return Response.json({ disconnected: true });
  } catch (e) {
    return safeError(e);
  }
};
