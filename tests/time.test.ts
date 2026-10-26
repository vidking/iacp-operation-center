import { it, expect } from "vitest";
import { formatTime, instant, utcTime } from "../src/lib/time";
it("converts across midnight and preserves UTC for audit", () => {
  expect(formatTime("2026-10-26T05:15:40Z")).toBe(
    "25/10/2026 23:15:40 CST (UTC−06:00)",
  );
  expect(formatTime("2026-10-26T06:00:00Z")).toBe(
    "26/10/2026 00:00:00 CST (UTC−06:00)",
  );
  expect(formatTime("2026-10-26T00:00:00+02:00")).toBe(
    "25/10/2026 16:00:00 CST (UTC−06:00)",
  );
  expect(utcTime("2026-10-25T23:15:40-06:00")).toBe("2026-10-26T05:15:40.000Z");
});
it("rejects naive timestamps instead of assigning a timezone", () => {
  expect(instant("2026-10-25T23:15:40")).toBeNull();
  expect(formatTime("2026-10-25T23:15:40")).toBe("Fecha sin zona o inválida");
  expect(formatTime(null)).toBe("No disponible");
});
it("orders and filters instants independently of the presentation day", () => {
  const values = [
    "2026-10-26T06:00:01Z",
    "2026-10-25T23:59:59-06:00",
    "2026-10-26T06:00:00Z",
  ];
  expect(values.sort((a, b) => instant(a)! - instant(b)!)).toEqual([
    "2026-10-25T23:59:59-06:00",
    "2026-10-26T06:00:00Z",
    "2026-10-26T06:00:01Z",
  ]);
  expect(
    values.filter((v) => instant(v)! >= instant("2026-10-26T00:00:00-06:00")!),
  ).toHaveLength(2);
});
