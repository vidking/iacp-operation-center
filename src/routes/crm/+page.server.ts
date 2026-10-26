import { lifecycleState } from "#lib/server/crm/service.ts";
export const load = ({ locals }) => {
  const state = locals.user
    ? lifecycleState(locals.user)
    : "connection-unavailable";
  return {
    canOperate:
      locals.user?.role === "Administrator" &&
      state === "capability-unverified",
    lifecycleState: state,
  };
};
