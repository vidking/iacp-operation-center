import type { Operation, AuditEvent, Diagnostics } from "./observation";
export interface PortalData {
  mode: string;
  operations: Operation[];
  events: AuditEvent[];
  diagnostics: Diagnostics | null;
  freshness: string;
  partial: boolean;
  blocked: boolean;
}
export type ViewState = "ready" | "loading" | "error" | "empty";
export type Severity = "high" | "medium" | "low";
export interface DemoWorker {
  id: string;
  name: string;
  service: string;
  status: "running" | "idle" | "offline";
  task: string;
  duration: number;
  utilization: number;
  history: number[];
}
export interface DemoIncident {
  id: string;
  title: string;
  operationId: string;
  severity: Severity;
  state: "open" | "resolved";
  time: string;
  description: string;
  recommendation: string;
}
