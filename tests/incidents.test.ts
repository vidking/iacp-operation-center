import { it, expect } from "vitest";
import {
  incidentState,
  recoveryEligible,
  incidentDiagnosis,
  safeEvidence,
  correlatedEvents,
} from "../src/lib/types/incidents";
import { formatTime, utcTime } from "../src/lib/time";
import type { Operation, AuditEvent } from "../src/lib/types/observation";
import type { Instance } from "../src/lib/types/crm";
const op: Operation = {
  operation_id: "1869769b-cfed-4101-97a5-7a6ecd77256c",
  instance_id: "a5318da2-79bd-485f-b334-79ba739f3666",
  kind: "instance.power.reboot",
  status: "failed",
  normalized_status: "failed",
  requested_by: "redacted-test-operator",
  error_code: "POWER_ACPI_TIMEOUT",
  recovery_required: false,
  created_at: "2026-10-26T06:48:02Z",
  updated_at: "2026-10-26T06:49:05Z",
};
const deleted = {
  instance_id: op.instance_id,
  status: "deleted",
  vmid: 30028,
  node: "mng01",
} as Instance;
it("keeps deleted VM 30028 historical failure, never recoverable", () => {
  expect(incidentState(op, deleted)).toBe("closed");
  expect(op.status).toBe("failed");
  expect(
    recoveryEligible(
      { ...op, normalized_status: "uncertain", recovery_required: true },
      deleted,
    ),
  ).toBe(false);
});
it("keeps active and unknown resources requiring attention without guessing resolution", () => {
  expect(incidentState(op, { ...deleted, status: "ready" })).toBe("attention");
  expect(incidentState(op, null, Date.now() + 86400000)).toBe("attention");
});
it("models confirmed ongoing recovery separately from the persisted failure", () => {
  expect(incidentState({ ...op, normalized_status: "running" }, null)).toBe(
    "investigating",
  );
  expect(incidentState({ ...op, normalized_status: "completed" }, null)).toBe(
    "closed",
  );
});
it("does not manufacture incidents or recovery from absent signals", () => {
  expect(
    incidentState(
      {
        ...op,
        status: "completed",
        normalized_status: "completed",
        error_code: null,
      },
      null,
    ),
  ).toBeNull();
  expect(
    recoveryEligible({ ...op, normalized_status: "uncertain" }, null),
  ).toBe(false);
  expect(
    recoveryEligible(
      { ...op, normalized_status: "uncertain", recovery_required: false },
      { ...deleted, status: "ready" },
    ),
  ).toBe(false);
});
it("labels timeout root cause as probable, not confirmed guest-agent failure", () => {
  expect(incidentDiagnosis(op, deleted).hypothesis).toContain("no demuestra");
  expect(incidentDiagnosis(op, deleted).next).toContain("eliminada");
});
it.each([
  "Bearer abcdefghijklmnop",
  "password=hunter2",
  "token=redacted",
  "-----BEGIN PRIVATE KEY-----",
  "https://user:password@host",
])("redacts unsafe evidence %s", (v) => {
  expect(safeEvidence(v)).toBe("[redactado]");
});
it("deduplicates and correlates events without linking another instance", () => {
  const e = {
    event_id: 1,
    operation_id: op.operation_id,
    instance_id: op.instance_id,
    occurred_at: op.created_at,
  } as AuditEvent;
  expect(
    correlatedEvents([e, e, { ...e, event_id: 2, instance_id: "other" }], op),
  ).toEqual([e]);
});
it("preserves UTC and converts midnight boundaries without assuming naive timezone", () => {
  expect(formatTime("2026-10-26T05:59:59Z")).toContain("25/10/2026");
  expect(formatTime("2026-10-26T06:00:00Z")).toContain("26/10/2026");
  expect(utcTime(op.created_at)).toBe("2026-10-26T06:48:02.000Z");
  expect(formatTime("2026-10-26T06:00:00")).toBe("Fecha sin zona o inválida");
});
