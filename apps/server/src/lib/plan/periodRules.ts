// apps/server/src/lib/plan/periodRules.ts
// Period calculation rules for budget/savings plans.
// Default를 처리하는 곳이 아니라 계산만 처리하는 파일

/*
 * 시간대 정규화
 * - 유저 timezone 정규화
 * - 유효한 date-fns 날짜 확인
 * - 유효한 년도 확인
 * - UTC 달 시작 계산
 * - UTC 달 다음 시작 계산
 * - UTC 달 이전 시작 계산
 */

import { addDays, addMonths, startOfMonth } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

import {
  normalizeTimeZone,
  zonedDayNumber,
  isValidDate,
  assertReasonableYear,
  utcMonthStart,
} from "./periodUtils";
import { PeriodType } from "@prisma/client";

const WEEK_DAYS = 7;
const BIWEEK_DAYS = 14;

function utcDayStart(d: Date): Date {
  const base = isValidDate(d) ? d : new Date();
  return new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}

export function getPeriodStartUTC(params: {
  periodType: PeriodType;
  timeZone: string;
  now?: Date;
  periodAnchorUTC?: Date | null;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}): Date {
  const { periodType, timeZone, now = new Date(), weekStartsOn } = params;

  switch (periodType) {
    case PeriodType.WEEKLY:
      return getWeeklyPeriodStartUTC(timeZone, now, weekStartsOn);
    case PeriodType.BIWEEKLY: {
      const anchor = params.periodAnchorUTC;
      if (!anchor) throw new Error("BIWEEKLY requires periodAnchorUTC");
      return getBiweeklyPeriodStartUTC(timeZone, anchor, now, weekStartsOn);
    }
    case PeriodType.MONTHLY:
    default:
      return getMonthlyPeriodStartUTC(timeZone, now);
  }
}

export function getNextPeriodStartUTC(params: {
  periodType: PeriodType;
  timeZone: string;
  periodStartUTC: Date;
}): Date {
  const { periodType, timeZone, periodStartUTC } = params;

  switch (periodType) {
    case PeriodType.WEEKLY:
      return getNextWeeklyPeriodStartUTC(timeZone, periodStartUTC);
    case PeriodType.BIWEEKLY:
      return getNextBiweeklyPeriodStartUTC(timeZone, periodStartUTC);
    case PeriodType.MONTHLY:
    default:
      return getNextMonthlyPeriodStartFromStartUTC(timeZone, periodStartUTC);
  }
}

// 사용자의 타임존에 맞는 이번 달의 시작 날짜를 UTC로 변환하여 반환
// (이상한 날짜이면 UTC를 기준으로 반환)
export function getMonthlyPeriodStartUTC(
  timeZone: string,
  now: Date = new Date(),
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
    return utcMonthStart(base);
  }
}

/**
 * Returns the next month's period start (UTC) for the same user's timezone.
 * Used to build a monthly range: [periodStart, nextPeriodStart)
 */
