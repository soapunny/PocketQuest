// apps/server/src/lib/plan/periodUtils.ts
// Timezone normalization and date validation utilities for plan period calculations.
// NOTE: Internal helpers for periodRules.ts. Do not import from routes/screens. Routes should import from periodRules instead.

import { toZonedTime } from "date-fns-tz";
import {
  DEFAULT_LOCALE,
  DEFAULT_TIME_ZONE,
  MIN_REASONABLE_YEAR,
  MAX_REASONABLE_YEAR,
  DAY_MS,
} from "./defaults";

//타임존 시간이 이상하면 default로 DEFAULT_TIME_ZONE 반환
export function normalizeTimeZone(tzRaw: unknown): string {
  const tz = typeof tzRaw === "string" ? tzRaw.trim() : "";
  if (!tz) return DEFAULT_TIME_ZONE; //tz(timezone)가 없으면 default로 DEFAULT_TIME_ZONE 반환
  try {
    // ✅ 이 줄의 목적: "tz"가 실제로 유효한 IANA time zone인지 검증하기 위한 '런타임 체크'
    //
    // - JavaScript는 문자열 timeZone이 유효한지 따로 validate API가 없습니다.
    // - 그래서 Intl.DateTimeFormat에 { timeZone: tz }를 넣고 format()을 한 번 호출해보면,
    //   tz가 잘못된 값일 때 RangeError(Invalid time zone specified)가 발생합니다.
    // - 에러가 안 나면 tz는 유효하다고 보고 그대로 사용하고,
    //   에러가 나면 catch로 떨어져 DEFAULT_TIME_ZONE으로 폴백합니다.
    //
    // ⚠️ 여기서 format 결과(문자열)는 사용하지 않습니다.
    //    "format을 실제로 실행"해야 timeZone 검증이 트리거되기 때문에 호출만 하는 겁니다.
    new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone: tz }).format(
      new Date(),
    );
    return tz;
  } catch {
    //에러이면 기본값(DEFAULT_TIME_ZONE) 반환
    return DEFAULT_TIME_ZONE;
  }
}

export function isValidDate(d: unknown): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime()); // d가 Date 인스턴스이고 시간이 유효하면 true 반환
}
/**
 * 주어진 UTC Date를 "유저 timezone의 로컬 날짜"로 바꾼 뒤,
 * 그 날짜의 day number(1970-01-01로부터 며칠째인지)를 반환합니다.
 * - DST로 인한 23/25시간짜리 날에도 안전하게 "달력 기준" 차이를 계산하려고 사용합니다.
 */
export function zonedDayNumber(utcDate: Date, timeZone: string): number {
  const zoned = toZonedTime(utcDate, timeZone);
  const y = zoned.getFullYear();
  const m = zoned.getMonth();
  const d = zoned.getDate();
  return Math.floor(Date.UTC(y, m, d) / DAY_MS);
}

export function utcMonthStart(d: Date): Date {
  //d가 속한 달의 첫번째 날의 UTC 시간 반환(연도, 월, 일, 시, 분, 초, 밀리초)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function assertReasonableYear(d: Date): boolean {
  const y = d.getUTCFullYear();
  return y >= MIN_REASONABLE_YEAR && y <= MAX_REASONABLE_YEAR;
}
