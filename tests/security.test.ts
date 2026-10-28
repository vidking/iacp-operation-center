import { describe, it, expect, vi, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Principal } from "../src/lib/types/security";
vi.mock("../src/lib/server/connections/transport.ts", async (original) => {
  const actual =
    await original<
      typeof import("../src/lib/server/connections/transport.ts")
    >();
  return { ...actual, secureJson: vi.fn() };
});
import {
  secureJson,
  allowedTarget,
  pinnedAddress,
} from "../src/lib/server/connections/transport";
import {
  destinationStatus,
  createConnection,
  listConnections,
  mutateConnection,
  portalData,
  disconnectWorkspace,
  history,
  liveSource,
} from "../src/lib/server/connections/service";
import {
  createUser,
  login,
  session,
  logout,
  changeUser,
  requireRole,
  throttle,
  currentUser,
  listUsers,
  updateOwnProfile,
  createManagedUser,
  resetManagedUserPassword,
  updateManagedUser,
} from "../src/lib/server/security/auth";
import { SecurityError } from "../src/lib/server/security/config";
import { db, setSetting } from "../src/lib/server/security/database";
import {
  encryptSecret,
  decryptSecret,
} from "../src/lib/server/security/crypto";
import {
  checkOrigin,
  checkCsrf,
  boundedBody,
} from "../src/lib/server/security/http";
import { mockSource } from "./fixtures/mock";
const admin: Principal = {
  id: "admin-fixture",
  username: "admin-fixture",
  role: "Administrator",
  tenantId: "demo",
};
const viewer: Principal = { ...admin, id: "viewer-fixture", role: "Viewer" };
const other: Principal = { ...admin, tenantId: "other" };
const token = randomBytes(32).toString("base64url");
const input = {
  name: "IACP Fixture",
  environment: "development",
  endpoint: "https://iacp-fixture.invalid",
  serviceIdentity: "Reader Fixture",
  credential: token,
};
let id = "";
describe("local authentication and server authorization", () => {
  it("hashes Argon2id, rotates sessions and revokes at logout/password changes", async () => {
    const password = randomBytes(24).toString("base64url");
    await createUser("unit.viewer", password, "Viewer", "demo");
    const row = db()
      .prepare("SELECT password_hash FROM users WHERE username=?")
      .get("unit.viewer") as { password_hash: string };
    expect(row.password_hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1/);
    expect(row.password_hash).not.toContain(password);
    await expect(
      login("unit.viewer", "incorrect-password", "fixture1"),
    ).rejects.toThrow("INVALID_CREDENTIALS");
    const signed = await login("unit.viewer", password, "fixture1");
    expect(session(signed.token)?.user.role).toBe("Viewer");
    expect(
      db()
        .prepare("SELECT id_hash FROM sessions")
        .all()
        .map((r) => r.id_hash),
    ).not.toContain(signed.token);
    const second = await login("unit.viewer", password, "fixture1");
    expect(second.token).not.toBe(signed.token);
    logout(signed.token);
    expect(session(signed.token)).toBeNull();
    await changeUser("unit.viewer", {
      password: randomBytes(24).toString("base64url"),
    });
    expect(session(second.token)).toBeNull();
  });
  it("has idle and absolute expiry", async () => {
    const password = randomBytes(24).toString("base64url");
    await createUser("unit.expiry", password, "Operator", "demo");
    const signed = await login("unit.expiry", password, "fixture2");
    expect(session(signed.token, Date.now() + 1800_001)).toBeNull();
    const signed2 = await login("unit.expiry", password, "fixture2");
    db()
      .prepare("UPDATE sessions SET created_at=?")
      .run(Date.now() - 8 * 3600_000 - 1);
    expect(session(signed2.token)).toBeNull();
  });
  it("refuses missing roles, non-administrators and default/short credentials", async () => {
    expect(() => requireRole(undefined)).toThrow();
    expect(() => requireRole(viewer, ["Administrator"])).toThrow("FORBIDDEN");
    await expect(
      createUser("invalid", "short", "Administrator", "demo"),
    ).rejects.toThrow("INVALID_PASSWORD");
    expect(() => createConnection(viewer, input)).toThrow("FORBIDDEN");
  });
  it("enforces persistent limits and Origin plus session CSRF", () => {
    throttle("unit-limit", 1, 60_000);
    expect(() => throttle("unit-limit", 1, 60_000)).toThrow(
      "TOO_MANY_ATTEMPTS",
    );
    const req = new Request("https://iacoc.test/api", {
      method: "POST",
      headers: { Origin: "https://evil.invalid" },
    });
    expect(() => checkOrigin(req)).toThrow();
    expect(() =>
      checkCsrf(
        new Request("https://iacoc.test"),
        { _csrf: "bad" },
        "expected",
      ),
    ).toThrow();
    expect(() =>
      checkCsrf(
        new Request("https://iacoc.test", {
          headers: { "X-CSRF-Token": "expected" },
        }),
        {},
        "expected",
      ),
    ).not.toThrow();
  });
  it("bounds chunked mutation bodies", async () => {
    await expect(
      boundedBody(
        new Request("https://iacoc.test", {
          method: "POST",
          body: "x".repeat(16385),
        }),
      ),
    ).rejects.toThrow("BODY_TOO_LARGE");
  });
});
describe("encryption, connection lifecycle and tenant isolation", () => {
  it("creates encrypted credentials and returns metadata only", () => {
    const c = createConnection(admin, input);
    id = c.id;
    expect(c.credentialsConfigured).toBe(true);
    const row = db()
      .prepare("SELECT secret FROM connections WHERE id=?")
      .get(id) as { secret: string };
    expect(row.secret).not.toContain(token);
    expect(decryptSecret(row.secret, `${id}:demo:${input.endpoint}`)).toBe(
      token,
    );
    expect(JSON.stringify(c)).not.toContain(token);
    expect(JSON.stringify(listConnections(admin))).not.toContain(token);
    expect(listConnections(other)).toEqual([]);
    expect(() => history(other, id)).toThrow("NOT_FOUND");
    expect(() =>
      decryptSecret(row.secret, `${id}:other:${input.endpoint}`),
    ).toThrow("CREDENTIAL_UNAVAILABLE");
    expect(() =>
      decryptSecret(
        row.secret.replace('"v":1', '"v":2'),
        `${id}:demo:${input.endpoint}`,
      ),
    ).toThrow();
  });
  it("encrypts with unique nonces and authenticates tampering", () => {
    const a = encryptSecret(token, "context"),
      b = encryptSecret(token, "context");
    expect(a).not.toBe(b);
    const value = JSON.parse(a);
    value.data = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(JSON.stringify(value), "context")).toThrow();
  });
  it("cannot activate before validation; tests only fixed GET contracts", async () => {
    await expect(
      mutateConnection(admin, id, { action: "activate" }),
    ).rejects.toThrow("VALIDATION_REQUIRED");
    const ops = await mockSource.operations();
    vi.mocked(secureJson).mockImplementation(async (_endpoint, path) =>
      path === "/health/ready"
        ? { status: "ready" }
        : path === "/v1/observability"
          ? mockSource.observability()
          : path.startsWith("/v1/events")
            ? mockSource.events()
            : path === "/v1/operations/" + ops[0].operation_id
              ? ops[0]
              : ops,
    );
    expect((await mutateConnection(admin, id, { action: "test" })).status).toBe(
      "valid",
    );
    await mutateConnection(admin, id, { action: "activate" });
    expect(liveSource(viewer).row.id).toBe(id);
    const data = await portalData(viewer);
    expect(data.status).toBe("stale");
    expect(data.operations).toHaveLength(6);
    expect(data.operations[2].status).toBe("failed");
    expect(data.operations[2].normalized_status).toBe("uncertain");
    expect(
      vi
        .mocked(secureJson)
        .mock.calls.every((call) => /^\/(health\/ready|v1\/)/.test(call[1])),
    ).toBe(true);
  });
  it("keeps stale evidence on errors and never falls back to MOCK", async () => {
    vi.mocked(secureJson).mockRejectedValue(
      new Error("upstream-sensitive-text"),
    );
    const data = await portalData(viewer);
    expect(data.status).toBe("degraded");
    expect(data.freshness).toBe("stale");
    expect(data.partial).toBe(true);
    expect(JSON.stringify(data)).not.toContain("upstream-sensitive-text");
  });
  it("invalidates activation on credential rotation and records no secrets in audit", async () => {
    const next = randomBytes(24).toString("base64url");
    await mutateConnection(admin, id, { action: "rotate", credential: next });
    expect(() => liveSource(viewer)).toThrow("VALIDATION_REQUIRED");
    const live = await portalData(viewer);
    expect(live.blocked).toBe(true);
    expect(live.operations).toEqual([]);
    expect(JSON.stringify(history(admin, id))).not.toContain(next);
    expect(() =>
      db().prepare("UPDATE audit SET detail=?").run("tampered"),
    ).toThrow();
    disconnectWorkspace(admin);
    expect((await portalData(viewer)).status).toBe("disconnected");
  });
  it("refuses LIVE without configuration or key material and guards other tenants", async () => {
    setSetting("mode:other", "LIVE");
    const data = await portalData(other);
    expect(data.blocked).toBe(true);
    expect(data.operations).toEqual([]);
    expect(() => history(other, id)).toThrow();
    const file = process.env.IACOC_KEYRING_FILE;
    process.env.IACOC_KEYRING_FILE = "/nonexistent-fixture-key";
    try {
      expect(() => createConnection(admin, input)).toThrow(
        "KEYRING_UNAVAILABLE",
      );
    } finally {
      process.env.IACOC_KEYRING_FILE = file;
    }
  });
});
describe("SSRF policy and DNS pinning", () => {
  it.each([
    "http://iacp-fixture.invalid",
    "https://evil.invalid",
    "https://iacp-fixture.invalid@evil.invalid",
    "https://iacp-fixture.invalid/path",
    "https://iacp-fixture.invalid?url=evil",
    "https://iacp-fixture.invalid/#x",
    "https://iacp-fixture.invalid.",
    "file:///etc/passwd",
    "https://2130706433",
  ])("rejects %s", (endpoint) => {
    expect(() => allowedTarget(endpoint)).toThrow();
  });
  it("rejects metadata, loopback, IPv4 mapped loopback, mixed DNS and rebinding", async () => {
    const resolver = vi
      .fn()
      .mockResolvedValue([{ address: "10.40.50.60", family: 4 }]);
    expect((await pinnedAddress(input.endpoint, resolver)).address).toBe(
      "10.40.50.60",
    );
    for (const address of [
      "127.0.0.1",
      "169.254.169.254",
      "::ffff:127.0.0.1",
      "::1",
      "0.0.0.0",
      "224.0.0.1",
      "10.40.50.61",
    ]) {
      resolver.mockResolvedValue([
        { address: "10.40.50.60", family: 4 },
        { address, family: address.includes(":") ? 6 : 4 },
      ]);
      await expect(pinnedAddress(input.endpoint, resolver)).rejects.toThrow(
        "UPSTREAM_DNS_DENIED",
      );
    }
  });
});

