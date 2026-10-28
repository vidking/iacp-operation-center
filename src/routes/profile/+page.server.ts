import { fail, redirect } from "@sveltejs/kit";
import { currentUser, updateOwnProfile } from "#lib/server/security/auth.ts";
import { SecurityError } from "#lib/server/security/config.ts";
import { sessionCookie } from "#lib/server/security/auth.ts";

export const load = ({ locals }) => ({ profile: currentUser(locals.user) });

export const actions = {
  default: async ({ locals, cookies }) => {
    const body = locals.body ?? {};
    const changedPassword =
      typeof body.newPassword === "string" && body.newPassword.length > 0;
    try {
      await updateOwnProfile(locals.user, body);
    } catch (error) {
      return fail(error instanceof SecurityError ? error.status : 400, {
        error:
          error instanceof SecurityError ? error.code : "PROFILE_UPDATE_FAILED",
      });
    }
    if (changedPassword) {
      cookies.delete(sessionCookie, { path: "/" });
      redirect(303, "/login?password=changed");
    }
    return { saved: true, profile: currentUser(locals.user) };
  },
};
