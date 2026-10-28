import { fail } from "@sveltejs/kit";
import {
  createManagedUser,
  listUsers,
  updateManagedUser,
} from "#lib/server/security/auth.ts";
import { SecurityError } from "#lib/server/security/config.ts";

export const load = ({ locals }) => ({ users: listUsers(locals.user) });

export const actions = {
  default: async ({ locals }) => {
    const body = locals.body ?? {};
    try {
      if (body._action === "create") {
        await createManagedUser(locals.user, body);
        return { saved: true, created: true, users: listUsers(locals.user) };
      }
      if (body._action === "update") {
        await updateManagedUser(locals.user, body.id, body);
        return { saved: true, users: listUsers(locals.user) };
      }
      throw new SecurityError("INVALID_REQUEST", 400);
    } catch (error) {
      return fail(error instanceof SecurityError ? error.status : 400, {
        error:
          error instanceof SecurityError ? error.code : "USER_UPDATE_FAILED",
      });
    }
  },
};
