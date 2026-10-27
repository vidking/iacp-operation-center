import { it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
vi.mock("../src/lib/server/connections/transport.ts", async (original) => ({
  ...(await original<
    typeof import("../src/lib/server/connections/transport.ts")
  >()),
  secureJson: vi.fn(),
}));
import { secureJson } from "../src/lib/server/connections/transport";
import {
  createConnection,
  mutateConnection,
  portalData,
  listConnections,
  associatedTenant,
  disconnectWorkspace,
  history,
  connectIacp,
} from "../src/lib/server/connections/service";
import { SecurityError } from "../src/lib/server/security/config";
import { db } from "../src/lib/server/security/database";
import { mockSource } from "./fixtures/mock";
import type { Principal } from "../src/lib/types/security";
const remote = "fda59e7c-ce1f-4a5e-9a5b-1371ca8c2407";
const admin: Principal = {
  id: "identity-admin",
  username: "administrador",
  tenantId: "administrador",
  role: "Administrator",
};
const token = randomBytes(32).toString("base64url");
const input = {
  name: "IACP",
  environment: "production",
  endpoint: "https://iacp-fixture.invalid",
  serviceIdentity: "Reader",
  credential: token,
};
function healthy(scope = remote) {
  vi.mocked(secureJson).mockImplementation(async (_endpoint, path) => {
    if (path === "/health/ready") return { status: "ready" };
    if (path === "/v1/observability")
      return { ...(await mockSource.observability()), tenant_id: scope };
    if (path.startsWith("/v1/events")) {
      const page = await mockSource.events();
      return {
        ...page,
        events: page.events.map((e) => ({ ...e, tenant_id: scope })),
      };
    }
    if (path.startsWith("/v1/operations/"))
      return (await mockSource.operations())[0];
    return mockSource.operations();
  });
}
it("discovers an authenticated scope independently of the local username and binds only on explicit activation", async () => {
  healthy();
  const c = createConnection(admin, input);
  const tested = await mutateConnection(admin, c.id, { action: "test" });
  expect(tested.status).toBe("valid");
  expect(tested.associationState).toBe("pending");
  expect(tested.tenantId).toBe("administrador");
  expect(tested.upstreamTenantId).toBe(remote);
  expect(associatedTenant(admin.tenantId)).toBeUndefined();
  const active = await mutateConnection(admin, c.id, { action: "activate" });
  expect(active.associationState).toBe("confirmed");
  expect(associatedTenant(admin.tenantId)).toBe(remote);
  expect((await portalData(admin)).status).toBe("stale");
  disconnectWorkspace(admin);
  expect(listConnections(admin)[0].credentialsConfigured).toBe(true);
  await mutateConnection(admin, c.id, { action: "activate" });
  expect((await portalData(admin)).status).toBe("stale");
  expect(JSON.stringify(history(admin, c.id))).not.toContain(token);
});
it("does not change an approved scope after rotation to a credential from another tenant", async () => {
  const c = listConnections(admin)[0];
  healthy("foreign-tenant");
  await mutateConnection(admin, c.id, { action: "rotate", credential: token });
  const tested = await mutateConnection(admin, c.id, { action: "test" });
  expect(tested.lastCode).toBe("UPSTREAM_TENANT_MISMATCH");
  expect(associatedTenant(admin.tenantId)).toBe(remote);
  await expect(
    mutateConnection(admin, c.id, { action: "activate" }),
  ).rejects.toThrow("VALIDATION_REQUIRED");
});
it("never serves a cached snapshot after a reader is revoked", async () => {
  healthy();
  const c = listConnections(admin)[0];
  await mutateConnection(admin, c.id, { action: "test" });
  await mutateConnection(admin, c.id, { action: "activate" });
  expect((await portalData(admin)).operations.length).toBeGreaterThan(0);
  vi.mocked(secureJson).mockRejectedValue(
    new SecurityError("UPSTREAM_UNAUTHORIZED", 502),
  );
  const denied = await portalData(admin);
  expect(denied.blocked).toBe(true);
  expect(denied.errorCode).toBe("UPSTREAM_UNAUTHORIZED");
  expect(denied.operations).toEqual([]);
  expect(
    db().prepare("SELECT * FROM snapshots WHERE connection_id=?").get(c.id),
  ).toBeUndefined();
  expect((await portalData(admin)).blocked).toBe(true);
});
it("preserves encrypted legacy records and requires revalidation instead of guessing an association", async () => {
  const legacyAdmin = { ...admin, id: "legacy", tenantId: "legacy-workspace" };
  const c = createConnection(legacyAdmin, input);
  const encryptedBefore = db()
    .prepare("SELECT secret FROM connections WHERE id=?")
    .get(c.id)!.secret;
  db()
    .prepare(
      "UPDATE connections SET last_code='OK',last_validation=?,validated_version=1 WHERE id=?",
    )
    .run(new Date().toISOString(), c.id);
  await expect(
    mutateConnection(legacyAdmin, c.id, { action: "activate" }),
  ).rejects.toThrow("ASSOCIATION_REQUIRED");
  healthy();
  await mutateConnection(legacyAdmin, c.id, { action: "test" });
  await mutateConnection(legacyAdmin, c.id, { action: "activate" });
  expect(
    db().prepare("SELECT secret FROM connections WHERE id=?").get(c.id)!.secret,
  ).toBe(encryptedBefore);
  const other = { ...admin, tenantId: "unrelated" };
  await expect(
    mutateConnection(other, c.id, { action: "test" }),
  ).rejects.toThrow("NOT_FOUND");
  expect(listConnections(other)).toEqual([]);
});
it("cannot enroll without an authorized credential or from a non-administrator", async () => {
  await expect(connectIacp(admin, {})).rejects.toThrow(
    "SERVICE_CREDENTIAL_REQUIRED",
  );
  await expect(
    connectIacp({ ...admin, role: "Viewer" }, { credential: token }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    connectIacp(admin, { credential: token, tenantId: remote }),
  ).rejects.toThrow();
});
it("imports a provisioned private credential once without returning it and fails closed on unsafe files", async () => {
  const policy = process.env.IACP_ALLOWED_TARGETS;
  const path = process.env.IACOC_DB_PATH! + ".reader";
  process.env.IACP_ALLOWED_TARGETS = JSON.stringify([
    { origin: "https://iac.cyberfuel.com", addresses: ["10.40.50.60"] },
  ]);
  process.env.IACOC_READER_CREDENTIAL_FILE = path;
  process.env.IACOC_READER_WORKSPACE = "provisioned";
  try {
    writeFileSync(path, token, { mode: 0o600 });
    healthy();
    const enrolled = await connectIacp(
      { ...admin, tenantId: "provisioned" },
      {},
    );
    expect(enrolled.connection.status).toBe("valid");
    expect(JSON.stringify(enrolled)).not.toContain(token);
    await expect(connectIacp(admin, {})).rejects.toThrow(
      "SERVICE_CREDENTIAL_FORBIDDEN",
    );
    process.env.IACOC_READER_WORKSPACE = admin.tenantId;
    process.env.IACOC_READER_CREDENTIAL_FILE = path + ".missing";
    await expect(connectIacp(admin, {})).rejects.toThrow(
      "SERVICE_CREDENTIAL_UNAVAILABLE",
    );
  } finally {
    process.env.IACP_ALLOWED_TARGETS = policy;
    delete process.env.IACOC_READER_CREDENTIAL_FILE;
    delete process.env.IACOC_READER_WORKSPACE;
  }
});