it("rechecks tenant attestation before operations and rejects foreign evidence", async () => {
  const { readonlySource } =
    await import("../src/lib/server/connections/source");
  const source = readonlySource({
    endpoint: input.endpoint,
    tenantId: "demo",
    token,
  });
  vi.mocked(secureJson).mockResolvedValue({
    ...(await mockSource.observability()),
    tenant_id: "foreign",
  });
  await expect(source.operations()).rejects.toThrow("UPSTREAM_TENANT_MISMATCH");
  await expect(source.operation("demo-op-001")).rejects.toThrow(
    "UPSTREAM_TENANT_MISMATCH",
  );
  await expect(source.observability()).rejects.toThrow(
    "UPSTREAM_TENANT_MISMATCH",
  );
});

it("cannot issue a session from a password verified before a concurrent rotation", async () => {
  const { createSessionForUser } =
    await import("../src/lib/server/security/auth");
  const userId = await createUser(
    "unit.race",
    randomBytes(24).toString("base64url"),
    "Viewer",
    "demo",
  );
  const row = db()
    .prepare("SELECT password_hash FROM users WHERE id=?")
    .get(userId) as { password_hash: string };
  await changeUser("unit.race", {
    password: randomBytes(24).toString("base64url"),
  });
  expect(() => createSessionForUser(userId, row.password_hash)).toThrow(
    "INVALID_CREDENTIALS",
  );
});

