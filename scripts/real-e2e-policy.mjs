// Real acceptance is read-only by default. Mutations require a deliberately
// explicit, narrow command-line approval for one disposable MNG KVM.
const disposableApproval = "--approve-single-disposable-mng";
/** @param {string} mode */
export function assertReadOnlyAcceptance(mode) {
  if (!["baseline", "read"].includes(mode))
    throw new Error("REAL_INFRASTRUCTURE_E2E_SUSPENDED");
}
/** @param {string} mode @param {string | undefined} approval */
export function assertAuthorizedAcceptance(mode, approval) {
  if (["baseline", "read"].includes(mode)) return "read-only";
  if (mode === "mutating" && approval === disposableApproval)
    return "single-disposable-mng";
  throw new Error("REAL_INFRASTRUCTURE_E2E_SUSPENDED");
}
