import {
  catalog,
  inventory,
  detail,
  intents,
  command,
} from "#lib/server/crm/service.ts";
import { requireRole, throttle } from "#lib/server/security/auth.ts";
import { SecurityError } from "#lib/server/security/config.ts";
import { safeError } from "#lib/server/security/http.ts";
export const GET = async ({ locals, params, url }) => {
  try {
    const actor = requireRole(locals.user);
    throttle("crm-read:" + actor.tenantId, 120, 60000);
    let result: unknown;
    if (params.path === "catalog") result = await catalog(locals.user);
    else if (params.path === "instances")
      result = await inventory(
        locals.user,
        Number(url.searchParams.get("offset") ?? 0),
      );
    else if (params.path === "intents")
      result = { intents: intents(locals.user) };
    else if (/^instances\/[a-f0-9-]{36}$/.test(params.path))
      result = await detail(
        locals.user,
        params.path.split("/")[1],
        Number(url.searchParams.get("operationOffset") ?? 0),
      );
    else throw new SecurityError("NOT_FOUND", 404);
    return Response.json(result);
  } catch (e) {
    return safeError(e);
  }
};
export const POST = async ({ locals, params }) => {
  try {
    requireRole(locals.user, ["Administrator"]);
    if (params.path !== "commands") throw new SecurityError("NOT_FOUND", 404);
    return Response.json(await command(locals.user, locals.body), {
      status: 202,
    });
  } catch (e) {
    return safeError(e);
  }
};
