import { it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
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
  deleteConnection,
  listConnections,
  history,
  liveSource,
  modeFor,
  portalData,
} from "../src/lib/server/connections/service";
import { db, setting, setSetting } from "../src/lib/server/security/database";
import { decryptSecret } from "../src/lib/server/security/crypto";
import { mockSource } from "../src/lib/server/data/mock";
import type { Principal } from "../src/lib/types/security";
let sequence = 0;
const origin = "https://iacp-fixture.invalid";
const alias = "https://iacp-alias.invalid";
async function fixture() {
  const user: Principal = {
    id: "crud-" + ++sequence,
    username: "crud-admin",
    role: "Administrator",
    tenantId: "crud-" + sequence,
  };
  const secret = randomBytes(32).toString("base64url");
  const input = {
    name: "Producción",
    environment: "production",
    endpoint: origin,
    serviceIdentity: "Reader",
    credential: secret,
  };
  vi.mocked(secureJson).mockImplementation(async (_endpoint, path) => {
    if (path === "/health/ready") return { status: "ready" };
    if (path === "/v1/observability")
      return { ...(await mockSource.observability()), tenant_id: "scope-crud" };
    if (path.startsWith("/v1/events")) {
      const page = await mockSource.events();
      return {
        ...page,
        events: page.events.map((e) => ({ ...e, tenant_id: "scope-crud" })),
      };
    }
    if (path.startsWith("/v1/operations/"))
      return (await mockSource.operations())[0];
    return mockSource.operations();
  });
  const active = createConnection(user, input);
  const inactive = createConnection(user, { ...input, name: "Anterior" });
  const failed = createConnection(user, { ...input, name: "Fallida" });
  db()
    .prepare(
      "UPDATE connections SET last_code='UPSTREAM_UNAUTHORIZED' WHERE id=?",
    )
    .run(failed.id);
  await mutateConnection(user, active.id, { action: "test" });
  await mutateConnection(user, active.id, { action: "activate" });
  await portalData(user);
  return { user, secret, input, active, inactive, failed };
}
const row = (id: string) =>
  db().prepare("SELECT * FROM connections WHERE id=?").get(id)!;
