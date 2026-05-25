/**
 * Business timezone for `<input type="datetime-local">` round-trips. The server
 * runs in UTC (Railway), so formatting/parsing datetime-local values via the
 * runtime's local time shifted them by the UTC offset. We pin to one business
 * TZ instead (single-location service). Dependency-free via Intl — exact for a
 * fixed-offset zone like Europe/Moscow (UTC+3, no DST).
 */
export const BUSINESS_TZ = "Europe/Moscow";

/** UTC instant → "yyyy-MM-ddTHH:mm" wall-clock string in BUSINESS_TZ (for the
 *  value of a datetime-local input). Returns "" for null. */
export function formatForDatetimeLocalInput(date: Date | null, tz: string = BUSINESS_TZ): string {
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour"); // some engines emit "24" at midnight
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/** Offset (tz − UTC) in ms at a given UTC instant. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  const hour = get("hour") === 24 ? 0 : get("hour");
  const asWallUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asWallUtc - utcMs;
}

/** "yyyy-MM-ddTHH:mm" entered as BUSINESS_TZ wall-clock → the corresponding UTC
 *  Date. Returns null when the string is not a valid datetime-local value. */
export function parseDatetimeLocalInput(value: string, tz: string = BUSINESS_TZ): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const asIfUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  const date = new Date(asIfUtc - tzOffsetMs(asIfUtc, tz));
  return Number.isNaN(date.getTime()) ? null : date;
}
