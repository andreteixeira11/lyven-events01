/**
 * Datetime helpers for timezone-safe event date handling.
 *
 * Event dates are stored as TIMESTAMPTZ in Supabase. Without an explicit
 * UTC offset, Postgres interprets naive ISO strings (e.g. "2026-08-24T22:00:00")
 * as UTC, which shifts the displayed hour/day for users in Madeira (WEST = UTC+1
 * in summer). These helpers always emit an offset-aware ISO string so the
 * wall-clock time the promoter picked is exactly what attendees see.
 */

/** Pads a number to 2 digits, e.g. 5 -> "05". */
function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Returns the local timezone offset as "+HH:MM" / "-HH:MM". */
function localOffsetString(d: Date): string {
  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * Builds an offset-aware ISO string from a local date, optionally overriding
 * the time-of-day from a separate time-only Date (as produced by TimePicker).
 *
 * Example (Europe/Lisbon, summer): date 2026-08-24, time 22:00
 * -> "2026-08-24T22:00:00+01:00"
 *
 * When `time` is omitted, the date's own time-of-day is kept; use
 * `midnightLocal` to normalize to 00:00 local.
 */
export function toLocalISOString(date: Date, time?: Date): string {
  const d = new Date(date);
  if (time) {
    d.setHours(time.getHours(), time.getMinutes(), 0, 0);
  }
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    localOffsetString(d)
  );
}

/**
 * Builds an offset-aware ISO string for midnight local time of the given date,
 * suitable for date-only values like multi-day event end dates.
 * Example: "2026-08-26T00:00:00+01:00"
 */
export function toDateOnlyISOString(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return toLocalISOString(d);
}

/**
 * Formats a Date as "YYYY-MM-DD" using LOCAL calendar components — unlike
 * `date.toISOString().split('T')[0]`, which uses UTC and can return the
 * previous day for timezones ahead of UTC.
 */
export function toLocalDateString(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Formats a Date as "HH:MM" using LOCAL time components. */
export function toLocalTimeString(date: Date): string {
  const d = new Date(date);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
