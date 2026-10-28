import { fail } from "@sveltejs/kit";
import {
  getPreferences,
  updatePreferences,
} from "#lib/server/security/preferences.ts";
import { SecurityError } from "#lib/server/security/config.ts";

export const load = ({ locals }) => ({
  preferences: getPreferences(locals.user),
});

export const actions = {
  default: async ({ locals }) => {
    try {
      const { _csrf: _ignoredCsrf, ...input } = locals.body ?? {};
      return {
        saved: true,
        preferences: updatePreferences(locals.user, input),
      };
    } catch (error) {
      return fail(error instanceof SecurityError ? error.status : 400, {
        error:
          error instanceof SecurityError
            ? error.code
            : "PREFERENCES_UPDATE_FAILED",
      });
    }
  },
};
