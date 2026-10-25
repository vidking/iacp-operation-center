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
beforeEach(() => {
  status = 200;
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
          req.emit("error", new Error("DO_NOT_LEAK_TOKEN"));
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
        if (status === 200) {
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
