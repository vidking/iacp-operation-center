import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
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
  /^\/(?:health\/ready|v1\/(?:operations(?:\/[a-zA-Z0-9_-]{1,128})?|events|observability))(?:\?(?:limit=50&offset=0|after=\d+&limit=100))?$/;
export async function secureJson(
  endpoint: string,
  path: string,
  token: string,
): Promise<unknown> {
  if (
    !routes.test(path) ||
    token.length < 12 ||
    token.length > 4096 ||
    /[\x00-\x20\x7f]/.test(token)
  )
    throw new SecurityError("INVALID_UPSTREAM_REQUEST");
  const signal = AbortSignal.timeout(5000);
  const pinned = await pinnedAddress(endpoint);
  const url = new URL(path, canonicalOrigin(endpoint));
  return new Promise((resolve, reject) => {
    const fail = (code: string) => reject(new SecurityError(code, 502));
    const req = request(
      url,
      {
        method: "GET",
        agent: false,
        family: pinned.family,
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
        signal,
        maxHeaderSize: 8192,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        lookup: (_hostname, _options, callback) =>
          callback(null, pinned.address, pinned.family),
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.destroy();
          fail(
            res.statusCode && res.statusCode >= 300 && res.statusCode < 400
              ? "UPSTREAM_REDIRECT_DENIED"
              : res.statusCode === 401
                ? "UPSTREAM_UNAUTHORIZED"
                : res.statusCode === 403
                  ? "UPSTREAM_FORBIDDEN"
                  : res.statusCode === 503
                    ? path === "/health/ready"
                      ? "UPSTREAM_NOT_READY"
                      : "UPSTREAM_SERVICE_UNAVAILABLE"
                    : "UPSTREAM_HTTP_ERROR",
          );
          return;
        }
        if (!res.headers["content-type"]?.includes("application/json")) {
          res.destroy();
          fail("UPSTREAM_INVALID_RESPONSE");
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1_048_576) {
            res.destroy();
            fail("UPSTREAM_RESPONSE_TOO_LARGE");
          } else chunks.push(chunk);
        });
        res.on("error", () => fail("UPSTREAM_READ_ERROR"));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            fail("UPSTREAM_INVALID_RESPONSE");
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
    req.end();
  });
}
