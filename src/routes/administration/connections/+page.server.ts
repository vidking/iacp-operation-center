import { listConnections, modeFor } from "#lib/server/connections/service.ts";
import { requireRole } from "#lib/server/security/auth.ts";
import { config } from "#lib/server/security/config.ts";
export const load = ({ locals }) => {
  const user = requireRole(locals.user, ["Administrator"]);
  return {
    connections: listConnections(user),
    tenantId: user.tenantId,
    currentMode: modeFor(user.tenantId),
    liveEnabled: config().liveEnabled,
  };
};
