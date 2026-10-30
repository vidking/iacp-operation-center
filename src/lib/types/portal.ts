import type {
  Operation,
  AuditEvent,
  Diagnostics,
  EvidenceEnvelope,
} from "./observation";
import type { ConnectionState } from "./connection-state";
export interface PortalData {
  status: ConnectionState;
  connectionActive?: boolean;
  operations: Operation[];
  events: AuditEvent[];
  diagnostics: Diagnostics | null;
  freshness: string;
  partial: boolean;
  blocked: boolean;
  errorCode?: string;
  evidence?: EvidenceEnvelope;
  eventCursor?: number;
}
