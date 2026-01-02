// apps/server/src/lib/period.ts
import { startOfMonth } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export function getMonthlyPeriodStartUTC(
  timeZone: string,
  now: Date = new Date()
): Date {
  const zonedNow = toZonedTime(now, timeZone);
  const zonedStart = startOfMonth(zonedNow);
  return fromZonedTime(zonedStart, timeZone);
}

/**
 * Returns the next month's period start (UTC) for the same user's timezone.
 * Used to build a monthly range: [periodStart, nextPeriodStart)
 */
export function getNextMonthlyPeriodStartUTC(
  timeZone: string,
  now: Date = new Date()
): Date {
  // Compute this month's boundary in user's timezone
  const zonedNow = toZonedTime(now, timeZone);
  const zonedStart = startOfMonth(zonedNow);

  // Move to next month while staying in user's timezone
  const nextZonedStart = new Date(zonedStart);
  nextZonedStart.setMonth(nextZonedStart.getMonth() + 1);

  // Convert that boundary back to UTC for DB queries
  return fromZonedTime(nextZonedStart, timeZone);
}

/**
 * Returns the previous month's period start (UTC) for the same user's timezone.
 * Useful for querying last month range: [prevStart, thisStart)
 */
export function getPreviousMonthlyPeriodStartUTC(
  timeZone: string,
  now: Date = new Date()
): Date {
  const zonedNow = toZonedTime(now, timeZone);
  const zonedStart = startOfMonth(zonedNow);

  const prevZonedStart = new Date(zonedStart);
  prevZonedStart.setMonth(prevZonedStart.getMonth() - 1);

  return fromZonedTime(prevZonedStart, timeZone);
}
