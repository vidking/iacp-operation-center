import { iacpOperations, type IacpOperationId } from "./iacp.generated.ts";
export function contractPath(
  id: IacpOperationId,
  parameters: Record<string, string> = {},
) {
  const operation = iacpOperations[id];
  const names = [...operation.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  if (
    Object.keys(parameters).some((k) => !names.includes(k)) ||
    names.some((k) => !/^[A-Za-z0-9_-]{1,128}$/.test(parameters[k] ?? ""))
  )
    throw new Error("INVALID_CONTRACT_PARAMETERS");
  return operation.path.replace(/\{([^}]+)\}/g, (_, key) =>
    encodeURIComponent(parameters[key]),
  );
}
export const crmActions = {
  create: "createInstance",
  start: "startInstancePower",
  shutdown: "shutdownInstancePower",
  reboot: "rebootInstancePower",
  delete: "deleteDisposableInstance",
  reconcile: "reconcileInstance",
  discover: "discoverInstanceNetwork",
  initialize: "initializeInstanceNetwork",
  verifyAccess: "verifyInstanceAccess",
  provision: "resumeLabProvisioning",
  retryProvision: "retryLabProvisioning",
} as const satisfies Record<string, IacpOperationId>;
