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
const identifier = /^[A-Za-z0-9_-]{1,128}$/;
const uuidLike = /^[a-fA-F0-9-]{36}$/;
const integerQuery = /^(?:0|[1-9][0-9]{0,8})$/;
const allowedQueryKeys: Record<string, string[]> = {
  "/v1/instances": ["limit", "offset", "status", "name", "include_deleted"],
  "/v1/operations": ["limit", "offset", "instance_id", "status"],
  "/v1/events": ["after", "limit", "offset", "sort", "operation_id"],
};
function validQuery(pathname: string, search: URLSearchParams) {
  const allowed = allowedQueryKeys[pathname] ?? [];
  const seen = new Set<string>();
  for (const [key, value] of search.entries()) {
    if (!allowed.includes(key) || seen.has(key)) return false;
    seen.add(key);
    if (key === "limit" && (!integerQuery.test(value) || Number(value) > 500))
      return false;
    if (["offset", "after"].includes(key) && !integerQuery.test(value))
      return false;
    if (key === "instance_id" || key === "operation_id")
      if (!identifier.test(value)) return false;
    if (key === "status" && !/^[A-Za-z0-9_-]{1,32}$/.test(value)) return false;
    if (key === "name" && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(value))
      return false;
    if (key === "include_deleted" && !/^(?:true|false)$/.test(value))
      return false;
    if (key === "sort" && !/^(?:asc|desc)$/.test(value)) return false;
  }
  return true;
}
function allowedReadPath(path: string) {
  let url: URL;
  try {
    url = new URL(path, "https://iacp.invalid");
  } catch {
    return false;
  }
  if (
    url.origin !== "https://iacp.invalid" ||
    !validQuery(url.pathname, url.searchParams)
  )
    return false;
  if (
    [
      "/health/ready",
      "/openapi.json",
      "/v1/observability",
      "/v1/workers",
      "/v1/plans",
      "/v1/images",
      "/v1/profiles",
      "/v1/lab/usage",
    ].includes(url.pathname)
  )
    return url.search === "";
  if (
    url.pathname === "/v1/instances" ||
    url.pathname === "/v1/operations" ||
    url.pathname === "/v1/events"
  )
    return true;
  if (/^\/v1\/operations\/[A-Za-z0-9_-]{1,128}$/.test(url.pathname))
    return url.search === "";
  if (
    /^\/v1\/instances\/[A-Za-z0-9_-]{1,128}(?:\/power|\/network)?$/.test(
      url.pathname,
    )
  )
    return url.search === "";
  if (/^\/v1\/(?:jobs|lab\/policies)\/[A-Za-z0-9_-]{1,128}$/.test(url.pathname))
    return url.search === "";
  return false;
}
function allowedCommandPath(method: "POST" | "DELETE", path: string) {
  let url: URL;
  try {
    url = new URL(path, "https://iacp.invalid");
  } catch {
    return false;
  }
  if (url.origin !== "https://iacp.invalid") return false;
  const instancePath =
    /^\/v1\/instances(?:\/([A-Za-z0-9_-]{1,128})(.*))?$/.exec(url.pathname);
  if (!instancePath) return false;
  if (method === "DELETE")
    return (
      Boolean(instancePath[1]) && url.search === "" && instancePath[2] === ""
    );
  if (!instancePath[1] && (instancePath[2] ?? "") === "")
    return url.search === "";
  const suffix = instancePath[2] ?? "";
  if (
    [
      "/power/start",
      "/power/shutdown",
      "/power/reboot",
      "/network/discover",
      "/network/initialize",
      "/access/verify",
      "/provision",
      "/retry-provision",
    ].includes(suffix)
  )
    return url.search === "";
  if (suffix === "/reconcile") {
    const keys = [...url.searchParams.keys()];
    return (
      keys.length <= 1 &&
      (keys.length === 0 || keys[0] === "source_operation_id") &&
      (!url.searchParams.has("source_operation_id") ||
        identifier.test(url.searchParams.get("source_operation_id") ?? ""))
    );
  }
  return false;
}
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
  command?: {
    method: "POST" | "DELETE";
    body?: unknown;
    key: string;
    acceptedStatus?: number | number[];
  },
): Promise<unknown> {
  if (
    (command
      ? !allowedCommandPath(command.method, path) ||
        !/^[A-Za-z0-9._:-]{1,128}$/.test(command.key)
      : !allowedReadPath(path)) ||
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
        const accepted = command
          ? Array.isArray(command.acceptedStatus)
            ? command.acceptedStatus
            : [command.acceptedStatus ?? 202]
          : [200];
        if (!accepted.includes(res.statusCode ?? 0)) {
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
