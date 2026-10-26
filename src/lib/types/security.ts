import type { ConnectionCheck } from "./connection-diagnostics.ts";
export type Role = "Viewer" | "Operator" | "Administrator";
export interface Principal {
  id: string;
  username: string;
  role: Role;
  tenantId: string;
}
export interface ConnectionView {
  id: string;
  name: string;
  environment: string;
  endpoint: string;
  tenantId: string;
  serviceIdentity: string;
  enabled: boolean;
  credentialsConfigured: boolean;
  credentialVersion: number;
  updatedAt: string;
  lastValidation: string | null;
  status: "unknown" | "valid" | "failed" | "stale";
  lastCode: string | null;
  active: boolean;
  checks: ConnectionCheck[];
  destinationCode: string;
  activationCode: string;
}
