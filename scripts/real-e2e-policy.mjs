// Incident hold requested by the user. Applies to real acceptance tools, not product API permissions.
// There is deliberately no environment variable or CLI flag to bypass this hold.
export function assertReadOnlyAcceptance(mode) {
  if (!["baseline", "read"].includes(mode))
    throw new Error("REAL_INFRASTRUCTURE_E2E_SUSPENDED");
}
