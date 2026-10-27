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
  portalData,
  disconnectWorkspace,
  workspaceStatus,
  authorizedRead,
} from "../src/lib/server/connections/service";
import { SecurityError } from "../src/lib/server/security/config";
import { db, setSetting } from "../src/lib/server/security/database";
import type { Principal } from "../src/lib/types/security";
let n = 0;
function user(): Principal {
  return {
    id: "state-" + ++n,
    username: "state-admin",
    role: "Administrator",
    tenantId: "state-" + n,
  };
}
const op = {
  operation_id: "production-operation",
  instance_id: "instance",
  kind: "provision",
  status: "failed",
  normalized_status: "uncertain",
  requested_by: "reader",
  error_code: "UNCERTAIN",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
function upstream({ dependency = "ready", empty = false, old = false } = {}) {
  vi.mocked(secureJson)
    .mockReset()
    .mockImplementation(async (_endpoint, path) => {
      if (path === "/health/ready") return { status: "ready" };
      if (path === "/v1/observability")
        return {
          tenant_id: "authenticated-scope",
          observed_at: new Date(Date.now() - (old ? 300000 : 0)).toISOString(),
          dependencies: { orchestrator: dependency },
          active_operations: empty ? 0 : 1,
          uncertain_operations: empty ? 0 : 1,
          oldest_active_age_seconds: 0,
          worker_liveness: "unknown",
          queue_scope: "not-disclosed",
        };
      if (path.startsWith("/v1/events")) return { events: [], next_after: 0 };
      if (path.startsWith("/v1/operations/")) return op;
      return empty ? [] : [op];
    });
}
async function connected(options = {}) {
  const actor = user();
  upstream(options);
  const c = createConnection(actor, {
    name: "IACP",
    environment: "production",
    endpoint: "https://iacp-fixture.invalid",
    serviceIdentity: "Reader",
    credential: randomBytes(32).toString("base64url"),
  });
  await mutateConnection(actor, c.id, { action: "test" });
  await mutateConnection(actor, c.id, { action: "activate" });
  return { actor, c };
}
it("starts disconnected and ignores obsolete environment and persisted laboratory selections", async () => {
  const actor = user();
  process.env.DATA_MODE = "MOCK";
  setSetting("mode:" + actor.tenantId, "MOCK");
  vi.mocked(secureJson).mockClear();
  const data = await portalData(actor);
  expect(data.status).toBe("disconnected");
  expect(data.operations).toEqual([]);
  expect(data.events).toEqual([]);
  expect(data.diagnostics).toBeNull();
  expect(secureJson).not.toHaveBeenCalled();
});
it("uses four fixed reads with request-local attestation and never infers worker health", async () => {
  const { actor } = await connected();
  vi.mocked(secureJson).mockClear();
  const data = await portalData(actor);
  expect(data.status).toBe("connected");
  expect(data.diagnostics?.worker_liveness).toBe("unknown");
  expect(
    vi
      .mocked(secureJson)
      .mock.calls.map((c) => c[1])
      .sort(),
  ).toEqual(
    [
      "/health/ready",
      "/v1/events?after=0&limit=100",
      "/v1/observability",
      "/v1/operations?limit=50&offset=0",
    ].sort(),
  );
  expect(workspaceStatus(actor)).toBe("connected");
});
it("bootstraps the event feed to its published tail instead of showing the first page", async () => {
  const { actor } = await connected();
  const events = Array.from({ length: 120 }, (_, index) => ({
    event_id: index + 1,
    correlation_id: op.operation_id,
    operation_id: op.operation_id,
    instance_id: op.instance_id,
    tenant_id: "authenticated-scope",
    occurred_at: new Date(Date.now() + index).toISOString(),
    kind: op.kind,
    status: op.normalized_status,
    code: "observed",
    actor: "reader",
    service: "IACP Orchestrator" as const,
  }));
  const eventCursors: number[] = [];
  vi.mocked(secureJson).mockImplementation(async (_endpoint, path) => {
    if (path === "/health/ready") return { status: "ready" };
    if (path === "/v1/observability")
      return {
        tenant_id: "authenticated-scope",
        observed_at: new Date().toISOString(),
        dependencies: { orchestrator: "ready" },
        active_operations: 1,
        uncertain_operations: 1,
        oldest_active_age_seconds: 0,
        worker_liveness: "unknown",
        queue_scope: "not-disclosed",
      };
    if (path.startsWith("/v1/events")) {
      const after = Number(
        new URL(path, "https://fixture.invalid").searchParams.get("after"),
      );
      eventCursors.push(after);
      return {
        events: events.filter((event) => event.event_id > after).slice(0, 100),
        next_after: Math.min(120, after + 100),
      };
    }
    return [op];
  });
  const data = await portalData(actor);
  expect(data.events).toHaveLength(100);
  expect(data.events.at(-1)?.event_id).toBe(120);
  expect(eventCursors).toEqual([0, 100]);
});
it("catches up a stale event snapshot through incremental pages", async () => {
  const { actor, c } = await connected();
  const events = Array.from({ length: 320 }, (_, index) => ({
    event_id: index + 1,
    correlation_id: op.operation_id,
    operation_id: op.operation_id,
    instance_id: op.instance_id,
    tenant_id: "authenticated-scope",
    occurred_at: new Date(Date.now() + index).toISOString(),
    kind: op.kind,
    status: op.normalized_status,
    code: "observed",
    actor: "reader",
    service: "IACP Orchestrator" as const,
  }));
  const eventCursors: number[] = [];
  vi.mocked(secureJson).mockImplementation(async (_endpoint, path) => {
    if (path === "/health/ready") return { status: "ready" };
    if (path === "/v1/observability")
      return {
        tenant_id: "authenticated-scope",
        observed_at: new Date().toISOString(),
        dependencies: { orchestrator: "ready" },
        active_operations: 1,
        uncertain_operations: 1,
        oldest_active_age_seconds: 0,
        worker_liveness: "unknown",
        queue_scope: "not-disclosed",
      };
    if (path.startsWith("/v1/events")) {
      const after = Number(
        new URL(path, "https://fixture.invalid").searchParams.get("after"),
      );
      eventCursors.push(after);
      return {
        events: events.filter((event) => event.event_id > after).slice(0, 100),
        next_after: Math.min(320, after + 100),
      };
    }
    return [op];
  });
  const snapshot = {
    events: events.slice(0, 100),
    eventCursor: 100,
  };
  db()
    .prepare(
      "INSERT INTO snapshots VALUES(?,?,?,?) ON CONFLICT(connection_id) DO UPDATE SET version=excluded.version,payload=excluded.payload,saved_at=excluded.saved_at",
    )
    .run(c.id, 1, JSON.stringify(snapshot), new Date().toISOString());
  setSetting("events-bootstrap-v2:" + c.id, "done");
  const data = await portalData(actor);
  expect(data.events).toHaveLength(100);
  expect(data.events.at(-1)?.event_id).toBe(320);
  expect(eventCursors).toEqual([80, 180, 280]);
});
it.each([
  { dependency: "down", expected: "degraded" },
  { old: true, expected: "stale" },
])(
  "distinguishes failed dependencies from old evidence: %j",
  async (options) => {
    const { actor } = await connected(options);
    expect((await portalData(actor)).status).toBe(options.expected);
  },
);
it("does not turn an unknown dependency into a confirmed outage", async () => {
  const { actor } = await connected({ dependency: "unknown" });
  expect((await portalData(actor)).status).toBe("unknown");
});
it("distinguishes authenticated empty evidence from an unconfigured deployment", async () => {
  const { actor } = await connected({ empty: true });
  const data = await portalData(actor);
  expect(data.status).toBe("empty");
  expect(data.diagnostics?.active_operations).toBe(0);
  disconnectWorkspace(actor);
  expect((await portalData(actor)).diagnostics).toBeNull();
});
it.each([
  ["UPSTREAM_UNAUTHORIZED", "unauthorized"],
  ["UPSTREAM_FORBIDDEN", "unauthorized"],
  ["UPSTREAM_TENANT_MISMATCH", "unauthorized"],
])(
  "suspends %s, clears cached data and does not issue another read",
  async (code, state) => {
    const { actor, c } = await connected();
    await portalData(actor);
    vi.mocked(secureJson).mockRejectedValue(new SecurityError(code, 502));
    const denied = await portalData(actor);
    expect(denied.status).toBe(state);
    expect(denied.operations).toEqual([]);
    expect(
      db().prepare("SELECT * FROM snapshots WHERE connection_id=?").get(c.id),
    ).toBeUndefined();
    vi.mocked(secureJson).mockClear();
    await portalData(actor);
    expect(secureJson).not.toHaveBeenCalled();
  },
);
it.each(["UPSTREAM_DNS_DENIED", "UPSTREAM_TLS_ERROR", "UPSTREAM_TIMEOUT"])(
  "reports %s with genuine stale snapshots only",
  async (code) => {
    const { actor } = await connected();
    await portalData(actor);
    vi.mocked(secureJson).mockRejectedValue(new SecurityError(code, 502));
    const stale = await portalData(actor);
    expect(stale.status).toBe("degraded");
    expect(stale.freshness).toBe("stale");
    expect(stale.operations[0].operation_id).toBe(op.operation_id);
  },
);

it("a direct operation read revocation suspends all subsequent reads and removes snapshots", async () => {
  const { actor, c } = await connected();
  await portalData(actor);
  vi.mocked(secureJson).mockRejectedValue(
    new SecurityError("UPSTREAM_UNAUTHORIZED", 502),
  );
  await expect(
    authorizedRead(actor, (source) => source.operation("production-operation")),
  ).rejects.toMatchObject({ code: "UPSTREAM_UNAUTHORIZED" });
  expect(
    db().prepare("SELECT * FROM snapshots WHERE connection_id=?").get(c.id),
  ).toBeUndefined();
  expect((await portalData(actor)).status).toBe("unauthorized");
});
