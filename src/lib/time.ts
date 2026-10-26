export const displayTimeZone = "America/Costa_Rica";
export function instant(value: string | null | undefined): number | null {
  if (
    !value ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)
  )
    return null;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : null;
}
export function formatTime(value: string | null | undefined) {
  const n = instant(value);
  if (n === null) return value ? "Fecha sin zona o inválida" : "No disponible";
  return (
    new Intl.DateTimeFormat("es-CR", {
      timeZone: displayTimeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .format(n)
      .replace(",", "") + " CST (UTC−06:00)"
  );
}
export function utcTime(value: string | null | undefined) {
  const n = instant(value);
  return n === null ? "UTC desconocido" : new Date(n).toISOString();
}
