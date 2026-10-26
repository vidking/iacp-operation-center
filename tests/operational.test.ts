import { it, expect, vi, afterEach } from "vitest";
import { scheduleReads, singleFlight } from "../src/lib/refresh";
import { diagnosis, evidenceSeconds } from "../src/lib/diagnostics";
import { operationalReport } from "../src/lib/report";
import { operationSchema } from "../src/lib/types/observation";
afterEach(() => vi.useRealTimers());
it("coalesces concurrent browser refreshes", async () => {
  let resolve!: (v: boolean) => void;
  const run = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
  const a = singleFlight("test-concurrent", run),
    b = singleFlight("test-concurrent", run);
  expect(run).toHaveBeenCalledTimes(1);
  resolve(true);
  expect(await a).toBe(true);
  expect(await b).toBe(true);
});
it("pauses hidden reads and applies bounded failure backoff without overlapping jobs", async () => {
  vi.useFakeTimers();
  let visible = false;
  const read = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  const stop = scheduleReads({
    key: "test-poll",
    enabled: () => true,
    visible: () => visible,
    interval: () => 4000,
    read,
  });
  await vi.advanceTimersByTimeAsync(4000);
  expect(read).not.toHaveBeenCalled();
  visible = true;
  await vi.advanceTimersByTimeAsync(4000);
  expect(read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(8000);
  expect(read).toHaveBeenCalledTimes(2);
  stop();
  await vi.advanceTimersByTimeAsync(60000);
  expect(read).toHaveBeenCalledTimes(2);
});
const op = () =>
  operationSchema.parse({
    operation_id: "op-report",
    instance_id: "instance-report",
    kind: "instance.create",
    status: "running",
    normalized_status: "running",
    requested_by: "fixture-operator",
    error_code: null,
    created_at: "2026-10-26T05:59:00Z",
    updated_at: "2026-10-26T06:00:00Z",
    events: [
      {
        id: 1,
        status: "queued",
        code: "REQUEST_ACCEPTED",
        actor: "fixture-operator",
        created_at: "2026-10-26T05:59:00Z",
        password: "NEVER_EXPORT",
      },
    ],
  });
it("reports UTC and Costa Rica with precise duration semantics and projected evidence", () => {
  const report = operationalReport({
    operations: [op()],
    events: [],
    observedAt: "2026-10-26T06:00:00Z",
  });
  expect(report.operations[0].admitted.costa_rica).toContain(
    "25/10/2026 23:59:00",
  );
  expect(report.operations[0].last_evidence.costa_rica).toContain(
    "26/10/2026 00:00:00",
  );
  expect(report.operations[0].evidence_interval_seconds).toBe(60);
  expect(report.operations[0].worker_id).toBeNull();
  expect(report.operations[0].finished_at).toBeNull();
  expect(JSON.stringify(report)).not.toContain("NEVER_EXPORT");
});
it("distinguishes uncertain results and missing recent evidence from an authorization rejection", () => {
  const operation = op();
  expect(
    diagnosis(operation, Date.parse("2026-10-26T06:03:00Z")).category,
  ).toBe("Sin evidencia reciente");
  operation.normalized_status = "uncertain";
  expect(diagnosis(operation).category).toBe("Resultado incierto");
  operation.error_code = "ADMISSION_POLICY_DENIED";
  expect(diagnosis(operation).category).toBe("Solicitud rechazada");
  expect(evidenceSeconds("naive", "2026-10-26T00:00:00Z")).toBeNull();
});
