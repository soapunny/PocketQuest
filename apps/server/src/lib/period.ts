// apps/server/src/lib/period.ts
import { addMonths, startOfMonth } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

function normalizeTimeZone(tzRaw: unknown): string {
  const tz = typeof tzRaw === "string" ? tzRaw.trim() : "";
  if (!tz) return "America/New_York";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return "America/New_York";
  }
}

function isValidDate(d: unknown): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function utcMonthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function assertReasonableYear(d: Date): boolean {
  const y = d.getUTCFullYear();
  return y >= 1970 && y <= 2100;
}

export function getMonthlyPeriodStartUTC(
  timeZone: string,
  now: Date = new Date()
): Date {
  const tz = normalizeTimeZone(timeZone);
  const base = isValidDate(now) ? now : new Date();

  try {
    const zonedNow = toZonedTime(base, tz);
    const zonedStart = startOfMonth(zonedNow);
    const utc = fromZonedTime(zonedStart, tz);
    if (!isValidDate(utc) || !assertReasonableYear(utc))
      return utcMonthStart(base);
    return utc;
  } catch {
    // Fallback to UTC month start to avoid propagating invalid/out-of-range dates
    return utcMonthStart(base);
  }
}

/**
 * Returns the next month's period start (UTC) for the same user's timezone.
 * Used to build a monthly range: [periodStart, nextPeriodStart)
 */
export function getNextMonthlyPeriodStartUTC(
  timeZone: string,
  now: Date = new Date()
): Date {
  const tz = normalizeTimeZone(timeZone);
  const base = isValidDate(now) ? now : new Date();

  try {
    const zonedNow = toZonedTime(base, tz);
    const zonedStart = startOfMonth(zonedNow);
    const nextZonedStart = addMonths(zonedStart, 1);
    const utc = fromZonedTime(nextZonedStart, tz);
    if (!isValidDate(utc) || !assertReasonableYear(utc))
      return addMonths(utcMonthStart(base), 1);
    return utc;
  } catch {
    return addMonths(utcMonthStart(base), 1);
  }
}

/**
 * Returns the previous month's period start (UTC) for the same user's timezone.
 * Useful for querying last month range: [prevStart, thisStart)
 */
export function getPreviousMonthlyPeriodStartUTC(
  timeZone: string,
  now: Date = new Date()
): Date {
  const tz = normalizeTimeZone(timeZone);
  const base = isValidDate(now) ? now : new Date();

  try {
    const zonedNow = toZonedTime(base, tz);
    const zonedStart = startOfMonth(zonedNow);
    const prevZonedStart = addMonths(zonedStart, -1);
    const utc = fromZonedTime(prevZonedStart, tz);
    if (!isValidDate(utc) || !assertReasonableYear(utc))
      return addMonths(utcMonthStart(base), -1);
    return utc;
  } catch {
    return addMonths(utcMonthStart(base), -1);
  }
}
