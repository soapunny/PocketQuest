// apps/server/src/lib/plan/defaults.ts

// 기본 language / locale
export const DEFAULT_LANGUAGE = "en";
export const DEFAULT_LOCALE = "en-US";

// 기본 타임존 설정(America/New_York)
export const DEFAULT_TIME_ZONE = "America/New_York" as const;

// 기본 주 시작일: 1(월요일) (0=일 ~ 6=토)
export const DEFAULT_WEEK_STARTS_ON: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 1;

// 기본 Biweekly anchor: “제품의 기준 주”
// ⚠️ 이 값 자체가 중요한게 아니라 “한 번 정해지면 고정”이 중요함
export const DEFAULT_BIWEEKLY_ANCHOR_UTC = new Date(
  Date.UTC(2025, 0, 6, 0, 0, 0, 0),
);
// 2025-01-06 = 월요일 (UTC 기준) : 깔끔한 기준점

export const DEFAULT_BIWEEKLY_ANCHOR_ISO = "2025-01-06";
export const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_REASONABLE_YEAR = 1970;
export const MAX_REASONABLE_YEAR = 2100;
