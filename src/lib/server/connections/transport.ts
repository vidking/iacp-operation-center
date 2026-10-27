import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import ipaddr from "ipaddr.js";
import { z } from "zod";
import { config, SecurityError } from "../security/config.ts";
const targetSchema = z
  .array(
    z
      .object({
        origin: z.string(),
        addresses: z.array(z.string()).min(1).max(16),
      })
      .strict(),
  )
  .max(32);
export function canonicalOrigin(input: string) {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new SecurityError("ENDPOINT_NOT_ALLOWED");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/" ||
    u.hostname.endsWith(".") ||
    !u.hostname ||
    ![u.origin, u.origin + "/"].includes(input)
  )
    throw new SecurityError("ENDPOINT_NOT_ALLOWED");
  return u.origin;
}
function safeAddress(address: string) {
  try {
    const parsed = ipaddr.process(address);
    return ["unicast", "private", "uniqueLocal"].includes(parsed.range());
  } catch {
    return false;
  }
}
function normalize(address: string) {
  try {
    return ipaddr.process(address).toNormalizedString();
  } catch {
    throw new SecurityError("ENDPOINT_NOT_ALLOWED");
  }
}
export function allowedTarget(endpoint: string) {
  const origin = canonicalOrigin(endpoint);
  let targets: z.infer<typeof targetSchema>;
  try {
    targets = targetSchema.parse(JSON.parse(config().allowedTargets));
  } catch {
    throw new SecurityError("DESTINATION_POLICY_INVALID", 503);
  }
  const match = targets.find((t) => canonicalOrigin(t.origin) === origin);
  if (!match || match.addresses.some((ip) => !isIP(ip) || !safeAddress(ip)))
    throw new SecurityError("ENDPOINT_NOT_ALLOWED");
  return { origin, addresses: match.addresses.map(normalize) };
}
export async function pinnedAddress(endpoint: string, resolver = lookup) {
  const target = allowedTarget(endpoint),
    host = new URL(target.origin).hostname.replace(/^\[|\]$/g, "");
  let addresses: { address: string; family: number }[];
  if (isIP(host)) addresses = [{ address: host, family: isIP(host) }];
  else {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      addresses = await Promise.race([
        resolver(host, { all: true, verbatim: true }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new SecurityError("UPSTREAM_TIMEOUT", 502)),
            4500,
          );
        }),
      ]);
    } catch {
      throw new SecurityError("UPSTREAM_DNS_DENIED", 502);
    } finally {
      clearTimeout(timer);
    }
  }
  if (
    !addresses.length ||
    addresses.some(
      (a) =>
        !safeAddress(a.address) ||
        !target.addresses.includes(normalize(a.address)),
    )
  )
    throw new SecurityError("UPSTREAM_DNS_DENIED", 502);
  return addresses[0];
}
const routes =
  /^\/(?:health\/ready|openapi\.json|v1\/(?:operations(?:\/[a-zA-Z0-9_-]{1,128})?|events|observability))(?:\?(?:limit=50&offset=\d+|after=\d+&limit=100))?$/;
const crmReads =
  /^\/v1\/(?:plans|images|profiles|lab\/(?:usage|policies)|instances(?:\/[a-f0-9-]{36}(?:\/power)?)?|operations)(?:\?(?:limit=100&offset=\d+|instance_id=[a-f0-9-]{36}&limit=50&offset=\d+))?$/;
const operationPages =
  /^\/v1\/operations\?limit=50&offset=\d+(?:&instance_id=[a-f0-9-]{36})?(?:&status=(?:queued|running|completed|failed|uncertain))?$/;
const referenceReads = /^\/v1\/(?:jobs|lab\/policies)\/[a-f0-9-]{36}$/;
const crmCommands =
  /^\/v1\/instances(?:\/[a-f0-9-]{36}(?:\/power\/(?:start|shutdown|reboot)|\/reconcile|\/network\/(?:discover|initialize)|\/access\/verify|\/provision|\/retry-provision))?$/;
