import {
  listConnections,
  workspaceStatus,
  authorizedRead,
} from "#lib/server/connections/service.ts";
import { requireRole } from "#lib/server/security/auth.ts";
import { config } from "#lib/server/security/config.ts";
export const load = async ({ locals }) => {
  const user = requireRole(locals.user, ["Administrator"]);
  let connections = listConnections(user);
  const selected =
    connections.find((connection) => connection.selected) ??
    connections.find(
      (connection) => connection.endpoint === "https://iac.cyberfuel.com",
    );
  let health: {
      tenant_id: string | null;
      dependencies: Record<string, string>;
      observed_at: string | null;
    } | null = null,
    healthError = "";
  // A rejected or stale reader must be recoverable from this page. Calling
  // authorizedRead while it is inactive turns the useful upstream 401 into a
  // secondary VALIDATION_REQUIRED error.
  if (selected?.active) {
    try {
      health = await authorizedRead(user, (source) => source.observability());
    } catch (e) {
      healthError = e instanceof Error ? e.message : "REQUEST_FAILED";
      connections = listConnections(user);
    }
  }
  return {
    health,
    healthError,
    connections,
    tenantId: user.tenantId,
    connectionStatus: workspaceStatus(user),
    liveEnabled: config().liveEnabled,
    credentialProvisioned:
      Boolean(process.env.IACOC_READER_CREDENTIAL_FILE) &&
      process.env.IACOC_READER_WORKSPACE === user.tenantId,
  };
};
