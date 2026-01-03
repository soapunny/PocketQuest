import type { Plan, PeriodType } from "./planStore";
import type { Currency } from "./currency";
import { convertMinor } from "./currency";

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseISODateLocal(isoDate: string) {
  const [y, m, d] = String(isoDate || "")
    .split("-")
    .map((x) => Number(x));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function startOfLocalDayMs(isoDate: string) {
  const d = parseISODateLocal(isoDate);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isSavingsTx(tx: any) {
  const cat = String(tx.category || "").toLowerCase();
  if (tx.type === "EXPENSE") return false;
  if (cat.includes("savings") || cat.includes("save")) return true;
  return tx.type === "SAVING" || tx.type === "SAVINGS";
}

function absMinor(n: any) {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.abs(v);
}

function txToHomeMinor(tx: any, homeCurrency: Currency): number {
  const currency: Currency = tx?.currency === "KRW" ? "KRW" : "USD";

  // Prefer new field; fallback to legacy amountMinor
  const amountMinor =
    typeof tx?.amountMinor === "number"
      ? tx.amountMinor
      : typeof tx?.amountMinor === "number"
      ? tx.amountMinor
      : 0;

  const absAmount = absMinor(amountMinor);
  if (currency === homeCurrency) return absAmount;

  const fx = typeof tx?.fxUsdKrw === "number" ? tx.fxUsdKrw : NaN;
  // If FX missing/invalid, ignore tx in totals (avoid lying)
  if (!Number.isFinite(fx) || fx <= 0) return 0;

  return absMinor(convertMinor(absAmount, currency, homeCurrency, fx));
}

function addDaysISO(startISODate: string, days: number) {
  const d = parseISODateLocal(startISODate);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return toISODate(d);
}

function startOfNextMonthISO(startISODate: string) {
  const d = parseISODateLocal(startISODate);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() + 1);
  return toISODate(d);
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
    toISODate(new Date())) as string;

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

  // startISO/endISO are date-only (YYYY-MM-DD) boundaries in LOCAL time.
  const startMs = startOfLocalDayMs(startISO);
  const endMs = startOfLocalDayMs(endISO);

  return t >= startMs && t < endMs;
}

/**
 * Computes overall plan progress (0-100) from transactions that fall within the current plan period.
 * Budget score: under-budget is better.
 * Savings score: higher saved vs target is better.
 */
export function computePlanProgressPercent(plan: Plan, transactions: any[]) {
  const { startISO, endISO } = getPlanPeriodRange(plan);

  const homeCurrency: Currency = ((plan as any).homeCurrency ??
    "USD") as Currency;

  const budgetGoals = (plan as any).budgetGoals ?? [];
  const savingsGoals = (plan as any).savingsGoals ?? [];

  const spentByCategory = new Map<string, number>();
  let totalSpentHomeMinor = 0;
  let totalSavedHomeMinor = 0;

  for (const tx of transactions) {
    const iso = String(
      tx.dateISO ?? tx.occurredAtISO ?? tx.createdAtISO ?? tx.createdAt ?? ""
    );
    if (!iso) continue;
    if (!isISOInRange(iso, startISO, endISO)) continue;

    if (tx.type === "EXPENSE") {
      const spent = txToHomeMinor(tx, homeCurrency);
      totalSpentHomeMinor += spent;
      const key = String(tx.category ?? "Other");
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

  const budgetScore = budgetGoalsCount === 0 ? 0 : budgetSum / budgetGoalsCount;

  let savingsScore = 0;
  if (savingsGoals.length > 0) {
    let sum = 0;
    let count = 0;
    for (const g of savingsGoals) {
      if ((g as any).targetMinor <= 0) continue;
      count += 1;
      sum += Math.min(
        1,
        Math.max(0, totalSavedHomeMinor / (g as any).targetMinor)
      );
    }
    savingsScore = count === 0 ? 0 : sum / count;
  }

  const combined = budgetScore * 0.7 + savingsScore * 0.3;
  return Math.round(Math.min(1, Math.max(0, combined)) * 100);
}

/**
 * Computes overall plan progress (0-100) from ALL transactions (all time).
 * This computes a simple aggregate: total savings vs targets, and treats budget
 * goals as "try to stay under limit on average" across all periods.
 * For a more accurate all-time progress, you'd need to compute per-period progress
 * and average those, but this provides a reasonable approximation.
 */
export function computeAllTimePlanProgressPercent(
  plan: Plan,
  transactions: any[]
) {
  const homeCurrency: Currency = ((plan as any).homeCurrency ??
    "USD") as Currency;

  const budgetGoals = (plan as any).budgetGoals ?? [];
  const savingsGoals = (plan as any).savingsGoals ?? [];

  const spentByCategory = new Map<string, number>();
  let totalSpentHomeMinor = 0;
  let totalSavedHomeMinor = 0;

  // Process ALL transactions (no date filtering)
  for (const tx of transactions) {
    if (tx.type === "EXPENSE") {
      const spent = txToHomeMinor(tx, homeCurrency);
      // Use absolute value for expenses (they're already negative in transactions)
      totalSpentHomeMinor += Math.abs(spent);
      const key = String(tx.category ?? "Other");
      spentByCategory.set(
        key,
        (spentByCategory.get(key) || 0) + Math.abs(spent)
      );
    } else if (isSavingsTx(tx)) {
      totalSavedHomeMinor += Math.abs(txToHomeMinor(tx, homeCurrency));
    }
  }

  // For all-time budget score, we compute how well we stayed within limits on average
  // This is simplified - we compare total spent vs total budget limits
  // In reality, budget limits are per-period, so this is an approximation
  let budgetGoalsCount = 0;
  let budgetSum = 0;

  for (const g of budgetGoals) {
    if ((g as any).limitMinor <= 0) continue;
    budgetGoalsCount += 1;
    const spent = spentByCategory.get((g as any).category) || 0;
    // Simple ratio: if we spent less than the limit, we did well
    // This is a rough approximation since limits are per-period
    const ratio = spent / Math.max(1, (g as any).limitMinor);
    budgetSum += ratio > 1 ? 0 : Math.max(0, 1 - ratio);
  }

  const totalLimit = absMinor((plan as any).totalBudgetlimitMinor);
  if (totalLimit > 0) {
    budgetGoalsCount += 1;
    const ratio = totalSpentHomeMinor / Math.max(1, totalLimit);
    budgetSum += ratio > 1 ? 0 : Math.max(0, 1 - ratio);
  }

  const budgetScore =
    budgetGoalsCount === 0 ? 0.5 : budgetSum / budgetGoalsCount;

  // For savings, we can compare total saved vs targets directly
  let savingsScore = 0;
  if (savingsGoals.length > 0) {
    let sum = 0;
    let count = 0;
    for (const g of savingsGoals) {
      if ((g as any).targetMinor <= 0) continue;
      count += 1;
      // Compare total saved vs target (can exceed 1.0 = 100%)
      const ratio = totalSavedHomeMinor / Math.max(1, (g as any).targetMinor);
      sum += Math.min(1, Math.max(0, ratio));
    }
    savingsScore = count === 0 ? 0.5 : sum / count;
  } else {
    // If no savings goals, give a neutral score
    savingsScore = 0.5;
  }

  const combined = budgetScore * 0.7 + savingsScore * 0.3;
  return Math.round(Math.min(1, Math.max(0, combined)) * 100);
}
