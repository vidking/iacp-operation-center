import { connectionContext } from "#lib/server/connections/service.ts";
export const load = ({ locals }) => {
  let canOperate = false;
  if (
    locals.user?.role === "Operator" ||
    locals.user?.role === "Administrator"
  ) {
    try {
      connectionContext(locals.user);
      canOperate = true;
    } catch {
      canOperate = false;
    }
  }
  return {
    canOperate,
  };
};
