import type { Currency } from "../../../../../../../packages/shared/src/money/types";
import { txToHomeMinor } from "../progress";

// EXPENSE 합계: category별
export function computeSpentByCategory(
  periodTransactions: any[],
  baseCurrency: Currency,
): Map<string, number> {
  const map = new Map<string, number>();

  for (const tx of periodTransactions) {
    if (!tx || tx.type !== "EXPENSE") continue;
    const key = String((tx as any).category ?? "Other");
    map.set(key, (map.get(key) || 0) + txToHomeMinor(tx, baseCurrency));
  }

  return map;
}

// EXPENSE 합계: 전체
export function computeTotalSpentMinor(
  periodTransactions: any[],
  baseCurrency: Currency,
): number {
  let sum = 0;
  for (const tx of periodTransactions) {
    if (!tx || tx.type !== "EXPENSE") continue;
    sum += txToHomeMinor(tx, baseCurrency);
  }
  return sum;
}

// SAVING 합계: goalName별(현재 saving의 goal은 category에 저장되어 있음)
export function computeSavedByGoal(
  periodTransactions: any[],
  baseCurrency: Currency,
): Map<string, number> {
  const map = new Map<string, number>();

  for (const tx of periodTransactions) {
    if (!tx || tx.type !== "SAVING") continue;
    const goalName = String((tx as any).category ?? "Other");
    map.set(
      goalName,
      (map.get(goalName) || 0) + txToHomeMinor(tx, baseCurrency),
    );
  }

  return map;
}
