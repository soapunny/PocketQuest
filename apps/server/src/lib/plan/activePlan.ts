// apps/server/src/lib/plan/activePlan.ts

import type { PrismaClient } from "@prisma/client";
import {
  CurrencyCode,
  LanguageCode,
  PeriodType,
  type Plan,
  type BudgetGoal,
  type SavingsGoal,
} from "@prisma/client";

import {
  addDays,
  addMonths,
  addWeeks,
  startOfMonth,
  startOfWeek,
} from "date-fns";

// date-fns-tz v3 uses `toZonedTime` / `fromZonedTime`
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import {
  DEFAULT_BIWEEKLY_ANCHOR_UTC,
  DEFAULT_TIME_ZONE,
  DEFAULT_WEEK_STARTS_ON,
} from "./defaults";

export type ActivePlanWithGoals = Plan & {
  budgetGoals: BudgetGoal[];
  savingsGoals: SavingsGoal[];
};

export type EnsureActivePlanOptions = {
  /**
   * Default currency used when the user has no active plan.
   * (Plan currency is the "source of truth" for how limits are interpreted/stored. Timezone is stored on User and used to compute period boundaries.)
   */
  defaultCurrency?: CurrencyCode;
  /** Default UI language when creating a plan */
  defaultLanguage?: LanguageCode;
  /** Default period type when creating a plan */
  defaultPeriodType?: PeriodType;
  /** Default total budget limit in minor units */
  defaultTotalBudgetLimitMinor?: number;
  /** Default anchor for BIWEEKLY periods (UTC). */
  defaultBiweeklyAnchorUTC?: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const BIWEEK_MS = 14 * DAY_MS;

function safeInt(n: unknown, fallback = 0): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.trunc(v);
}

function safeNonNegInt(n: unknown, fallback = 0): number {
  return Math.max(0, safeInt(n, fallback));
}

function clampCurrency(v: unknown, fallback: CurrencyCode): CurrencyCode {
  const s = String(v ?? "").toUpperCase();
  return (Object.values(CurrencyCode) as string[]).includes(s)
    ? (s as CurrencyCode)
    : fallback;
}

function clampLanguage(v: unknown, fallback: LanguageCode): LanguageCode {
  const s = String(v ?? "");
  return (Object.values(LanguageCode) as string[]).includes(s)
    ? (s as LanguageCode)
    : fallback;
}

function computePeriodBoundsUTC(args: {
  periodType: PeriodType;
  timeZone: string;
  nowUTC: Date;
  biweeklyAnchorUTC: Date;
}): { periodStartUTC: Date; periodEndUTC: Date; periodAnchorUTC: Date | null } {
  const { periodType, timeZone, nowUTC, biweeklyAnchorUTC } = args;

  if (periodType === PeriodType.MONTHLY) {
    const nowLocal = toZonedTime(nowUTC, timeZone);
    const startLocal = startOfMonth(nowLocal);
    const endLocal = addMonths(startLocal, 1);
    const startUTC = fromZonedTime(startLocal, timeZone);
    const endUTC = fromZonedTime(endLocal, timeZone);
    return {
      periodStartUTC: startUTC,
      periodEndUTC: endUTC,
      periodAnchorUTC: null,
    };
  }

  if (periodType === PeriodType.WEEKLY) {
    const nowLocal = toZonedTime(nowUTC, timeZone);
    // week starts day comes from defaults
    const startLocal = startOfWeek(nowLocal, {
      weekStartsOn: DEFAULT_WEEK_STARTS_ON,
    });
    const endLocal = addWeeks(startLocal, 1);
    const startUTC = fromZonedTime(startLocal, timeZone);
    const endUTC = fromZonedTime(endLocal, timeZone);
    return {
      periodStartUTC: startUTC,
      periodEndUTC: endUTC,
      periodAnchorUTC: null,
    };
  }

  // BIWEEKLY anchored in UTC (stable, no DST surprises).
  // Start = anchor + k * 14 days, where k = floor((now - anchor)/14d)
  const anchorMs = biweeklyAnchorUTC.getTime();
  const nowMs = nowUTC.getTime();
  const k = Math.floor((nowMs - anchorMs) / BIWEEK_MS);
  const startUTC = new Date(anchorMs + k * BIWEEK_MS);
  const endUTC = new Date(startUTC.getTime() + BIWEEK_MS);
  return {
    periodStartUTC: startUTC,
    periodEndUTC: endUTC,
    periodAnchorUTC: biweeklyAnchorUTC,
  };
}

/**
 * Returns the user's active plan if it exists. Does NOT create a plan.
 */
export async function getActivePlan(
  prisma: PrismaClient,
  userId: string,
): Promise<ActivePlanWithGoals | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activePlanId: true },
  });

  if (!user?.activePlanId) return null;

  const plan = await prisma.plan.findUnique({
    where: { id: user.activePlanId },
    include: { budgetGoals: true, savingsGoals: true },
  });

  return plan;
}

/**
 * Ensures the user has an active plan.
 * - If activePlanId exists and plan exists => returns it
 * - Else creates a new plan using the provided defaults and sets activePlanId
 */