export function getNextMonthlyPeriodStartUTC(
  timeZone: string,
  now: Date = new Date(),
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
 * Monthly next periodStart (UTC) given a current monthly periodStartUTC.
 * This is intentionally explicit for callers that already have a period boundary.
 */
export function getNextMonthlyPeriodStartFromStartUTC(
  timeZone: string,
  periodStartUTC: Date,
): Date {
  return getNextMonthlyPeriodStartUTC(timeZone, periodStartUTC);
}

/**
 * Returns the previous month's period start (UTC) for the same user's timezone.
 * Useful for querying last month range: [prevStart, thisStart)
 */
export function getPreviousMonthlyPeriodStartUTC(
  timeZone: string,
  now: Date = new Date(),
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

/**
 * Weekly periodStart (UTC)를 반환
 * - 사용자의 timezone 기준으로 "이번 주 시작"을 계산한 뒤 UTC로 변환
 * - weekStartsOn: 0(일)~6(토)
 */
export function getWeeklyPeriodStartUTC(
  timeZone: string,
  now: Date = new Date(),
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): Date {
  const tz = normalizeTimeZone(timeZone);
  const base = isValidDate(now) ? now : new Date();

  try {
    const zonedNow = toZonedTime(base, tz);

    const localMidnight = new Date(
      zonedNow.getFullYear(),
      zonedNow.getMonth(),
      zonedNow.getDate(),
      0,
      0,
      0,
      0,
    );

    const day = localMidnight.getDay();
    const diff = (day - weekStartsOn + 7) % 7;
    localMidnight.setDate(localMidnight.getDate() - diff);

    const utc = fromZonedTime(localMidnight, tz);

    if (!isValidDate(utc) || !assertReasonableYear(utc)) {
      return utcDayStart(base);
    }

    return utc;
  } catch {
    return utcDayStart(base);
  }
}

/**
 * Weekly next periodStart (UTC)
 * - Given a weekly periodStartUTC, returns the next week's start boundary in UTC.
 * - Uses local-time computation to avoid DST edge cases.
 */
export function getNextWeeklyPeriodStartUTC(
  timeZone: string,
  periodStartUTC: Date,
): Date {
  const tz = normalizeTimeZone(timeZone);
  const base = isValidDate(periodStartUTC) ? periodStartUTC : new Date();

  try {
    const startLocal = toZonedTime(base, tz);
    const startLocalMidnight = new Date(
      startLocal.getFullYear(),
      startLocal.getMonth(),
      startLocal.getDate(),
      0,
      0,
      0,
      0,
    );

    const endLocal = addDays(startLocalMidnight, WEEK_DAYS);
    const utc = fromZonedTime(endLocal, tz);

    if (!isValidDate(utc) || !assertReasonableYear(utc))
      return addDays(utcDayStart(base), WEEK_DAYS);

    return utc;
  } catch {
    return addDays(utcDayStart(base), WEEK_DAYS);
  }
}

/**
 * Biweekly periodStart (UTC)를 반환
 * - anchor가 속한 "주 시작"을 기준으로 2주 단위 그룹을 나눔
 * - DST 영향을 피하기 위해 로컬 day number 기반으로 weekDiff를 계산
 */
export function getBiweeklyPeriodStartUTC(
  timeZone: string,
  anchorUTC: Date,
  now: Date = new Date(),
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): Date {
  const tz = normalizeTimeZone(timeZone);
  const baseNow = isValidDate(now) ? now : new Date();
  const baseAnchor = isValidDate(anchorUTC) ? anchorUTC : new Date();

  try {
    const thisWeekStartUTC = getWeeklyPeriodStartUTC(tz, baseNow, weekStartsOn);
    const anchorWeekStartUTC = getWeeklyPeriodStartUTC(
      tz,
      baseAnchor,
      weekStartsOn,
    );

    const thisWeekDayNum = zonedDayNumber(thisWeekStartUTC, tz);
    const anchorWeekDayNum = zonedDayNumber(anchorWeekStartUTC, tz);

    const dayDiff = thisWeekDayNum - anchorWeekDayNum;
    const weekDiff = Math.floor(dayDiff / 7);

    if (weekDiff % 2 === 0) {
      return thisWeekStartUTC;
    }

    const zonedThisWeekStart = toZonedTime(thisWeekStartUTC, tz);
    const prevZonedWeekStart = addDays(zonedThisWeekStart, -7);
    const prevUTC = fromZonedTime(prevZonedWeekStart, tz);

    if (!isValidDate(prevUTC) || !assertReasonableYear(prevUTC)) {
      return thisWeekStartUTC;
    }

    return prevUTC;
  } catch {
    return getWeeklyPeriodStartUTC(tz, baseNow, weekStartsOn);
  }
}

/**
 * Biweekly next periodStart (UTC)
 * - Given a biweekly periodStartUTC, returns the next biweekly boundary (start + 14 days) in UTC.
 * - Uses local-time computation to avoid DST edge cases.
 */
export function getNextBiweeklyPeriodStartUTC(
  timeZone: string,
  periodStartUTC: Date,
): Date {
  const tz = normalizeTimeZone(timeZone);
  const base = isValidDate(periodStartUTC) ? periodStartUTC : new Date();

  try {
    const startLocal = toZonedTime(base, tz);
    const startLocalMidnight = new Date(
      startLocal.getFullYear(),
      startLocal.getMonth(),
      startLocal.getDate(),
      0,
      0,
      0,
      0,
    );

    const endLocal = addDays(startLocalMidnight, BIWEEK_DAYS);
    const utc = fromZonedTime(endLocal, tz);

    if (!isValidDate(utc) || !assertReasonableYear(utc))
      return addDays(utcDayStart(base), BIWEEK_DAYS);

    return utc;
  } catch {
    return addDays(utcDayStart(base), BIWEEK_DAYS);
  }
}

function legacyNextPeriodEnd(base: Date, periodType: PeriodType): Date {
  const startUTC0 = utcDayStart(base);

  if (periodType === PeriodType.WEEKLY) {
    return addDays(startUTC0, WEEK_DAYS);
  }

  if (periodType === PeriodType.BIWEEKLY) {
    return addDays(startUTC0, BIWEEK_DAYS);
  }

  // MONTHLY: use a stable UTC month boundary fallback.
  return addMonths(utcMonthStart(base), 1);
}

/**
 * 다음 periodEnd 계산
 * - WEEKLY: +7일 (로컬 자정 스냅)
 * - BIWEEKLY: +14일 (로컬 자정 스냅)
 * - MONTHLY: 다음 달 1일 00:00 (로컬)
 */
export function calcNextPeriodEnd(
  periodStart: Date,
  periodType: PeriodType,
  timeZone?: string,
): Date {
  const base = isValidDate(periodStart) ? periodStart : new Date();

  // timeZone이 없으면 여기서 임의 기본값을 쓰지 않고 레거시로 폴백
  if (!timeZone) {
    return legacyNextPeriodEnd(base, periodType);
  }

  const tz = normalizeTimeZone(timeZone);

  try {
    const startUTC = isValidDate(base) ? base : new Date();

    // We compute the next boundary in local time for DST safety.
    const utc = getNextPeriodStartUTC({
      periodType,
      timeZone: tz,
      periodStartUTC: startUTC,
    });

    if (!isValidDate(utc) || !assertReasonableYear(utc)) {
      return legacyNextPeriodEnd(base, periodType);
    }

    return utc;
  } catch {
    return legacyNextPeriodEnd(base, periodType);
  }
}

/**
 * periodEnd가 null인 레거시 plan 방어용
 * - periodEnd가 없으면 periodStart + periodType로 계산해준다.
 */
export function ensurePeriodEnd(
  periodStart: Date,
  periodEnd: Date | null | undefined,
  periodType: PeriodType,
  timeZone?: string,
): Date {
  return periodEnd ?? calcNextPeriodEnd(periodStart, periodType, timeZone);
}
