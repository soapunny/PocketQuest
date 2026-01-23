// apps/server/src/lib/plan/goalsPolicy.ts
// Centralized goals policy helpers for PocketQuest.

import { CurrencyCode } from "@prisma/client";

/**
 * GoalsMode controls what happens to plan-level numbers (totalBudgetLimitMinor)
 * and plan-owned goals (BudgetGoal/SavingsGoal) when creating/switching plans.
 *
 * - COPY_AS_IS: copy numbers without currency conversion (treat as same minor unit)
 * - CONVERT_USING_FX: convert numbers between USD/KRW using fxUsdKrw
 * - RESET_EMPTY: do not copy any goals; caller should create an empty plan
 */
export type GoalsMode = "COPY_AS_IS" | "CONVERT_USING_FX" | "RESET_EMPTY";
export type ActivePlanWithGoals = {
  id: string;
  userId: string;
  currency: CurrencyCode;
  totalBudgetLimitMinor: number | null;
  budgetGoals: Array<{ category: string; limitMinor: number }>;
  savingsGoals: Array<{ name: string; targetMinor: number }>;
};

/**
 * Convert a value expressed in one currency's minor units into another currency's minor units.
 *
 * Currently supports USD <-> KRW using `fxUsdKrw`, where:
 *   1 USD (major) = fxUsdKrw KRW (major)
 *
 * Minor-unit assumptions:
 * - USD minor unit: cents (100 per 1 USD)
 * - KRW minor unit: won (1 per 1 KRW)
 *
 * For unsupported pairs, returns the original value as a safe fallback.
 */
export function convertPlanMinor(
  valuePlanMinor: number,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  fxUsdKrw?: number | null,
): number {
  // Treat non-finite inputs as 0 to avoid poisoning downstream calculations.
  if (!Number.isFinite(valuePlanMinor)) return 0;
  if (valuePlanMinor === 0) return 0;
  if (fromCurrency === toCurrency) return Math.trunc(valuePlanMinor);

  const fx = typeof fxUsdKrw === "number" ? fxUsdKrw : NaN;
  const fxOk = Number.isFinite(fx) && fx > 0;

  // Only supported pair for now: USD <-> KRW, where fxUsdKrw means
  // 1 USD (major) = fx KRW (major). We convert between *minor units*:
  // - USD minor: cents (100 per USD)
  // - KRW minor: won (1 per KRW)
  if (fromCurrency === CurrencyCode.USD && toCurrency === CurrencyCode.KRW) {
    // cents -> won: (cents / 100) * fx
    return fxOk
      ? Math.round((valuePlanMinor / 100) * fx)
      : Math.trunc(valuePlanMinor);
  }

  if (fromCurrency === CurrencyCode.KRW && toCurrency === CurrencyCode.USD) {
    // won -> cents: (won / fx) * 100
    return fxOk
      ? Math.round((valuePlanMinor / fx) * 100)
      : Math.trunc(valuePlanMinor);
  }

  // Fallback: no conversion for unsupported pairs.
  return Math.trunc(valuePlanMinor);
}

/**
 * Apply a goals policy when moving from one plan currency to another.
 *
 * IMPORTANT: This function does not write to DB. It only produces a target payload.
 */
export function convertPlanMinorPayload(opts: {
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  fxUsdKrw: number | null;
  goalsMode: GoalsMode;
  activePlan: ActivePlanWithGoals;
}): {
  totalBudgetLimitMinor: number;
  budgetGoals: Array<{ category: string; limitMinor: number }>;
  savingsGoals: Array<{ name: string; targetMinor: number }>;
} {
  const { fromCurrency, toCurrency, fxUsdKrw, goalsMode, activePlan } = opts;

  // RESET_EMPTY means: caller should not copy anything.
  if (goalsMode === "RESET_EMPTY") {
    return { totalBudgetLimitMinor: 0, budgetGoals: [], savingsGoals: [] };
  }

  const shouldConvert = goalsMode === "CONVERT_USING_FX";

  const convert = (n: number) => {
    const v = Number.isFinite(n) ? Math.trunc(n) : 0;
    return shouldConvert
      ? convertPlanMinor(v, fromCurrency, toCurrency, fxUsdKrw)
      : v;
  };

  const totalBudgetLimitMinor = convert(
    Number(activePlan.totalBudgetLimitMinor ?? 0),
  );

  const budgetGoals = (activePlan.budgetGoals ?? []).map((g) => ({
    category: g.category,
    limitMinor: convert(Number(g.limitMinor ?? 0)),
  }));

  const savingsGoals = (activePlan.savingsGoals ?? []).map((s) => ({
    name: s.name,
    targetMinor: convert(Number(s.targetMinor ?? 0)),
  }));

  return { totalBudgetLimitMinor, budgetGoals, savingsGoals };
}

// Back-compat alias for earlier imports in routes.
// Prefer `convertPlanMinorPayload` for policy-based conversion.
export const convertPlanMinorPolicy = convertPlanMinorPayload;
