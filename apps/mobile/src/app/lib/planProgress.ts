import type { Plan, PeriodType } from "./planStore";

function isSavingsTx(tx: any) {
  const cat = String(tx.category || "").toLowerCase();
  if (tx.type === "EXPENSE") return false;
  if (cat.includes("savings") || cat.includes("save")) return true;
  return tx.type === "SAVING" || tx.type === "SAVINGS";
}

function addDaysISO(startISO: string, days: number) {
  const d = new Date(startISO);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function startOfNextMonthISO(startISO: string) {
  const d = new Date(startISO);
  // Normalize to UTC midnight on the 1st
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  // Jump to next month
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
}

/**
 * Returns an inclusive start and exclusive end range for the current plan period.
 * - WEEKLY: 7 days
 * - BIWEEKLY: 14 days
 * - MONTHLY: calendar month
 */
export function getPlanPeriodRange(plan: Plan): {
  startISO: string;
  endISO: string;
  type: PeriodType;
} {
  const type = (plan.periodType ?? "WEEKLY") as PeriodType;

  // Back-compat fallback: older code may still rely on weekStartISO.
  const startISO = (plan.periodStartISO ??
    (plan as any).weekStartISO ??
    new Date().toISOString()) as string;

  if (type === "MONTHLY") {
    return { type, startISO, endISO: startOfNextMonthISO(startISO) };
  }

  if (type === "BIWEEKLY") {
    return { type, startISO, endISO: addDaysISO(startISO, 14) };
  }

  // WEEKLY
  return { type, startISO, endISO: addDaysISO(startISO, 7) };
}

export function isISOInRange(iso: string, startISO: string, endISO: string) {
  const t = new Date(iso).getTime();
  return t >= new Date(startISO).getTime() && t < new Date(endISO).getTime();
}

/**
 * Computes overall plan progress (0-100) from transactions that fall within the current plan period.
 * Budget score: under-budget is better.
 * Savings score: higher saved vs target is better.
 */
export function computePlanProgressPercent(plan: Plan, transactions: any[]) {
  const { startISO, endISO } = getPlanPeriodRange(plan);

  const spentByCategory = new Map<string, number>();
  let totalSpentCents = 0;
  let totalSavedCents = 0;

  for (const tx of transactions) {
    const iso = String(
      tx.dateISO ?? tx.occurredAtISO ?? tx.createdAtISO ?? tx.createdAt ?? ""
    );
    if (!iso) continue;
    if (!isISOInRange(iso, startISO, endISO)) continue;

    if (tx.type === "EXPENSE") {
      totalSpentCents += tx.amountCents;
      spentByCategory.set(
        tx.category,
        (spentByCategory.get(tx.category) || 0) + tx.amountCents
      );
    } else if (isSavingsTx(tx)) {
      totalSavedCents += tx.amountCents;
    }
  }

  let budgetGoalsCount = 0;
  let budgetSum = 0;

  for (const g of plan.budgetGoals) {
    if ((g as any).limitCents <= 0) continue;
    budgetGoalsCount += 1;
    const spent = spentByCategory.get((g as any).category) || 0;
    const ratio = spent / (g as any).limitCents;
    budgetSum += ratio > 1 ? 0 : Math.max(0, 1 - ratio);
  }

  // Total budget goal is optional (in your current UI it’s derived/auto), keep as a fallback.
  if ((plan as any).totalBudgetLimitCents > 0) {
    budgetGoalsCount += 1;
    const ratio = totalSpentCents / (plan as any).totalBudgetLimitCents;
    budgetSum += ratio > 1 ? 0 : Math.max(0, 1 - ratio);
  }

  const budgetScore = budgetGoalsCount === 0 ? 0 : budgetSum / budgetGoalsCount;

  let savingsScore = 0;
  if (plan.savingsGoals.length > 0) {
    let sum = 0;
    let count = 0;
    for (const g of plan.savingsGoals) {
      if ((g as any).targetCents <= 0) continue;
      count += 1;
      sum += Math.min(1, Math.max(0, totalSavedCents / (g as any).targetCents));
    }
    savingsScore = count === 0 ? 0 : sum / count;
  }

  const combined = budgetScore * 0.7 + savingsScore * 0.3;
  return Math.round(Math.min(1, Math.max(0, combined)) * 100);
}
