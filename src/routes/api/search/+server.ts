import { operationPage } from "#lib/server/incidents/operations.ts";
import { authorizedRead } from "#lib/server/connections/service.ts";
import { requireRole, throttle } from "#lib/server/security/auth.ts";
import { safeError } from "#lib/server/security/http.ts";

export const GET = async ({ locals, url }) => {
  try {
    const actor = requireRole(locals.user);
    const query = (url.searchParams.get("q") ?? "").trim().slice(0, 128);
    if (!query) return Response.json({ operations: [], events: [], links: [] });
    throttle("global-search:" + actor.tenantId, 60, 60000);
    const [operations, events] = await Promise.all([
      operationPage(actor, {
        query,
        pageSize: 8,
        recent: true,
        sortBy: "updated_at",
        direction: "desc",
      }),
      authorizedRead(actor, async (source) => {
        const page = await source.events(0);
        return page.events.filter((event) =>
          `${event.event_id} ${event.operation_id} ${event.instance_id} ${event.correlation_id} ${event.kind} ${event.code}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        );
      }),
    ]);
    const sections = [
      { href: "/", label: "Overview", terms: "overview resumen estado" },
      {
        href: "/operations",
        label: "Operations",
        terms: "operations operaciones",
      },
      { href: "/events", label: "Events", terms: "events eventos" },
      { href: "/crm", label: "CRM", terms: "crm inventario kvm" },
      {
        href: "/incidents",
        label: "Incidents",
        terms: "incidents recuperación",
      },
      ...(actor.role === "Administrator"
        ? [
            {
              href: "/administration/connections",
              label: "Conectores",
              terms: "conectores iacp conexión",
            },
            {
              href: "/administration/users",
              label: "Usuarios y permisos",
              terms: "usuarios roles permisos",
            },
            {
              href: "/administration/settings",
              label: "Configuración",
              terms: "configuración preferencias",
            },
          ]
        : []),
    ].filter((item) =>
      `${item.label} ${item.terms}`.toLowerCase().includes(query.toLowerCase()),
    );
    return Response.json({
      operations: operations.operations.map((operation) => ({
        id: operation.operation_id,
        label: operation.kind,
        detail: operation.instance_id,
        href: `/operations?operation=${encodeURIComponent(operation.operation_id)}`,
      })),
      events: events
        .slice(-8)
        .reverse()
        .map((event) => ({
          id: String(event.event_id),
          label: event.code,
          detail: event.correlation_id,
          href: `/events?operation=${encodeURIComponent(event.operation_id)}`,
        })),
      links: sections.map(({ href, label }) => ({ href, label })),
    });
  } catch (error) {
    return safeError(error);
  }
};
