import { z } from "zod";
import { useMock } from "#lib/server/connections/service.ts";
import { safeError } from "#lib/server/security/http.ts";
export const POST = ({ locals }) => {
  try {
    z.object({ mode: z.literal("MOCK") })
      .strict()
      .parse(locals.body);
    useMock(locals.user);
    return Response.json({ mode: "MOCK" });
  } catch (e) {
    return safeError(e);
  }
};
