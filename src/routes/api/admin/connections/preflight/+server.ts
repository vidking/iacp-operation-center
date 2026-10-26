import { z } from "zod";
import { destinationStatus } from "#lib/server/connections/service.ts";
import { requireRole, throttle } from "#lib/server/security/auth.ts";
import { safeError } from "#lib/server/security/http.ts";
export const POST = async ({ locals }) => {
  try {
    const actor = requireRole(locals.user, ["Administrator"]);
    throttle("connection-preflight:" + actor.id, 30, 60_000);
    const input = z
      .object({ endpoint: z.string().max(300) })
      .strict()
      .parse(locals.body);
    const code = destinationStatus(actor, input.endpoint);
    return Response.json(
      { code, authorized: code === "OK" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return safeError(e);
  }
};