it("preserves the active authorization, cipher and snapshots when only metadata changes", async () => {
  const f = await fixture(),
    before = { ...row(f.active.id) };
  const snapshot = db()
    .prepare("SELECT * FROM snapshots WHERE connection_id=?")
    .get(f.active.id);
  const changed = await mutateConnection(f.user, f.active.id, {
    action: "update",
    ...f.input,
    credential: undefined,
    name: "Nuevo nombre",
    environment: "staging",
    serviceIdentity: "Nueva etiqueta",
    expectedUpdatedAt: before.updated_at,
  });
  expect(changed.active).toBe(true);
  expect(changed.credentialVersion).toBe(before.credential_version);
  expect(changed.lastValidation).toBe(before.last_validation);
  expect(row(f.active.id).secret).toBe(before.secret);
  expect(
    db()
      .prepare("SELECT * FROM snapshots WHERE connection_id=?")
      .get(f.active.id),
  ).toEqual(snapshot);
  expect(modeFor(f.user.tenantId)).toBe("LIVE");
  expect(liveSource(f.user).row.id).toBe(f.active.id);
  await expect(
    mutateConnection(f.user, f.active.id, {
      action: "update",
      ...f.input,
      credential: undefined,
      expectedUpdatedAt: before.updated_at,
    }),
  ).rejects.toThrow("CONNECTION_CHANGED");
});
it("edits an inactive failed record without changing another active connection", async () => {
  const f = await fixture(),
    before = { ...row(f.active.id) };
  const changed = await mutateConnection(f.user, f.failed.id, {
    action: "update",
    ...f.input,
    credential: undefined,
    name: "Renombrada",
  });
  expect(changed.lastCode).toBe("UPSTREAM_UNAUTHORIZED");
  expect(changed.selectedForLive).toBe(false);
  expect(row(f.active.id)).toEqual(before);
  expect(liveSource(f.user).row.id).toBe(f.active.id);
});
it("changes an allowed endpoint, rewraps its secret and requires validation", async () => {
  const f = await fixture(),
    policy = process.env.IACP_ALLOWED_TARGETS;
  process.env.IACP_ALLOWED_TARGETS = JSON.stringify([
    { origin, addresses: ["10.40.50.60"] },
    { origin: alias, addresses: ["10.40.50.60"] },
  ]);
  try {
    const changed = await mutateConnection(f.user, f.active.id, {
      action: "update",
      ...f.input,
      credential: undefined,
      endpoint: alias,
    });
    expect(changed.credentialVersion).toBe(2);
    expect(changed.status).toBe("unknown");
    expect(changed.selectedForLive).toBe(true);
    expect(changed.active).toBe(false);
    expect(
      decryptSecret(
        row(f.active.id).secret as string,
        f.active.id + ":" + f.user.tenantId + ":" + alias,
      ),
    ).toBe(f.secret);
    expect(() => liveSource(f.user)).toThrow("VALIDATION_REQUIRED");
    await expect(
      mutateConnection(f.user, f.active.id, { action: "activate" }),
    ).rejects.toThrow("VALIDATION_REQUIRED");
    await mutateConnection(f.user, f.active.id, { action: "test" });
    expect(() => liveSource(f.user)).toThrow("VALIDATION_REQUIRED");
    await mutateConnection(f.user, f.active.id, { action: "activate" });
    expect(liveSource(f.user).row.id).toBe(f.active.id);
  } finally {
    process.env.IACP_ALLOWED_TARGETS = policy;
  }
});
it("supports atomic metadata and credential replacement without exposing either secret", async () => {
  const f = await fixture(),
    replacement = randomBytes(32).toString("base64url");
  const changed = await mutateConnection(f.user, f.active.id, {
    action: "update",
    ...f.input,
    name: "Con clave nueva",
    credential: replacement,
  });
  expect(changed.credentialVersion).toBe(2);
  expect(changed.lastValidation).toBeNull();
  expect(JSON.stringify(changed)).not.toContain(replacement);
  expect(JSON.stringify(history(f.user, f.active.id))).not.toContain(
    replacement,
  );
  expect(JSON.stringify(history(f.user, f.active.id))).not.toContain(f.secret);
  expect(() => liveSource(f.user)).toThrow("VALIDATION_REQUIRED");
});
it("deletes a failed record, secret, validation and snapshot while preserving other connections", async () => {
  const f = await fixture(),
    otherCipher = row(f.inactive.id).secret;
  setSetting(
    "validation:" + f.failed.id,
    JSON.stringify({ version: 1, checks: [] }),
  );
  db()
    .prepare("INSERT INTO snapshots VALUES(?,?,?,?)")
    .run(f.failed.id, 1, "{}", new Date().toISOString());
  expect(
    deleteConnection(f.user, f.failed.id, {
      action: "delete",
      confirmId: f.failed.id,
    }).deleted,
  ).toBe(true);
  expect(row(f.failed.id)).toBeUndefined();
  expect(setting("validation:" + f.failed.id)).toBeUndefined();
  expect(
    db()
      .prepare("SELECT * FROM snapshots WHERE connection_id=?")
      .get(f.failed.id),
  ).toBeUndefined();
  expect(row(f.inactive.id).secret).toBe(otherCipher);
  expect(listConnections(f.user)).toHaveLength(2);
  expect(liveSource(f.user).row.id).toBe(f.active.id);
  expect(JSON.stringify(history(f.user, f.failed.id))).toContain(
    "connection.deleted",
  );
  expect(JSON.stringify(history(f.user, f.failed.id))).not.toContain(f.secret);
});
it("deletes inactive and incomplete records without needing to decrypt them", async () => {
  const f = await fixture();
  db()
    .prepare("UPDATE connections SET secret='corrupt-fixture' WHERE id=?")
    .run(f.inactive.id);
  const key = process.env.IACOC_KEYRING_FILE;
  process.env.IACOC_KEYRING_FILE = "/missing-test-key";
  try {
    deleteConnection(f.user, f.inactive.id, {
      action: "delete",
      confirmId: f.inactive.id,
    });
  } finally {
    process.env.IACOC_KEYRING_FILE = key;
  }
  expect(row(f.inactive.id)).toBeUndefined();
  expect(liveSource(f.user).row.id).toBe(f.active.id);
});
it("requires confirmation and prevents deletion of a selected LIVE connection even if revoked", async () => {
  const f = await fixture();
  expect(() =>
    deleteConnection(f.user, f.inactive.id, {
      action: "delete",
      confirmId: f.active.id,
    }),
  ).toThrow("DELETE_CONFIRMATION_REQUIRED");
  expect(() =>
    deleteConnection(f.user, f.active.id, {
      action: "delete",
      confirmId: f.active.id,
    }),
  ).toThrow("CONNECTION_IN_USE");
  db()
    .prepare(
      "UPDATE connections SET last_code='UPSTREAM_UNAUTHORIZED',validated_version=NULL WHERE id=?",
    )
    .run(f.active.id);
  expect(
    listConnections(f.user).find((c) => c.id === f.active.id)?.selectedForLive,
  ).toBe(true);
  expect(() =>
    deleteConnection(f.user, f.active.id, {
      action: "delete",
      confirmId: f.active.id,
    }),
  ).toThrow("CONNECTION_IN_USE");
  await mutateConnection(f.user, f.active.id, { action: "disable" });
  expect(modeFor(f.user.tenantId)).toBe("MOCK");
  deleteConnection(f.user, f.active.id, {
    action: "delete",
    confirmId: f.active.id,
  });
  expect(listConnections(f.user)).toHaveLength(2);
});
it("disables and enables only the addressed record, and never implicitly resumes LIVE", async () => {
  const f = await fixture(),
    before = { ...row(f.active.id) };
  await mutateConnection(f.user, f.inactive.id, { action: "disable" });
  expect(row(f.active.id)).toEqual(before);
  expect(liveSource(f.user).row.id).toBe(f.active.id);
  await mutateConnection(f.user, f.active.id, { action: "disable" });
  const enabled = await mutateConnection(f.user, f.active.id, {
    action: "enable",
  });
  expect(enabled.active).toBe(false);
  expect(enabled.selectedForLive).toBe(false);
  await mutateConnection(f.user, f.active.id, { action: "test" });
  expect(modeFor(f.user.tenantId)).toBe("MOCK");
});
it("rejects Viewer, Operator and other workspace mutations and deleted-record history", async () => {
  const f = await fixture();
  for (const role of ["Viewer", "Operator"] as const) {
    const actor = { ...f.user, role };
    expect(() =>
      deleteConnection(actor, f.inactive.id, {
        action: "delete",
        confirmId: f.inactive.id,
      }),
    ).toThrow("FORBIDDEN");
    await expect(
      mutateConnection(actor, f.inactive.id, { action: "disable" }),
    ).rejects.toThrow("FORBIDDEN");
  }
  const foreign = { ...f.user, tenantId: "different" };
  expect(() =>
    deleteConnection(foreign, f.inactive.id, {
      action: "delete",
      confirmId: f.inactive.id,
    }),
  ).toThrow("NOT_FOUND");
  deleteConnection(f.user, f.inactive.id, {
    action: "delete",
    confirmId: f.inactive.id,
  });
  expect(() => history(foreign, f.inactive.id)).toThrow("NOT_FOUND");
  expect(row(f.active.id)).toBeDefined();
});

it("does not return or recache an in-flight read after a connection test discovers revocation", async () => {
  const f = await fixture();
  const previous = vi.mocked(secureJson).getMockImplementation()!;
  let entered!: () => void, finish!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  vi.mocked(secureJson).mockImplementation(async (endpoint, path, token) => {
    if (path.startsWith("/v1/operations?")) {
      entered();
      await gate;
    }
    return previous(endpoint, path, token);
  });
  const pending = portalData(f.user);
  await started;
  const { SecurityError } = await import("../src/lib/server/security/config");
  vi.mocked(secureJson).mockRejectedValue(
    new SecurityError("UPSTREAM_UNAUTHORIZED", 502),
  );
  await mutateConnection(f.user, f.active.id, { action: "test" });
  finish();
  const result = await pending;
  expect(result.blocked).toBe(true);
  expect(result.operations).toEqual([]);
  expect(
    db()
      .prepare("SELECT * FROM snapshots WHERE connection_id=?")
      .get(f.active.id),
  ).toBeUndefined();
});
