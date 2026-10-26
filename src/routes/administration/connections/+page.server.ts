import { lifecycleConfigured } from "#lib/server/crm/service.ts";
import {
  listConnections,
  workspaceStatus,
  authorizedRead,
} from "#lib/server/connections/service.ts";
import { requireRole } from "#lib/server/security/auth.ts";
import { config } from "#lib/server/security/config.ts";
export const load = async ({ locals }) => {
  const user = requireRole(locals.user, ["Administrator"]);
  let health: {
      dependencies: Record<string, string>;
      observed_at: string;
    } | null = null,
    healthError = "";
  try {
    health = await authorizedRead(user, (source) => source.observability());
  } catch (e) {
    healthError = e instanceof Error ? e.message : "REQUEST_FAILED";
  }
  return {
    health,
    healthError,
    connections: listConnections(user),
    lifecycleConfigured: lifecycleConfigured(user),
    tenantId: user.tenantId,
    connectionStatus: workspaceStatus(user),
    liveEnabled: config().liveEnabled,
    credentialProvisioned:
      Boolean(process.env.IACOC_READER_CREDENTIAL_FILE) &&
      process.env.IACOC_READER_WORKSPACE === user.tenantId,
  };
};
