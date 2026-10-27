import { expect, it } from "vitest";
import {
  readHardwareEvidence,
  publishedHardwareEvidence,
} from "../scripts/hardware-evidence.mjs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const expected = {
  instance_id: "11111111-1111-4111-8111-111111111111",
  operation_id: "22222222-2222-4222-8222-222222222222",
  image: "ubuntu-2404",
};

it("does not treat not_published as hardware evidence", () => {
  expect(
    publishedHardwareEvidence({
      instance: {
        result: {
          effective_hardware: {
            cpu_model: "not_published",
            certified: true,
            source: "IACP_PUBLIC_CONTRACT",
            observed_at: "2026-10-27T06:00:00Z",
          },
        },
      },
    }),
  ).toBeNull();
});

it("accepts matching read-only evidence and rejects protected VMIDs", () => {
  const dir = mkdtempSync(join(tmpdir(), "iacoc-hardware-evidence-"));
  const path = join(dir, "hardware.json");
  writeFileSync(
    path,
    JSON.stringify({
      ...expected,
      verified: true,
      source: "MANUAL_READ_ONLY_ATTESTATION",
      cpu_model: "certified-model",
      vmid: 30123,
      node: "mng01",
      vcpus: 1,
      memory_mb: 2048,
      disk_gb: 50,
      observed_at: "2026-10-27T06:00:00Z",
    }),
  );
  expect(readHardwareEvidence(path, expected).cpu_model).toBe(
    "certified-model",
  );
  writeFileSync(
    path,
    JSON.stringify({
      ...expected,
      verified: true,
      source: "MANUAL_READ_ONLY_ATTESTATION",
      cpu_model: "certified-model",
      vmid: 30029,
      node: "mng01",
      vcpus: 1,
      memory_mb: 2048,
      disk_gb: 50,
      observed_at: "2026-10-27T06:00:00Z",
    }),
  );
  expect(() => readHardwareEvidence(path, expected)).toThrow(
    "HARDWARE_EVIDENCE_INVALID",
  );
});
