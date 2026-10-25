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
  createConnection,
  listConnections,
  mutateConnection,
  portalData,
  useMock,
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
} from "../src/lib/server/security/auth";
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
import { mockSource } from "../src/lib/server/data/mock";
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
    ).rejects.toThrow("INVALID_USER");
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
    expect(data.mode).toBe("LIVE");
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
    expect(data.mode).toBe("LIVE");
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
    useMock(admin);
    expect((await portalData(viewer)).mode).toBe("MOCK");
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
