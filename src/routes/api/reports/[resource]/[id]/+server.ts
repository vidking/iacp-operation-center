import { authorizedRead } from "#lib/server/connections/service.ts";
import { detail } from "#lib/server/crm/service.ts";
import { requireRole, throttle } from "#lib/server/security/auth.ts";
import { audit } from "#lib/server/security/database.ts";
import { SecurityError } from "#lib/server/security/config.ts";
import { safeError } from "#lib/server/security/http.ts";
import { operationalReport } from "#lib/report.ts";
export const GET = async ({ locals, params }) => {
  try {
    const actor = requireRole(locals.user);
    throttle("report:" + actor.id, 10, 60000);
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(params.id))
      throw new SecurityError("INVALID_IDENTIFIER");
    const report = await authorizedRead(actor, async (source) => {
      const page = await source.events();
      if (params.resource === "instances") {
        const d = await detail(actor, params.id);
        return operationalReport({
          instance: d.instance,
          operations: d.operations,
          events: page.events.filter((e) => e.instance_id === params.id),
          observedAt: new Date().toISOString(),
        });
      }
      if (params.resource === "operations") {
        const operation = await source.operation(params.id);
        return operationalReport({
          operations: [operation],
          events: page.events.filter((e) => e.operation_id === params.id),
          observedAt: new Date().toISOString(),
        });
      }
      throw new SecurityError("NOT_FOUND", 404);
    });
    audit(actor.id, "report.exported", params.id, actor.tenantId, {
      resource: params.resource,
    });
    return new Response(JSON.stringify(report, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="iacoc-${params.resource}-${params.id}.json"`,
      },
    });
  } catch (e) {
    return safeError(e);
  }
};