describe("connection assistant", () => {
  const wizardAdmin = { ...admin, id: "wizard-admin" };
  function connection() {
    return createConnection(wizardAdmin, input);
  }
  function healthy(empty = false) {
    vi.mocked(secureJson).mockImplementation(async (_endpoint, path) => {
      if (path === "/health/ready") return { status: "ready" };
      if (path === "/v1/observability") return mockSource.observability();
      if (path.startsWith("/v1/events")) return mockSource.events();
      if (path.startsWith("/v1/operations/"))
        return (await mockSource.operations())[0];
      return empty ? [] : mockSource.operations();
    });
  }
  it("checks destination authorization before collecting a credential, with no network or policy mutation", () => {
    const policy = process.env.IACP_ALLOWED_TARGETS;
    vi.mocked(secureJson).mockClear();
    expect(destinationStatus(wizardAdmin, input.endpoint)).toBe("OK");
    expect(destinationStatus(wizardAdmin, "https://unapproved.invalid")).toBe(
      "ENDPOINT_NOT_ALLOWED",
    );
    expect(() => destinationStatus(viewer, input.endpoint)).toThrow(
      "FORBIDDEN",
    );
    expect(process.env.IACP_ALLOWED_TARGETS).toBe(policy);
    expect(secureJson).not.toHaveBeenCalled();
    process.env.IACP_ALLOWED_TARGETS = "invalid";
    try {
      expect(destinationStatus(wizardAdmin, input.endpoint)).toBe(
        "DESTINATION_POLICY_INVALID",
      );
    } finally {
      process.env.IACP_ALLOWED_TARGETS = policy;
    }
  });
  it("persists per-endpoint validation, does not activate implicitly, and keeps the connection after MOCK", async () => {
    disconnectWorkspace(wizardAdmin);
    const c = connection();
    healthy();
    const tested = await mutateConnection(wizardAdmin, c.id, {
      action: "test",
    });
    expect(tested.checks.map((x) => x.status)).toEqual(Array(5).fill("passed"));
    expect(tested.active).toBe(false);
    expect((await portalData(wizardAdmin)).status).toBe("disconnected");
    expect(
      listConnections(wizardAdmin).find((x) => x.id === c.id)?.checks,
    ).toEqual(tested.checks);
    await mutateConnection(wizardAdmin, c.id, { action: "activate" });
    expect((await portalData(wizardAdmin)).status).toBe("stale");
    disconnectWorkspace(wizardAdmin);
    const retained = listConnections(wizardAdmin).find((x) => x.id === c.id)!;
    expect(retained.credentialsConfigured).toBe(true);
    expect(retained.enabled).toBe(true);
    expect(retained.active).toBe(false);
    expect(retained.status).toBe("valid");
    expect(JSON.stringify(retained)).not.toContain(token);
    expect(JSON.stringify(history(wizardAdmin, c.id))).not.toContain(token);
  });
  it("accepts an empty operation list and explains why detail was skipped", async () => {
    const c = connection();
    healthy(true);
    const tested = await mutateConnection(wizardAdmin, c.id, {
      action: "test",
    });
    expect(tested.lastCode).toBe("OK");
    expect(tested.checks.at(-1)).toMatchObject({
      id: "operation",
      status: "skipped",
      code: "NO_OPERATIONS",
    });
  });
  it("reports tenant mismatch and stops before querying operations", async () => {
    const c = connection();
    vi.mocked(secureJson)
      .mockReset()
      .mockImplementation(async (_e, path) =>
        path === "/health/ready"
          ? { status: "ready" }
          : { ...(await mockSource.observability()), tenant_id: "foreign" },
      );
    const tested = await mutateConnection(wizardAdmin, c.id, {
      action: "test",
    });
    expect(tested.lastCode).toBe("UPSTREAM_TENANT_MISMATCH");
    expect(tested.checks[1]).toMatchObject({
      id: "observability",
      status: "failed",
    });
    expect(tested.checks[3].status).toBe("skipped");
    expect(vi.mocked(secureJson).mock.calls).toHaveLength(2);
    await expect(
      mutateConnection(wizardAdmin, c.id, { action: "activate" }),
    ).rejects.toThrow("VALIDATION_REQUIRED");
  });
  it.each(["UPSTREAM_UNAUTHORIZED", "UPSTREAM_FORBIDDEN"])(
    "records %s at the authentication step",
    async (code) => {
      const c = connection();
      vi.mocked(secureJson).mockImplementation(async (_e, path) => {
        if (path === "/health/ready") return { status: "ready" };
        throw new SecurityError(code, 502);
      });
      const tested = await mutateConnection(wizardAdmin, c.id, {
        action: "test",
      });
      expect(tested.lastCode).toBe(code);
      expect(tested.checks[1]).toMatchObject({ status: "failed", code });
      expect(JSON.stringify(tested)).not.toContain(token);
    },
  );
  it("explains operator-disabled LIVE, stale validation and invalidation on rotation", async () => {
    const c = connection();
    healthy();
    await mutateConnection(wizardAdmin, c.id, { action: "test" });
    process.env.LIVE_ENABLED = "false";
    try {
      expect(
        listConnections(wizardAdmin).find((x) => x.id === c.id)?.activationCode,
      ).toBe("LIVE_DISABLED");
      await expect(
        mutateConnection(wizardAdmin, c.id, { action: "activate" }),
      ).rejects.toThrow("LIVE_DISABLED");
    } finally {
      process.env.LIVE_ENABLED = "true";
    }
    db()
      .prepare("UPDATE connections SET last_validation=? WHERE id=?")
      .run(new Date(Date.now() - 300_001).toISOString(), c.id);
    const stale = listConnections(wizardAdmin).find((x) => x.id === c.id)!;
    expect(stale.status).toBe("stale");
    expect(stale.activationCode).toBe("VALIDATION_REQUIRED");
    await expect(
      mutateConnection(wizardAdmin, c.id, { action: "activate" }),
    ).rejects.toThrow("VALIDATION_REQUIRED");
    await mutateConnection(wizardAdmin, c.id, {
      action: "rotate",
      credential: token,
    });
    expect(
      listConnections(wizardAdmin).find((x) => x.id === c.id)?.checks,
    ).toEqual([]);
  });
});

