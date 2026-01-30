// apps/mobile/src/app/domain/plan/progress/progress.ts

import type { Currency } from "../../../../../../../packages/shared/src/money/types";
import type { Plan } from "../../../store/planStore";
import { absMinor } from "../../money";
import { isSavingsTx } from "../../transactions/classify";
import { isISOInRange, getPlanPeriodRange } from "../period";
import { getTxISODate, txToHomeMinor } from "../progress";

/**
 * Computes overall plan progress (0-100) from transactions that fall within the current plan period.
 * - Period boundaries are server-driven via getPlanPeriodRange(plan as any).
 * - Currency conversion uses domain/money/currency.
 */
export function computePlanProgressPercent(plan: Plan, transactions: any[]) {
  const range = getPlanPeriodRange(plan as any);
  const { startISO, endISO } = range;

  const homeCurrency: Currency = ((plan as any).homeCurrency ??
    "USD") as Currency;

  const budgetGoals = (plan as any).budgetGoals ?? [];
  const savingsGoals = (plan as any).savingsGoals ?? [];

  const spentByCategory = new Map<string, number>();
  let totalSpentHomeMinor = 0;
  let totalSavedHomeMinor = 0;

  for (const tx of transactions) {
    const dateISO = getTxISODate(tx);
    if (!dateISO) continue;
    if (!isISOInRange(dateISO, startISO, endISO)) continue;

    if (tx?.type === "EXPENSE") {
      const spent = txToHomeMinor(tx, homeCurrency);
      totalSpentHomeMinor += spent;
      const key = String(tx?.category ?? "Other");
      spentByCategory.set(key, (spentByCategory.get(key) || 0) + spent);
    } else if (isSavingsTx(tx)) {
      totalSavedHomeMinor += txToHomeMinor(tx, homeCurrency);
    }
  }

  let budgetGoalsCount = 0;
  let budgetSum = 0;

  for (const g of budgetGoals) {
    if ((g as any).limitMinor <= 0) continue;
    budgetGoalsCount += 1;
    const spent = spentByCategory.get((g as any).category) || 0;
    const ratio = spent / (g as any).limitMinor;
    budgetSum += ratio > 1 ? 0 : Math.max(0, 1 - ratio);
  }

  const totalLimit = absMinor((plan as any).totalBudgetLimitMinor);
  if (totalLimit > 0) {
    budgetGoalsCount += 1;
    const ratio = totalSpentHomeMinor / totalLimit;
    budgetSum += ratio > 1 ? 0 : Math.max(0, 1 - ratio);
  }

  // If no budget targets, return a neutral score.
  const budgetScore =
    budgetGoalsCount === 0 ? 0.5 : budgetSum / budgetGoalsCount;

  // Savings: totalSavedHomeMinor is in home currency minor units.
  // NOTE: targetMinor is assumed to be in home currency minor units as well.
  // TODO: if savings goals gain their own currency later, convert targets here.
  let savingsScore = 0.5;
  if (savingsGoals.length > 0) {
    let sum = 0;
    let count = 0;
    for (const g of savingsGoals) {
      if ((g as any).targetMinor <= 0) continue;
      count += 1;
      sum += Math.min(
        1,
        Math.max(0, totalSavedHomeMinor / (g as any).targetMinor),
      );
    }
    savingsScore = count === 0 ? 0.5 : sum / count;
  }

  const combined = budgetScore * 0.7 + savingsScore * 0.3;
  return Math.round(Math.min(1, Math.max(0, combined)) * 100);
}

/**
 * Computes overall plan progress (0-100) from ALL transactions (all time).
 */
export function computeAllTimePlanProgressPercent(
  plan: Plan,
  transactions: any[],
) {
  const homeCurrency: Currency = ((plan as any).homeCurrency ??
    "USD") as Currency;

  const budgetGoals = (plan as any).budgetGoals ?? [];
  const savingsGoals = (plan as any).savingsGoals ?? [];

  const spentByCategory = new Map<string, number>();
  let totalSpentHomeMinor = 0;
  let totalSavedHomeMinor = 0;

  for (const tx of transactions) {
    if (tx?.type === "EXPENSE") {
      const spent = txToHomeMinor(tx, homeCurrency);
      totalSpentHomeMinor += spent;
      const key = String(tx?.category ?? "Other");
      spentByCategory.set(key, (spentByCategory.get(key) || 0) + spent);
    } else if (isSavingsTx(tx)) {
      totalSavedHomeMinor += txToHomeMinor(tx, homeCurrency);
    }
  }

  let budgetGoalsCount = 0;
  let budgetSum = 0;

  for (const g of budgetGoals) {
    if ((g as any).limitMinor <= 0) continue;
    budgetGoalsCount += 1;
    const spent = spentByCategory.get((g as any).category) || 0;
    const ratio = spent / Math.max(1, (g as any).limitMinor);
    budgetSum += ratio > 1 ? 0 : Math.max(0, 1 - ratio);
  }

  const totalLimit = absMinor((plan as any).totalBudgetLimitMinor);
  if (totalLimit > 0) {
    budgetGoalsCount += 1;
    const ratio = totalSpentHomeMinor / Math.max(1, totalLimit);
    budgetSum += ratio > 1 ? 0 : Math.max(0, 1 - ratio);
  }

  const budgetScore =
    budgetGoalsCount === 0 ? 0.5 : budgetSum / budgetGoalsCount;

  // NOTE: targetMinor is assumed to be in home currency minor units.
  // TODO: if savings goals gain their own currency later, convert targets here.
  let savingsScore = 0.5;
  if (savingsGoals.length > 0) {
    let sum = 0;
    let count = 0;
    for (const g of savingsGoals) {
      if ((g as any).targetMinor <= 0) continue;
      count += 1;
      const ratio = totalSavedHomeMinor / Math.max(1, (g as any).targetMinor);
      sum += Math.min(1, Math.max(0, ratio));
    }
    savingsScore = count === 0 ? 0.5 : sum / count;
  }

  const combined = budgetScore * 0.7 + savingsScore * 0.3;
  return Math.round(Math.min(1, Math.max(0, combined)) * 100);
}
