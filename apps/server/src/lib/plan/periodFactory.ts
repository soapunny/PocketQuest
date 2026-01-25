import { PeriodType } from "@prisma/client";

import {
  getMonthlyPeriodStartUTC,
  getWeeklyPeriodStartUTC,
  getBiweeklyPeriodStartUTC,
  getNextPeriodStartUTC,
} from "./periodRules";

import { isValidDate } from "./periodUtils";
import {
  DEFAULT_BIWEEKLY_ANCHOR_UTC,
  DEFAULT_WEEK_STARTS_ON,
} from "./defaults";

/**
 * Single-source factory for computing a Plan's period window.
 *
 * IMPORTANT:
 * - `timeZone` lives on User, not Plan.
 * - Plans store `periodStart`/`periodEnd` as UTC instants (Date / timestamptz).
 * - WEEKLY starts on Monday by default.
 * - MONTHLY starts on day 1.
 * - BIWEEKLY is anchored (default anchor lives below).
 */

function normalizeWeekStartsOn(
  value: unknown,
  fallback: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isInteger(n) && n >= 0 && n <= 6)
    return n as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  return fallback;
}

function resolveBiweeklyAnchorUTC(anchorUTC?: Date | null): Date {
  // Treat invalid dates as missing; policy fallback lives here (not in periodRules).
  if (anchorUTC && isValidDate(anchorUTC)) return anchorUTC;
  return DEFAULT_BIWEEKLY_ANCHOR_UTC;
}

export type PeriodWindow = {
  periodType: PeriodType;
  periodStartUTC: Date;
  periodEndUTC: Date;
  /**
   * For BIWEEKLY, the anchor used to compute the window.
   * For WEEKLY/MONTHLY, typically null.
   */
  periodAnchorUTC: Date | null;
};

export type PeriodFactoryParams = {
  periodType: PeriodType;
  timeZone: string;
  now?: Date;
  periodAnchorUTC?: Date | null;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

function assertValidWindow(
  start: Date,
  end: Date,
  ctx: { periodType: PeriodType; timeZone: string },
) {
  const startMs = start.getTime();
  const endMs = end.getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error(
      `[periodFactory] invalid dates for ${ctx.periodType} (${ctx.timeZone})`,
    );
  }
  if (endMs <= startMs) {
    throw new Error(
      `[periodFactory] invalid window: end <= start for ${ctx.periodType} (${ctx.timeZone}) start=${start.toISOString()} end=${end.toISOString()}`,
    );
  }
}

/**
 * Compute a period window using the canonical rules.
 * This is the function routes/rollover/switch should call.
 */
export function computePeriodWindow(params: PeriodFactoryParams): PeriodWindow {
  const { periodType, timeZone, now = new Date(), periodAnchorUTC } = params;
  const weekStartsOn = normalizeWeekStartsOn(
    params.weekStartsOn,
    DEFAULT_WEEK_STARTS_ON,
  );

  let periodStartUTC: Date;
  let periodEndUTC: Date;
  let anchorUTC: Date | null = null;

  switch (periodType) {
    case PeriodType.WEEKLY: {
      periodStartUTC = getWeeklyPeriodStartUTC(timeZone, now, weekStartsOn);

      // Weekly end = start of next week.
      periodEndUTC = getNextPeriodStartUTC({
        periodType,
        timeZone,
        periodStartUTC,
      });

      anchorUTC = null;
      break;
    }

    case PeriodType.BIWEEKLY: {
      anchorUTC = resolveBiweeklyAnchorUTC(periodAnchorUTC);
      periodStartUTC = getBiweeklyPeriodStartUTC(
        timeZone,
        anchorUTC,
        now,
        weekStartsOn,
      );

      // Biweekly end = start + 14 days.
      periodEndUTC = getNextPeriodStartUTC({
        periodType,
        timeZone,
        periodStartUTC,
      });

      break;
    }

    case PeriodType.MONTHLY:
    default: {
      periodStartUTC = getMonthlyPeriodStartUTC(timeZone, now);
      periodEndUTC = getNextPeriodStartUTC({
        periodType,
        timeZone,
        periodStartUTC,
      });
      anchorUTC = null;
      break;
    }
  }

  assertValidWindow(periodStartUTC, periodEndUTC, { periodType, timeZone });

  return {
    periodType,
    periodStartUTC,
    periodEndUTC,
    periodAnchorUTC: anchorUTC,
  };
}

/**
 * Backwards-compat helper for older call-sites.
 *
 * Some routes/screens refer to `buildPeriodForNowUTC`.
 * We keep it as a thin wrapper around `computePeriodWindow`.
 */
export function buildPeriodForNowUTC(args: {
  nowUTC: Date;
  periodType: PeriodType;
  timeZone: string;
  periodAnchorUTC?: Date | null;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}): PeriodWindow {
  return computePeriodWindow({
    periodType: args.periodType,
    timeZone: args.timeZone,
    now: args.nowUTC,
    periodAnchorUTC: args.periodAnchorUTC ?? null,
    weekStartsOn: args.weekStartsOn,
  });
}

/**
 * Convenience: compute window for a plan's own stored settings.
 */
export function computePeriodWindowForPlan(args: {
  periodType: PeriodType;
  timeZone: string;
  now?: Date;
  periodAnchorUTC?: Date | null;
}): PeriodWindow {
  return computePeriodWindow({
    periodType: args.periodType,
    timeZone: args.timeZone,
    now: args.now,
    periodAnchorUTC: args.periodAnchorUTC ?? null,
  });
}
