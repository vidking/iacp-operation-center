import type { Handle } from "@sveltejs/kit/hooks";
import { redirect, isRedirect } from "@sveltejs/kit";
import { config, SecurityError } from "#lib/server/security/config.ts";
import {
  session,
  sessionCookie,
  loginCookie,
  requireRole,
} from "#lib/server/security/auth.ts";
import {
  checkOrigin,
  checkCsrf,
  mutationBody,
  safeError,
} from "#lib/server/security/http.ts";
export const handle: Handle = async ({ event, resolve }) => {
  const started = performance.now();
  const pathname = event.url.pathname;
  let response: Response;
  let https = false;
  try {
    const settings = config();
    https = settings.https;
    if (
      pathname !== "/health" &&
      settings.https &&
      event.url.origin !== settings.origin
    )
      throw new SecurityError("CANONICAL_ORIGIN_REQUIRED", 403);
    const publicRoute =
      pathname === "/login" ||
      pathname === "/health" ||
      pathname.startsWith("/_app/");
    const current = session(event.cookies.get(sessionCookie));
    if (current) {
      event.locals.user = current.user;
      event.locals.csrf = current.csrf;
    }
    if (!publicRoute && !current) {
      if (pathname.startsWith("/api/"))
        throw new SecurityError("AUTHENTICATION_REQUIRED", 401);
      redirect(303, "/login");
    }
    if (
      pathname.startsWith("/api/admin/") ||
      pathname.startsWith("/administration/")
    )
      requireRole(event.locals.user, ["Administrator"]);
    if (!["GET", "HEAD", "OPTIONS"].includes(event.request.method)) {
      checkOrigin(event.request);
      const body = await mutationBody(event.request.clone());
      checkCsrf(
        event.request,
        body,
        pathname === "/login"
          ? event.cookies.get(loginCookie)
          : event.locals.csrf,
      );
      event.locals.body = body;
    }
    response = await resolve(event);
  } catch (e) {
    // SvelteKit redirects are intentionally allowed; no upstream/auth exception text is exposed.
    if (isRedirect(e))
      response = new Response(null, {
        status: e.status,
        headers: { Location: e.location },
      });
    else response = safeError(e);
  }
  if (https)
    response.headers.set("Strict-Transport-Security", "max-age=31536000");
  response.headers.set(
    "Server-Timing",
    `iacoc;dur=${(performance.now() - started).toFixed(1)}`,
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Frame-Options", "DENY");
  if (!response.headers.has("Content-Security-Policy"))
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
  return response;
};