function headerValue(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^[A-Za-z0-9._:/-]{1,128}$/.test(candidate)
    ? candidate
    : undefined;
}
function safeDetail(value: unknown) {
  if (typeof value !== "string") return undefined;
  const redacted = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(
      /((?:password|secret|token|authorization|credential)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[redacted]",
    )
    .replace(/\s+/g, " ")
    .trim();
  return redacted ? redacted.slice(0, 240) : undefined;
}
export async function secureJson(
  endpoint: string,
  path: string,
  token: string,
  command?: { method: "POST" | "DELETE"; body: unknown; key: string },
): Promise<unknown> {
  if (
    (command
      ? (command.method === "DELETE"
          ? !/^\/v1\/instances\/[a-f0-9-]{36}$/.test(path)
          : !crmCommands.test(path)) ||
        !/^[A-Za-z0-9._:-]{1,128}$/.test(command.key)
      : !routes.test(path) &&
        !crmReads.test(path) &&
        !operationPages.test(path) &&
        !referenceReads.test(path)) ||
    token.length < 12 ||
    token.length > 4096 ||
    /[\x00-\x20\x7f]/.test(token)
  )
    throw new SecurityError("INVALID_UPSTREAM_REQUEST");
  const signal = AbortSignal.timeout(5000);
  const pinned = await pinnedAddress(endpoint);
  const url = new URL(path, canonicalOrigin(endpoint));
  const requestId = randomUUID();
  const requestStartedAt = Date.now();
  return new Promise((resolve, reject) => {
    const fail = (code: string, extra: Partial<SecurityError> = {}) => {
      const error = new SecurityError(code, 502);
      error.requestId = requestId;
      error.upstreamDurationMs = Date.now() - requestStartedAt;
      Object.assign(error, extra);
      reject(error);
    };
    const req = request(
      url,
      {
        method: command?.method ?? "GET",
        agent: false,
        family: pinned.family,
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
        signal,
        maxHeaderSize: 8192,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "X-Request-ID": requestId,
          ...(command
            ? {
                "Content-Type": "application/json",
                "Idempotency-Key": command.key,
              }
            : {}),
        },
        lookup: (_hostname, _options, callback) =>
          callback(null, pinned.address, pinned.family),
      },
      (res) => {
        if (res.statusCode !== (command ? 202 : 200)) {
          const code =
            res.statusCode && res.statusCode >= 300 && res.statusCode < 400
              ? "UPSTREAM_REDIRECT_DENIED"
              : res.statusCode === 401
                ? "UPSTREAM_UNAUTHORIZED"
                : res.statusCode === 403
                  ? "UPSTREAM_FORBIDDEN"
                  : res.statusCode === 404
                    ? "UPSTREAM_NOT_FOUND"
                    : res.statusCode === 409
                      ? "UPSTREAM_CONFLICT"
                      : res.statusCode === 429
                        ? "UPSTREAM_RATE_LIMITED"
                        : res.statusCode === 422
                          ? "UPSTREAM_VALIDATION_ERROR"
                          : res.statusCode === 503
                            ? path === "/health/ready"
                              ? "UPSTREAM_NOT_READY"
                              : "UPSTREAM_SERVICE_UNAVAILABLE"
                            : "UPSTREAM_HTTP_ERROR";
          if ((res.statusCode ?? 0) >= 300 && (res.statusCode ?? 0) < 400) {
            res.destroy();
            fail(code, {
              upstreamStatus: res.statusCode,
              upstreamRequestId: headerValue(
                res.headers["x-request-id"] ??
                  res.headers["x-correlation-id"] ??
                  res.headers["request-id"],
              ),
              upstreamServer: headerValue(
                res.headers.server ?? res.headers.via,
              ),
            });
            return;
          }
          let errorSize = 0;
          const errorChunks: Buffer[] = [];
          const rejectSafe = () => {
            const error = new SecurityError(code, 502);
            error.requestId = requestId;
            error.upstreamStatus = res.statusCode;
            error.upstreamRequestId = headerValue(
              res.headers["x-request-id"] ??
                res.headers["x-correlation-id"] ??
                res.headers["request-id"],
            );
            error.upstreamServer = headerValue(
              res.headers.server ?? res.headers.via,
            );
            error.upstreamDurationMs = Date.now() - requestStartedAt;
            try {
              const body: unknown = JSON.parse(
                Buffer.concat(errorChunks).toString("utf8"),
              );
              const record =
                body && typeof body === "object"
                  ? (body as Record<string, unknown>)
                  : undefined;
              const value =
                record?.error_code ?? record?.code ?? record?.detail;
              if (
                typeof value === "string" &&
                /^(?:COMMERCIAL|LAB|PROVISIONING|POWER|LIFECYCLE|INSTANCE|TENANT|PROFILE|NETWORK|ACCESS|ROOT|IMAGE|PLAN|ADMISSION|OWNERSHIP|CAPACITY|DELETE|DELETION|RECONCILIATION|WAN|GUEST)_[A-Z0-9_]{1,90}(?::(?:instances|vcpus|memory_mb|disk_gb|concurrent_operations))?$/.test(
                  value,
                )
              )
                error.upstreamCode = value;
              error.upstreamDetail = safeDetail(
                record?.detail ?? record?.message,
              );
            } catch {}
            reject(error);
          };
          res.on("data", (chunk: Buffer) => {
            errorSize += chunk.length;
            if (errorSize > 8192) {
              res.destroy();
              fail(code, {
                upstreamStatus: res.statusCode,
                upstreamRequestId: headerValue(
                  res.headers["x-request-id"] ??
                    res.headers["x-correlation-id"] ??
                    res.headers["request-id"],
                ),
                upstreamServer: headerValue(
                  res.headers.server ?? res.headers.via,
                ),
              });
            } else errorChunks.push(chunk);
          });
          res.on("end", rejectSafe);
          res.on("error", () =>
            fail(code, {
              upstreamStatus: res.statusCode,
              upstreamRequestId: headerValue(
                res.headers["x-request-id"] ??
                  res.headers["x-correlation-id"] ??
                  res.headers["request-id"],
              ),
              upstreamServer: headerValue(
                res.headers.server ?? res.headers.via,
              ),
            }),
          );
          return;
        }
        if (!res.headers["content-type"]?.includes("application/json")) {
          res.destroy();
          fail("UPSTREAM_INVALID_RESPONSE", {
            upstreamStatus: res.statusCode,
            upstreamRequestId: headerValue(
              res.headers["x-request-id"] ??
                res.headers["x-correlation-id"] ??
                res.headers["request-id"],
            ),
            upstreamServer: headerValue(res.headers.server ?? res.headers.via),
          });
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1_048_576) {
            res.destroy();
            fail("UPSTREAM_RESPONSE_TOO_LARGE", {
              upstreamStatus: res.statusCode,
            });
          } else chunks.push(chunk);
        });
        res.on("error", () =>
          fail("UPSTREAM_READ_ERROR", { upstreamStatus: res.statusCode }),
        );
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            fail("UPSTREAM_INVALID_RESPONSE", {
              upstreamStatus: res.statusCode,
            });
          }
        });
      },
    );
    req.on("error", (error: NodeJS.ErrnoException) => {
      const tlsCodes = [
        "CERT_HAS_EXPIRED",
        "CERT_NOT_YET_VALID",
        "DEPTH_ZERO_SELF_SIGNED_CERT",
        "SELF_SIGNED_CERT_IN_CHAIN",
        "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
        "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
        "ERR_TLS_CERT_ALTNAME_INVALID",
      ];
      fail(
        signal.aborted
          ? "UPSTREAM_TIMEOUT"
          : tlsCodes.includes(error.code ?? "")
            ? "UPSTREAM_TLS_ERROR"
            : "UPSTREAM_UNAVAILABLE",
      );
    });
    req.end(command ? JSON.stringify(command.body) : undefined);
  });
}
