import { liveSource } from "#lib/server/connections/service.ts";
import { safeError } from "#lib/server/security/http.ts";
import { SecurityError } from "#lib/server/security/config.ts";
export const GET = async ({ locals, params }) => {
  try {
    const { source } = liveSource(locals.user);
    switch (params.resource) {
      case "operations":
        return Response.json(await source.operations());
      case "events":
        return Response.json(await source.events());
      case "observability":
        return Response.json(await source.observability());
      case "ready":
        return Response.json(await source.ready());
      default:
        throw new SecurityError("NOT_FOUND", 404);
    }
  } catch (e) {
    return safeError(e);
  }
};
