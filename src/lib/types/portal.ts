import type { Operation, AuditEvent, Diagnostics } from "./observation";
import type { ConnectionState } from "./connection-state";
export interface PortalData {
  status: ConnectionState;
  operations: Operation[];
  events: AuditEvent[];
  diagnostics: Diagnostics | null;
  freshness: string;
  partial: boolean;
  blocked: boolean;
  errorCode?: string;
}
