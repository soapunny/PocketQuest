// apps/server/src/lib/period.ts
/*
 * 시간대 정규화
 * - 유저 timezone 정규화 (기본: America/New_York)
 * - 유효한 date-fns 날짜 확인
 * - 유효한 년도 확인
 * - UTC 달 시작 계산
 * - UTC 달 다음 시작 계산
 * - UTC 달 이전 시작 계산
 */
import { addDays, addMonths, startOfMonth } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

//타임존 시간이 이상하면 default로 America/New_York 반환
function normalizeTimeZone(tzRaw: unknown): string {
  const tz = typeof tzRaw === "string" ? tzRaw.trim() : "";
  if (!tz) return "America/New_York"; //tz(timezone)가 없으면 default로 America/New_York 반환
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date()); // ? 뭔 의미?
    return tz;
  } catch {
    //에러이면 기본값(America/New_York) 반환
    return "America/New_York";
  }
}

function isValidDate(d: unknown): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime()); // d가 Date 인스턴스이고 시간이 유효하면 true 반환
}

function utcMonthStart(d: Date): Date {
  //d가 속한 달의 첫번째 날의 UTC 시간 반환(연도, 월, 일, 시, 분, 초, 밀리초)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function assertReasonableYear(d: Date): boolean {
  const y = d.getUTCFullYear();
  return y >= 1970 && y <= 2100; //1970년부터 2100년까지만 true 반환, 그 외는 이상한 날짜이므로 false 반환
}

//사용자의 타임존에 맞는 이번 달의 시작 날짜를 UTC로 변환하여 반환(이상한 날짜이면 UTC를 기준으로 반환)
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
      return utcMonthStart(base); //이상한 날짜이면 UTC를 기준으로 이번달 시작날짜를 반환
    return utc; //정상적인 날짜이면 사용자의 타임존에 맞는 이번 달의 시작 날짜를 UTC로 변환하여 반환
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

export type PeriodType = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

function legacyNextPeriodEnd(base: Date, periodType: PeriodType): Date {
  const startMs = base.getTime();

  if (periodType === "WEEKLY") {
    return new Date(startMs + 7 * 24 * 60 * 60 * 1000);
  }

  if (periodType === "BIWEEKLY") {
    return new Date(startMs + 14 * 24 * 60 * 60 * 1000);
  }

  // MONTHLY
  const d = new Date(base);
  const day = d.getDate();
  d.setMonth(d.getMonth() + 1);
  if (d.getDate() !== day) d.setDate(0);
  return d;
}

/**
 * 다음 periodEnd 계산
 * - WEEKLY: +7일
 * - BIWEEKLY: +14일
 * - MONTHLY: +1개월 (말일 보정 포함)
 */
export function calcNextPeriodEnd(
  periodStart: Date,
  periodType: PeriodType,
  timeZone?: string
): Date {
  const base = isValidDate(periodStart) ? periodStart : new Date();
  const tz = normalizeTimeZone(timeZone);

  try {
    // ✅ 항상 timezone-safe 계산을 시도
    const zonedStart = toZonedTime(base, tz);

    let zonedEnd: Date;
    switch (periodType) {
      case "WEEKLY":
        zonedEnd = addDays(zonedStart, 7);
        break;
      case "BIWEEKLY":
        zonedEnd = addDays(zonedStart, 14);
        break;
      case "MONTHLY":
      default: {
        // date-fns addMonths는 말일 케이스를 보정해주지만,
        // 정책을 명확히 유지하려면 legacy와 동일한 보정을 적용할 수 있음.
        const day = zonedStart.getDate();
        const tmp = addMonths(zonedStart, 1);
        zonedEnd =
          tmp.getDate() !== day
            ? new Date(tmp.getFullYear(), tmp.getMonth() + 1, 0)
            : tmp;
        break;
      }
    }

    const utc = fromZonedTime(zonedEnd, tz);

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
  timeZone?: string
): Date {
  return periodEnd ?? calcNextPeriodEnd(periodStart, periodType, timeZone);
}
