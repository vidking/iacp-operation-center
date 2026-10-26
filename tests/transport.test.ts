import { it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ request: mocks.request }));
import { secureJson } from "../src/lib/server/connections/transport";
let status = 200,
  body = '{"status":"ready"}',
  type = "application/json",
  responseError = false;
let errorCode: string | undefined;
beforeEach(() => {
  status = 200;
  errorCode = undefined;
  body = '{"status":"ready"}';
  type = "application/json";
  responseError = false;
  mocks.lookup.mockResolvedValue([{ address: "10.40.50.60", family: 4 }]);
  mocks.request.mockReset();
  mocks.request.mockImplementation((_url, options, callback) => {
    expect(options.rejectUnauthorized).toBe(true);
    expect(options.family).toBe(4);
    expect(options.minVersion).toBe("TLSv1.2");
    const pinned = vi.fn();
    options.lookup("ignored-rebinding.invalid", {}, pinned);
    expect(pinned).toHaveBeenCalledWith(null, "10.40.50.60", 4);
    const req = new EventEmitter() as EventEmitter & { end: () => void };
    req.end = () =>
      queueMicrotask(() => {
        if (responseError) {
          req.emit(
            "error",
            Object.assign(new Error("DO_NOT_LEAK_TOKEN"), { code: errorCode }),
          );
          return;
        }
        const res = new EventEmitter() as EventEmitter & {
          statusCode: number;
          headers: Record<string, string>;
          destroy: () => void;
        };
        res.statusCode = status;
        res.headers = {
          "content-type": type,
          location: "http://169.254.169.254/",
        };
        res.destroy = () => {};
        callback(res);
        if (status >= 400 || status === 200 || status === 202) {
          res.emit("data", Buffer.from(body));
          res.emit("end");
        }
      });
    return req;
  });
});
it("uses TLS, pinned lookup, fixed GET and a private authorization header", async () => {
  const result = await secureJson(
    "https://iacp-fixture.invalid",
    "/health/ready",
    "fixture-token-not-real",
  );
  expect(result).toEqual({ status: "ready" });
  const [url, options] = mocks.request.mock.calls[0];
  expect(String(url)).toBe("https://iacp-fixture.invalid/health/ready");
  expect(options.method).toBe("GET");
  expect(options.headers.Authorization).toBe("Bearer fixture-token-not-real");
  expect(options.signal).toBeInstanceOf(AbortSignal);
});
it("rejects redirects instead of following metadata URLs", async () => {
  status = 302;
  await expect(
    secureJson(
      "https://iacp-fixture.invalid",
      "/health/ready",
      "fixture-token-not-real",
    ),
  ).rejects.toThrow("UPSTREAM_REDIRECT_DENIED");
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it("rejects oversized, malformed and non-JSON responses", async () => {
  body = "x".repeat(1_048_577);
  await expect(
    secureJson(
      "https://iacp-fixture.invalid",
      "/health/ready",
      "fixture-token-not-real",
    ),
  ).rejects.toThrow("UPSTREAM_RESPONSE_TOO_LARGE");
  body = "invalid-json";
  await expect(
    secureJson(
      "https://iacp-fixture.invalid",
      "/health/ready",
      "fixture-token-not-real",
    ),
  ).rejects.toThrow("UPSTREAM_INVALID_RESPONSE");
  type = "text/html";
  await expect(
    secureJson(
      "https://iacp-fixture.invalid",
      "/health/ready",
      "fixture-token-not-real",
    ),
  ).rejects.toThrow("UPSTREAM_INVALID_RESPONSE");
});
it("never returns native transport error text", async () => {
  responseError = true;
  await expect(
    secureJson(
      "https://iacp-fixture.invalid",
      "/health/ready",
      "fixture-token-not-real",
    ),
  ).rejects.toThrow("UPSTREAM_UNAVAILABLE");
});
it("rejects arbitrary paths, injection and unsafe DNS before connecting", async () => {
  await expect(
    secureJson(
      "https://iacp-fixture.invalid",
      "/admin/plans",
      "fixture-token-not-real",
    ),
  ).rejects.toThrow("INVALID_UPSTREAM_REQUEST");
  await expect(
    secureJson(
      "https://iacp-fixture.invalid",
      "/health/ready",
      "bad\r\nheader",
    ),
  ).rejects.toThrow();
  mocks.lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
  await expect(
    secureJson(
      "https://iacp-fixture.invalid",
      "/health/ready",
      "fixture-token-not-real",
    ),
  ).rejects.toThrow("UPSTREAM_DNS_DENIED");
  expect(mocks.request).not.toHaveBeenCalled();
});

it.each([
  [401, "/v1/observability", "UPSTREAM_UNAUTHORIZED"],
  [403, "/v1/events?after=0&limit=100", "UPSTREAM_FORBIDDEN"],
  [503, "/health/ready", "UPSTREAM_NOT_READY"],
  [503, "/v1/operations?limit=50&offset=0", "UPSTREAM_SERVICE_UNAVAILABLE"],
])(
  "classifies HTTP %s without returning bodies or token",
  async (http, path, code) => {
    status = http as number;
    body = "DO_NOT_LEAK_TOKEN";
    await expect(
      secureJson(
        "https://iacp-fixture.invalid",
        path as string,
        "fixture-token-not-real",
      ),
    ).rejects.toThrow(code as string);
  },
);
it("distinguishes TLS trust failure without disclosing native error details", async () => {
  responseError = true;
  errorCode = "UNABLE_TO_VERIFY_LEAF_SIGNATURE";
  await expect(
    secureJson(
      "https://iacp-fixture.invalid",
      "/health/ready",
      "fixture-token-not-real",
    ),
  ).rejects.toThrow("UPSTREAM_TLS_ERROR");
});
it("sends only allowlisted real lifecycle commands with idempotency and pinned TLS", async () => {
  status = 202;
  body = '{"status":"queued"}';
  const result = await secureJson(
    "https://iacp-fixture.invalid",
    "/v1/instances/00000000-0000-4000-8000-000000000001/power/start",
    "fixture-token-not-real",
    { method: "POST", key: "stable-intention", body: {} },
  );
  expect(result).toEqual({ status: "queued" });
  const options = mocks.request.mock.calls[0][1];
  expect(options.method).toBe("POST");
  expect(options.headers["Idempotency-Key"]).toBe("stable-intention");
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it("denies arbitrary command paths and mismatched methods before opening a socket", async () => {
  for (const [method, path] of [
    ["POST", "/v1/instances/00000000-0000-4000-8000-000000000001"],
    ["DELETE", "/v1/instances"],
    ["POST", "/api2/json/nodes/mng01/qemu/104/status/stop"],
    ["POST", "/v1/instances/00000000-0000-4000-8000-000000000001/power/stop"],
  ] as const) {
    await expect(
      secureJson(
        "https://iacp-fixture.invalid",
        path,
        "fixture-token-not-real",
        { method, key: "stable", body: {} },
      ),
    ).rejects.toThrow("INVALID_UPSTREAM_REQUEST");
  }
  expect(mocks.request).not.toHaveBeenCalled();
});

it("preserves a sanitized current IACP diagnostic code without exposing free-form bodies", async () => {
  status = 409;
  body = JSON.stringify({
    detail: "COMMERCIAL_PLAN_NOT_AUTHORIZED",
    password: "DO_NOT_LEAK",
  });
  try {
    await secureJson(
      "https://iacp-fixture.invalid",
      "/v1/instances",
      "fixture-token-not-real",
      { method: "POST", key: "new-intention", body: {} },
    );
    throw new Error("Expected rejection");
  } catch (e) {
    expect(e).toMatchObject({
      code: "UPSTREAM_CONFLICT",
      upstreamCode: "COMMERCIAL_PLAN_NOT_AUTHORIZED",
    });
    expect(JSON.stringify(e)).not.toContain("DO_NOT_LEAK");
  }
});
