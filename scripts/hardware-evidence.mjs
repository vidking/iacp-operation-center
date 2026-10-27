import { readFileSync } from "node:fs";

const allowedSources = new Set([
  "IACP_PUBLIC_CONTRACT",
  "MANUAL_READ_ONLY_ATTESTATION",
]);
const protectedVmids = new Set([104, 106, 29000, 30029]);

/** @param {any} detail */
export function publishedHardwareEvidence(detail) {
  const value = detail?.instance?.result?.effective_hardware;
  if (!value || typeof value !== "object") return null;
  if (
    typeof value.cpu_model !== "string" ||
    !value.cpu_model.trim() ||
    value.cpu_model === "not_published" ||
    value.certified !== true ||
    typeof value.source !== "string" ||
    !allowedSources.has(value.source) ||
    typeof value.observed_at !== "string"
  )
    return null;
  return {
    cpu_model: value.cpu_model,
    certified: true,
    source: value.source,
    observed_at: value.observed_at,
  };
}

/**
 * @param {string} path
 * @param {{instance_id: string, operation_id: string, image: string}} expected
 */
export function readHardwareEvidence(path, expected) {
  let value;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("HARDWARE_EVIDENCE_INVALID");
  }
  if (
    value?.verified !== true ||
    !allowedSources.has(value.source) ||
    typeof value.cpu_model !== "string" ||
    !value.cpu_model.trim() ||
    value.cpu_model === "not_published" ||
    !Number.isInteger(value.vmid) ||
    protectedVmids.has(value.vmid) ||
    value.vmid < 30000 ||
    !["mng01", "mng02"].includes(value.node) ||
    !Number.isInteger(value.vcpus) ||
    !Number.isInteger(value.memory_mb) ||
    !Number.isInteger(value.disk_gb) ||
    value.instance_id !== expected.instance_id ||
    value.operation_id !== expected.operation_id ||
    value.image !== expected.image ||
    typeof value.observed_at !== "string" ||
    !Number.isFinite(Date.parse(value.observed_at))
  )
    throw new Error("HARDWARE_EVIDENCE_INVALID");
  return value;
}
