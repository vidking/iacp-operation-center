import { describe, expect, it } from "vitest";
import {
  hasActiveOperation,
  isTemporaryPowerFailure,
  isTransientReadFailure,
  networkEvidence,
  powerStatusMessage,
} from "../src/lib/crm/state";
import type { Operation } from "../src/lib/types/observation";

function operation(
  normalized_status: Operation["normalized_status"],
  fulfillment?: Operation["fulfillment"],
) {
  return { normalized_status, fulfillment } as Pick<
    Operation,
    "normalized_status" | "fulfillment"
  >;
}

describe("CRM observation state", () => {
  it("does not treat a historical completed operation as active", () => {
    expect(hasActiveOperation([operation("completed")])).toBe(false);
  });

  it("keeps mutations blocked for active, uncertain, or in-flight fulfillment", () => {
    expect(hasActiveOperation([operation("running")])).toBe(true);
    expect(hasActiveOperation([operation("uncertain")])).toBe(true);
    expect(
      hasActiveOperation([
        operation("completed", {
          status: "running",
          phase: "guest-readiness",
        }),
      ]),
    ).toBe(true);
  });

  it("classifies temporary reads without treating them as VM failures", () => {
    expect(isTransientReadFailure("UPSTREAM_SERVICE_UNAVAILABLE")).toBe(true);
    expect(isTransientReadFailure("UPSTREAM_HTTP_ERROR", 504)).toBe(true);
    expect(isTemporaryPowerFailure("POWER_PROXMOX_UNAVAILABLE")).toBe(true);
    expect(isTemporaryPowerFailure("POWER_INSTANCE_NOT_AUTHORIZED")).toBe(
      false,
    );
    expect(powerStatusMessage("UPSTREAM_TIMEOUT", null, true)).toContain(
      "desactualizada",
    );
    expect(
      powerStatusMessage("POWER_INSTANCE_NOT_AUTHORIZED", null, false),
    ).toContain("no autorizó");
  });

  it("prefers the public IP field and only recognizes the same explicit field in a network observation", () => {
    expect(
      networkEvidence({
        ip_addresses: ["192.168.3.82"],
        network_observation: null,
        updated_at: "2026-10-27T12:00:00Z",
      }),
    ).toMatchObject({
      addresses: ["192.168.3.82"],
      source: "instance.ip_addresses",
    });
    expect(
      networkEvidence({
        ip_addresses: [],
        network_observation: {
          ip_addresses: ["192.168.3.83"],
          observed_at: "2026-10-27T12:01:00Z",
        },
        updated_at: "2026-10-27T12:00:00Z",
      }),
    ).toMatchObject({
      addresses: ["192.168.3.83"],
      source: "instance.network_observation.ip_addresses",
    });
    expect(
      networkEvidence({
        ip_addresses: [],
        network_observation: { proxmox_ip: "192.168.3.84" },
        updated_at: "2026-10-27T12:00:00Z",
      }),
    ).toMatchObject({ addresses: [], source: "not_published" });
  });
});
