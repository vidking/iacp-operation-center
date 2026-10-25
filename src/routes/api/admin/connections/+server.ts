import {
  createConnection,
  listConnections,
} from "#lib/server/connections/service.ts";
import { safeError } from "#lib/server/security/http.ts";
export const GET = ({ locals }) => {
  try {
    return Response.json({ connections: listConnections(locals.user) });
  } catch (e) {
    return safeError(e);
  }
};
export const POST = ({ locals }) => {
  try {
    return Response.json(
      { connection: createConnection(locals.user, locals.body) },
      { status: 201 },
    );
  } catch (e) {
    return safeError(e);
  }
};
