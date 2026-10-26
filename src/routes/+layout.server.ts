import {
  portalData,
  workspaceStatus,
} from "#lib/server/connections/service.ts";
export const load = async ({ locals, url }) => {
  const auth = { user: locals.user ?? null, csrf: locals.csrf ?? "" };
  if (url.pathname === "/login" || url.pathname.startsWith("/administration/"))
    return {
      ...auth,
      status: locals.user ? workspaceStatus(locals.user) : "disconnected",
      operations: [],
      events: [],
      diagnostics: null,
      freshness: "unknown",
      partial: false,
      blocked: false,
    };
  // CRM has its own read model. Do not make the commercial catalog wait for
  // observability, events, or the global operations window.
  if (url.pathname === "/crm")
    return {
      ...auth,
      status: locals.user ? workspaceStatus(locals.user) : "disconnected",
      operations: [],
      events: [],
      diagnostics: null,
      freshness: "unknown",
      partial: false,
      blocked: false,
    };
  return { ...(await portalData(locals.user)), ...auth };
};
