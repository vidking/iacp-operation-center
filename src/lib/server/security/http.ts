import { SecurityError, config } from "./config.ts";
import { equal, loginCookie } from "./auth.ts";
import { ZodError } from "zod";
export async function boundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) {
      void reader.cancel();
      throw new SecurityError("BODY_TOO_LARGE", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function mutationBody(request: Request) {
  const raw = await boundedBody(request),
    type = request.headers.get("content-type") ?? "";
  try {
    if (type.startsWith("application/json")) {
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error();
      return value as Record<string, unknown>;
    }
    if (type.startsWith("application/x-www-form-urlencoded"))
      return Object.fromEntries(new URLSearchParams(raw));
  } catch {
    throw new SecurityError("INVALID_REQUEST");
  }
  throw new SecurityError("UNSUPPORTED_CONTENT_TYPE", 415);
}
export function checkOrigin(request: Request) {
  if (request.headers.get("origin") !== config().origin)
    throw new SecurityError("CSRF_ORIGIN_DENIED", 403);
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")
    throw new SecurityError("CSRF_ORIGIN_DENIED", 403);
}
export function checkCsrf(
  request: Request,
  body: Record<string, unknown>,
  expected: string | undefined,
) {
  const token = request.headers.get("x-csrf-token") ?? body._csrf;
  if (!expected || typeof token !== "string" || !equal(token, expected))
    throw new SecurityError("CSRF_TOKEN_DENIED", 403);
}
export function safeError(error: unknown) {
  const status =
    error instanceof SecurityError
      ? error.status
      : error instanceof ZodError
        ? 400
        : 500;
  const code =
    error instanceof SecurityError
      ? error.code
      : error instanceof ZodError
        ? "INVALID_REQUEST"
        : "INTERNAL_ERROR";
  return Response.json(
    { error: code },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 429 ? { "Retry-After": "900" } : {}),
      },
    },
  );
}
