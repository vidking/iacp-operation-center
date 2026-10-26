import {
  configureLifecycle,
  removeLifecycle,
} from "#lib/server/crm/service.ts";
import { safeError } from "#lib/server/security/http.ts";
export const POST = async ({ locals }) => {
  try {
    return Response.json(await configureLifecycle(locals.user, locals.body));
  } catch (e) {
    return safeError(e);
  }
};
export const DELETE = ({ locals }) => {
  try {
    return Response.json(removeLifecycle(locals.user));
  } catch (e) {
    return safeError(e);
  }
};
