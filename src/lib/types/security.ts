import type { ConnectionCheck } from "./connection-diagnostics.ts";
export type Role = "Viewer" | "Operator" | "Administrator";
export const roleLabels: Record<Role, string> = {
  Viewer: "Lector",
  Operator: "Operador",
  Administrator: "Administrador",
};
export interface Principal {
  id: string;
  username: string;
  displayName?: string;
  role: Role;
  tenantId: string;
}

export interface UserView {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  tenantId: string;
  disabled: boolean;
  lastActivity: string | null;
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
  selected: boolean;
  operationalState: import("./connection-state").ConnectionState;
  lastSync: string | null;
  upstreamTenantId: string | null;
  associationState: "pending" | "confirmed" | "unverified";
  checks: ConnectionCheck[];
  destinationCode: string;
  activationCode: string;
}
