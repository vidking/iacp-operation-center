import {
  lifecycleConfigured,
  lifecycleState,
} from "#lib/server/crm/service.ts";
export const load = ({ locals }) => ({
  canOperate:
    locals.user?.role === "Administrator" && lifecycleConfigured(locals.user),
  lifecycleState: locals.user
    ? lifecycleState(locals.user)
    : "connection-unavailable",
});
