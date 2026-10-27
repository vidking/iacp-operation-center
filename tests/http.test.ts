import { expect, it } from "vitest";
import { SecurityError } from "../src/lib/server/security/config";
import { safeError } from "../src/lib/server/security/http";

it("returns only sanitized upstream diagnostics for preflight failures", async () => {
  const error = new SecurityError("UPSTREAM_HTTP_ERROR", 502);
  error.upstreamStatus = 503;
  error.requestId = "request-123";
  error.upstreamRequestId = "upstream-456";
  error.upstreamServer = "traefik";
  error.upstreamDetail = "Admission unavailable; Bearer [redacted]";
  error.upstreamDurationMs = 137;

  const response = safeError(error);
  expect(response.status).toBe(502);
  await expect(response.json()).resolves.toEqual({
    error: "UPSTREAM_HTTP_ERROR",
    diagnostic: {
      status: 503,
      requestId: "request-123",
      upstreamRequestId: "upstream-456",
      server: "traefik",
      detail: "Admission unavailable; Bearer [redacted]",
      durationMs: 137,
    },
  });
});
