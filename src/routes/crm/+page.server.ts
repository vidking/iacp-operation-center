import { lifecycleConfigured } from "#lib/server/crm/service.ts";
export const load = ({ locals }) => ({
  canOperate:
    locals.user?.role === "Administrator" && lifecycleConfigured(locals.user),
});
