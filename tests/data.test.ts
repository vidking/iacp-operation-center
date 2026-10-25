import { describe, it, expect, vi } from "vitest";
import { mockSource } from "../src/lib/server/data/mock";
import {
  freshness,
  uniqueEvents,
  operationSchema,
  diagnosticsSchema,
  eventPageSchema,
} from "../src/lib/server/data/contracts";
import { createIacpSource } from "../src/lib/server/data/iacp";
const config = {
  baseUrl: "https://iacp.invalid",
  token: "test-secret",
  tenantId: "demo",
};
const observer = {
  subject: "test-reader",
  role: "reader" as const,
  tenantId: "demo",
};
describe("observation boundaries", () => {
  it("MOCK works without network and validates against projections", async () => {
    const http = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Offline"));
    try {
      const ops = await mockSource.operations();
      ops.forEach((op) => operationSchema.parse(op));
      diagnosticsSchema.parse(await mockSource.observability());
      eventPageSchema.parse(await mockSource.events());
      expect(
        ops.find((o) => o.status !== o.normalized_status)?.normalized_status,
      ).toBe("uncertain");
      expect(http).not.toHaveBeenCalled();
    } finally {
      http.mockRestore();
    }
  });
  it("marks unknown and old observations explicitly", () => {
    expect(freshness(null)).toBe("unknown");
    expect(freshness("bad")).toBe("unknown");
    expect(
      freshness("2026-01-01T00:00:00Z", Date.parse("2026-01-01T00:03:00Z")),
    ).toBe("stale");
    expect(
      freshness("2026-01-01T00:00:00Z", Date.parse("2026-01-01T00:01:00Z")),
    ).toBe("fresh");
  });
  it("blocks unauthenticated and wrong-tenant readers before HTTP", () => {
    const http = vi.fn();
    expect(() => createIacpSource(config, undefined, http)).toThrow();
    expect(() =>
      createIacpSource(config, { ...observer, tenantId: "other" }, http),
    ).toThrow();
    expect(http).not.toHaveBeenCalled();
  });
  it("uses fixed GET routes, bearer server identity and forbids redirects", async () => {
    const http = vi
      .fn()
      .mockResolvedValue(Response.json(await mockSource.events()));
    const source = createIacpSource(config, observer, http);
    await source.events(0);
    expect(String(http.mock.calls[0][0])).toBe(
      "https://iacp.invalid/v1/events?after=0&limit=100",
    );
    expect(http.mock.calls[0][1]).toMatchObject({
      method: "GET",
      redirect: "error",
      headers: { Authorization: "Bearer test-secret" },
    });
    await expect(async () => source.events(-1)).rejects.toThrow();
  });
  it("does not retry failed requests", async () => {
    const http = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    await expect(
      createIacpSource(config, observer, http).operations(),
    ).rejects.toThrow();
    expect(http).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed responses and cross-tenant evidence", async () => {
    let http = vi.fn().mockResolvedValue(Response.json({ bad: true }));
    await expect(
      createIacpSource(config, observer, http).observability(),
    ).rejects.toThrow();
    http = vi.fn().mockResolvedValue(
      Response.json({
        ...(await mockSource.observability()),
        tenant_id: "other",
      }),
    );
    await expect(
      createIacpSource(config, observer, http).observability(),
    ).rejects.toThrow("Tenant mismatch");
  });
  it("projects only selected fields and discards unexpected secrets", async () => {
    const op = (await mockSource.operations())[0];
    expect(
      operationSchema.parse({ ...op, private_secret: "hidden" }),
    ).not.toHaveProperty("private_secret");
  });
  it("requires HTTPS configured origin", () => {
    expect(() =>
      createIacpSource({ ...config, baseUrl: "http://localhost" }, observer),
    ).toThrow();
    expect(() =>
      createIacpSource(
        { ...config, baseUrl: "https://iacp.invalid/path" },
        observer,
      ),
    ).toThrow();
  });
});

it("deduplicates a replay window by event_id", async () => {
  const { events } = await mockSource.events();
  expect(uniqueEvents([...events, ...events])).toEqual(events);
});