export async function ensureActivePlan(
  prisma: PrismaClient,
  userId: string,
  options: EnsureActivePlanOptions = {},
): Promise<ActivePlanWithGoals> {
  const {
    defaultCurrency = CurrencyCode.USD,
    defaultLanguage = Object.values(LanguageCode).includes("en" as any)
      ? ("en" as LanguageCode)
      : (Object.values(LanguageCode)[0] as LanguageCode),
    defaultPeriodType = PeriodType.MONTHLY,
    defaultTotalBudgetLimitMinor = 0,
    defaultBiweeklyAnchorUTC = DEFAULT_BIWEEKLY_ANCHOR_UTC,
  } = options;

  // Fast path: active plan exists
  const existing = await getActivePlan(prisma, userId);
  if (existing) return existing;

  // Load user prefs for timezone (and possibly other future fields)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, timeZone: true },
  });

  const timeZone = user?.timeZone || DEFAULT_TIME_ZONE;

  const nowUTC = new Date();
  const bounds = computePeriodBoundsUTC({
    periodType: defaultPeriodType,
    timeZone,
    nowUTC,
    biweeklyAnchorUTC: defaultBiweeklyAnchorUTC,
  });

  // NOTE: Plan schema uses `periodStart`/`periodEnd` as timestamptz.
  // NOTE: We do NOT store timezone on Plan; timezone lives on User.
  // We'll store UTC instants.
  const created = await prisma.plan.create({
    data: {
      userId,
      periodType: defaultPeriodType,
      periodAnchor: bounds.periodAnchorUTC,
      periodStart: bounds.periodStartUTC,
      periodEnd: bounds.periodEndUTC,
      currency: clampCurrency(defaultCurrency, CurrencyCode.USD),
      language: clampLanguage(defaultLanguage, defaultLanguage),
      totalBudgetLimitMinor: safeNonNegInt(defaultTotalBudgetLimitMinor, 0),
    },
    include: { budgetGoals: true, savingsGoals: true },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { activePlanId: created.id },
  });

  return created;
}

/**
 * Helper for routes: set activePlanId to an existing plan (must belong to user).
 */
export async function setActivePlanId(
  prisma: PrismaClient,
  userId: string,
  planId: string,
) {
  const plan = await prisma.plan.findFirst({
    where: { id: planId, userId },
    select: { id: true },
  });
  if (!plan) {
    throw new Error("Plan not found for user");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { activePlanId: planId },
  });
}

/**
 * Create a new plan for the user using the same period rules (useful for currency switch).
 * This does NOT copy goals by default.
 * Note: timeZone is read from User and used to compute period boundaries but is not stored on Plan.
 */
export async function createNewPlanForUser(
  prisma: PrismaClient,
  args: {
    userId: string;
    timeZone: string;
    periodType: PeriodType;
    currency: CurrencyCode;
    language: LanguageCode;
    totalBudgetLimitMinor: number;
    biweeklyAnchorUTC?: Date;
    nowUTC?: Date;
  },
): Promise<ActivePlanWithGoals> {
  const {
    userId,
    timeZone,
    periodType,
    currency,
    language,
    totalBudgetLimitMinor,
    biweeklyAnchorUTC = DEFAULT_BIWEEKLY_ANCHOR_UTC,
    nowUTC = new Date(),
  } = args;

  const bounds = computePeriodBoundsUTC({
    periodType,
    timeZone,
    nowUTC,
    biweeklyAnchorUTC,
  });

  const created = await prisma.plan.create({
    data: {
      userId,
      periodType,
      periodAnchor: bounds.periodAnchorUTC,
      periodStart: bounds.periodStartUTC,
      periodEnd: bounds.periodEndUTC,
      currency: clampCurrency(currency, CurrencyCode.USD),
      language: clampLanguage(language, language),
      totalBudgetLimitMinor: safeNonNegInt(totalBudgetLimitMinor, 0),
    },
    include: { budgetGoals: true, savingsGoals: true },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { activePlanId: created.id },
  });

  return created;
}

/**
 * Computes the next period end for an existing plan. (Small helper)
 * Useful if you want to validate rollover logic.
 */
export function calcNextPeriodEndUTC(input: {
  periodType: PeriodType;
  timeZone: string;
  periodStartUTC: Date;
  periodAnchorUTC?: Date | null;
}): Date {
  const { periodType, timeZone, periodStartUTC, periodAnchorUTC } = input;

  if (periodType === PeriodType.MONTHLY) {
    const startLocal = toZonedTime(periodStartUTC, timeZone);
    const endLocal = addMonths(startLocal, 1);
    return fromZonedTime(endLocal, timeZone);
  }
  if (periodType === PeriodType.WEEKLY) {
    const startLocal = toZonedTime(periodStartUTC, timeZone);
    const endLocal = addWeeks(startLocal, 1);
    return fromZonedTime(endLocal, timeZone);
  }

  // BIWEEKLY: start should usually already be aligned, but we defensively align it.
  const anchor = periodAnchorUTC ?? DEFAULT_BIWEEKLY_ANCHOR_UTC;
  // if start is before anchor, step forward until >= anchor
  const startMs = periodStartUTC.getTime();
  const anchorMs = anchor.getTime();
  const k = Math.floor((startMs - anchorMs) / BIWEEK_MS);
  const alignedStart = new Date(anchorMs + k * BIWEEK_MS);

  // If caller passed an unaligned start, use the aligned boundary to compute the next end.
  const baseStart =
    alignedStart.getTime() === startMs ? periodStartUTC : alignedStart;

  return addDays(baseStart, 14);
}
