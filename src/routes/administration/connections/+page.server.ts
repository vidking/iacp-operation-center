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
    credentialProvisioned:
      Boolean(process.env.IACOC_READER_CREDENTIAL_FILE) &&
      process.env.IACOC_READER_WORKSPACE === user.tenantId,
  };
};
