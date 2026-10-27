// Real acceptance is read-only by default. Mutations require a deliberately
// explicit, narrow command-line approval for one disposable MNG KVM.
const disposableApproval = "--approve-single-disposable-mng";
const stopAfterProvision = "--stop-after-provision";
const continuationMode = "continue";
const checkpointOption = "--checkpoint=";
const hardwareEvidenceOption = "--hardware-evidence=";
/** @param {string} mode */
export function assertReadOnlyAcceptance(mode) {
  if (!["baseline", "read"].includes(mode))
    throw new Error("REAL_INFRASTRUCTURE_E2E_SUSPENDED");
}
/**
 * @param {string} mode
 * @param {string | undefined} approval
 * @param {string[]} [options]
 */
export function assertAuthorizedAcceptance(mode, approval, options = []) {
  if (["baseline", "read"].includes(mode)) return "read-only";
  if (mode === "mutating" && approval === disposableApproval) {
    if (options.length === 0) return "single-disposable-mng";
    if (options.length === 1 && options[0] === stopAfterProvision)
      return "single-disposable-mng-provision";
  }
  if (
    mode === continuationMode &&
    approval === disposableApproval &&
    options.length === 2 &&
    options.some((option) => option.startsWith(checkpointOption)) &&
    options.some((option) => option.startsWith(hardwareEvidenceOption))
  )
    return "single-disposable-mng-continuation";
  throw new Error("REAL_INFRASTRUCTURE_E2E_SUSPENDED");
}

/** @param {string[]} options @param {string} prefix */
export function acceptanceOption(options, prefix) {
  const value = options.find((option) => option.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}