describe("profile, workspace user administration and tenant-scoped RBAC", () => {
  it("migrates visible names, supports profile changes, and revokes sessions on password rotation", async () => {
    const suffix = randomBytes(8).toString("hex");
    const username = `profile.${suffix}`;
    const password = randomBytes(24).toString("base64url");
    const nextPassword = randomBytes(24).toString("base64url");
    const userId = await createUser(
      username,
      password,
      "Administrator",
      `tenant-${suffix}`,
      "test",
      "Perfil inicial",
    );
    const signed = await login(username, password, "profile-test");
    const actor = signed.user;
    expect(currentUser(actor)).toMatchObject({
      id: userId,
      username,
      displayName: "Perfil inicial",
      role: "Administrator",
      tenantId: `tenant-${suffix}`,
    });
    const updated = await updateOwnProfile(actor, {
      displayName: "Perfil actualizado",
      username: `${username}.renamed`,
      currentPassword: password,
      newPassword: nextPassword,
    });
    expect(updated).toMatchObject({
      username: `${username}.renamed`,
      displayName: "Perfil actualizado",
    });
    expect(session(signed.token)).toBeNull();
    await expect(login(username, password, "profile-test")).rejects.toThrow(
      "INVALID_CREDENTIALS",
    );
    const replacement = await login(
      `${username}.renamed`,
      nextPassword,
      "profile-test",
    );
    expect(session(replacement.token)?.user.displayName).toBe(
      "Perfil actualizado",
    );
  });

  it("keeps managed users inside the administrator tenant and protects the last administrator", async () => {
    const suffix = randomBytes(8).toString("hex");
    const tenantId = `managed-${suffix}`;
    const adminPassword = randomBytes(24).toString("base64url");
    const adminId = await createUser(
      `admin.${suffix}`,
      adminPassword,
      "Administrator",
      tenantId,
      "test",
      "Admin gestionado",
    );
    const admin: Principal = {
      id: adminId,
      username: `admin.${suffix}`,
      displayName: "Admin gestionado",
      role: "Administrator",
      tenantId,
    };
    const managed = await createManagedUser(admin, {
      username: `operator.${suffix}`,
      displayName: "Operador gestionado",
      role: "Operator",
      password: randomBytes(24).toString("base64url"),
    });
    expect(managed).toMatchObject({
      username: `operator.${suffix}`,
      displayName: "Operador gestionado",
      role: "Operator",
      tenantId,
    });
    expect(listUsers(admin).map((user) => user.tenantId)).toEqual([
      tenantId,
      tenantId,
    ]);
    const operator = { ...managed };
    expect(() => listUsers(operator)).toThrow("FORBIDDEN");
    await expect(
      updateManagedUser(admin, adminId, { role: "Operator" }),
    ).rejects.toThrow("LAST_ADMIN_REQUIRED");
    await expect(
      updateManagedUser(admin, managed.id, { disabled: true }),
    ).resolves.toMatchObject({ disabled: true });
    const foreign: Principal = { ...admin, tenantId: `other-${suffix}` };
    expect(listUsers(foreign)).toEqual([]);
    await expect(
      updateManagedUser(foreign, managed.id, { displayName: "No acceso" }),
    ).rejects.toThrow("USER_NOT_FOUND");
  });

  it("normalizes form booleans and separates password reset from profile edits", async () => {
    const suffix = randomBytes(8).toString("hex");
    const tenantId = `boolean-${suffix}`;
    const adminId = await createUser(
      `admin.${suffix}`,
      randomBytes(24).toString("base64url"),
      "Administrator",
      tenantId,
    );
    const admin: Principal = {
      id: adminId,
      username: `admin.${suffix}`,
      role: "Administrator",
      tenantId,
    };
    const password = randomBytes(24).toString("base64url");
    const managedId = await createManagedUser(admin, {
      username: `viewer.${suffix}`,
      displayName: "Lector",
      role: "Viewer",
      password,
    });
    await updateManagedUser(admin, managedId.id, {
      username: managedId.username,
      displayName: managedId.displayName,
      role: "Viewer",
      disabled: "false",
    });
    expect(listUsers(admin).find((u) => u.id === managedId.id)?.disabled).toBe(
      false,
    );
    await expect(
      updateManagedUser(admin, managedId.id, {
        username: managedId.username,
        displayName: managedId.displayName,
        role: "Viewer",
        password,
      }),
    ).rejects.toThrow("PASSWORD_RESET_SEPARATE");
    const replacement = randomBytes(24).toString("base64url");
    const signed = await login(managedId.username, password, "managed-reset");
    await resetManagedUserPassword(admin, managedId.id, {
      newPassword: replacement,
      confirmPassword: replacement,
      confirmReset: "true",
    });
    expect(session(signed.token)).toBeNull();
    await expect(
      login(managedId.username, password, "managed-reset"),
    ).rejects.toThrow("INVALID_CREDENTIALS");
    await expect(
      login(managedId.username, replacement, "managed-reset"),
    ).resolves.toBeTruthy();
  });
});
