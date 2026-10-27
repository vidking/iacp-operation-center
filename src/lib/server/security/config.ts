import { readFileSync } from "node:fs";
export class SecurityError extends Error {
  code: string;
  status: number;
  upstreamCode?: string;
  requestId?: string;
  upstreamStatus?: number;
  upstreamRequestId?: string;
  upstreamDetail?: string;
  upstreamServer?: string;
  upstreamDurationMs?: number;
  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export interface UpstreamDiagnostic {
  status: number | null;
  requestId: string | null;
  upstreamRequestId: string | null;
  server: string | null;
  detail: string | null;
  durationMs: number | null;
}

export function upstreamDiagnostic(
  error: unknown,
): UpstreamDiagnostic | undefined {
  if (!(error instanceof SecurityError)) return undefined;
  if (
    !error.requestId &&
    error.upstreamStatus === undefined &&
    !error.upstreamRequestId &&
    !error.upstreamDetail &&
    !error.upstreamServer &&
    error.upstreamDurationMs === undefined
  )
    return undefined;
  return {
    status: error.upstreamStatus ?? null,
    requestId: error.requestId ?? null,
    upstreamRequestId: error.upstreamRequestId ?? null,
    server: error.upstreamServer ?? null,
    detail: error.upstreamDetail ?? null,
    durationMs: error.upstreamDurationMs ?? null,
  };
}
export function config() {
  const origin = process.env.PUBLIC_ORIGIN ?? "https://iacoc.cyberfuel.com";
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new SecurityError("INVALID_PUBLIC_ORIGIN", 503);
  }
  if (
    url.origin !== origin ||
    (url.protocol !== "https:" &&
      !(
        process.env.LOCAL_HTTP === "true" &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw new SecurityError("HTTPS_REQUIRED", 503);
  return {
    origin,
    https: url.protocol === "https:",
    dbPath: process.env.IACOC_DB_PATH ?? "/var/lib/iacoc/iacoc.sqlite",
    keyFile:
      process.env.IACOC_KEYRING_FILE ?? "/run/secrets/iacoc-keyring.json",
    liveEnabled: process.env.LIVE_ENABLED === "true",
    allowedTargets: process.env.IACP_ALLOWED_TARGETS ?? "[]",
  };
}
export function readKeyring() {
  try {
    const parsed = JSON.parse(readFileSync(config().keyFile, "utf8")) as {
      active: string;
      keys: Record<string, string>;
    };
    if (
      !/^[a-zA-Z0-9_-]{1,64}$/.test(parsed.active) ||
      !parsed.keys[parsed.active]
    )
      throw new Error();
    for (const [id, key] of Object.entries(parsed.keys))
      if (
        !/^[a-zA-Z0-9_-]{1,64}$/.test(id) ||
        Buffer.from(key, "base64").length !== 32 ||
        Buffer.from(key, "base64").toString("base64") !== key
      )
        throw new Error();
    return parsed;
  } catch {
    throw new SecurityError("KEYRING_UNAVAILABLE", 503);
  }
}
