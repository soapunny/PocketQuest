// apps/server/src/lib/plan/planCreateFactory.ts

import { prisma } from "@/lib/prisma";
import { PeriodType, CurrencyCode, LanguageCode } from "@prisma/client";
import { computePeriodWindow } from "./periodFactory";
import { PlanCreateData } from "./planTypes";

/**
 * Single entrance for building Plan.create data.
 *
 * Prefer this in routes/services to keep validation and normalization consistent.
 */
export function buildPlanCreateData(params: {
  userId: string;
  periodType: PeriodType;
  timeZone: string;
  currency: CurrencyCode;
  language: LanguageCode;
  totalBudgetLimitMinor: number;
  now?: Date;
  periodAnchorUTC?: Date | null;
}): PlanCreateData {
  return buildNewPlanCreateData(params);
}

/**
 * Build Plan.create data using canonical period rules.
 *
 * Use this for:
 * - initial plan creation
 * - currency switch (new plan)
 * - any place you want a fresh plan record
 */
function buildNewPlanCreateData(params: {
  userId: string;
  periodType: PeriodType;
  timeZone: string;
  currency: CurrencyCode;
  language: LanguageCode;
  totalBudgetLimitMinor: number;
  now?: Date;
  periodAnchorUTC?: Date | null;
}): PlanCreateData {
  const window = computePeriodWindow({
    periodType: params.periodType,
    timeZone: params.timeZone,
    now: params.now,
    periodAnchorUTC: requireBiweeklyAnchor({
      periodType: params.periodType,
      periodAnchorUTC: params.periodAnchorUTC,
    }),
  });

  return {
    userId: params.userId,
    periodType: window.periodType,
    periodStart: window.periodStartUTC,
    periodEnd: window.periodEndUTC,
    periodAnchor: window.periodAnchorUTC,
    // Policy A: snapshot timezone on the plan
    timeZone: params.timeZone,
    currency: params.currency,
    language: params.language,
    totalBudgetLimitMinor: toNonNegInt(params.totalBudgetLimitMinor),
  };
}

function toNonNegInt(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.trunc(v));
}

function requireBiweeklyAnchor(params: {
  periodType: PeriodType;
  periodAnchorUTC?: Date | null;
}): Date | null {
  if (params.periodType !== PeriodType.BIWEEKLY) {
    return params.periodAnchorUTC ?? null;
  }

  // BIWEEKLY must always be aligned to a stable anchor.
  if (!params.periodAnchorUTC) {
    throw new Error("BIWEEKLY requires periodAnchorUTC");
  }

  return params.periodAnchorUTC;
}

/**
 * Utility for currency switch: keep the SAME period rules, but change currency.
 * This creates a *new* plan window for "now" (not a naive copy).
 */
function buildCurrencySwitchPlanCreateData(params: {
  userId: string;
  current: {
    periodType: PeriodType;
    periodAnchorUTC: Date | null;
    currency: CurrencyCode;
    language: LanguageCode;
    totalBudgetLimitMinor: number;
  };
  timeZone: string;
  nextCurrency: CurrencyCode;
  now?: Date;
}): PlanCreateData {
  return buildNewPlanCreateData({
    userId: params.userId,
    periodType: params.current.periodType,
    timeZone: params.timeZone,
    currency: params.nextCurrency,
    language: params.current.language,
    totalBudgetLimitMinor: params.current.totalBudgetLimitMinor,
    now: params.now,
    periodAnchorUTC: params.current.periodAnchorUTC,
  });
}

export async function ensureDefaultActivePlan(
  userId: string,
  timeZone: string,
  now?: Date,
) {
  // Default behavior for MVP: if the user has no plans yet, create a current MONTHLY plan
  // (can be changed later to WEEKLY/BIWEEKLY based on onboarding).
  const include = { budgetGoals: true, savingsGoals: true } as const;

  const baseNow = now ?? new Date();
  const periodType: PeriodType = PeriodType.MONTHLY;

  // Pull user defaults so the created plan is fully valid and consistent.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      currency: true,
      language: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const createData = buildPlanCreateData({
    userId,
    periodType,
    timeZone,
    currency: user.currency,
    language: user.language,
    totalBudgetLimitMinor: 0,
    now: baseNow,
    periodAnchorUTC: null,
  });

  const plan = await prisma.plan.upsert({
    where: {
      userId_periodType_periodStart: {
        userId,
        periodType: createData.periodType,
        periodStart: createData.periodStart,
      },
    },
    create: {
      ...createData,
    },
    update: {
      // Repair derived fields if rules or timezone handling changed
      periodEnd: createData.periodEnd,
      periodAnchor: createData.periodAnchor,
      timeZone: createData.timeZone,
      currency: createData.currency,
      language: createData.language,
    },
    include,
  });

  await prisma.user.update({
    where: { id: userId },
    data: { activePlanId: plan.id },
  });

  console.log("[plans] auto-created default plan", {
    userId,
    timeZone,
    periodType: createData.periodType,
    periodStartUTC: createData.periodStart.toISOString(),
    periodEndUTC: createData.periodEnd.toISOString(),
    planId: plan.id,
  });

  return plan;
}
