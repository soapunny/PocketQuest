// packages/shared/src/bootstrap/dashboard.ts

export type DashboardCashflowOperationalDTO = {
  incomeMinor: number;
  expenseMinor: number; // (spent)
  netMinor: number; // income - expense
};

export type DashboardCashflowSpendableDTO = {
  incomeMinor: number;
  expenseMinor: number; // (spent)
  savingMinor: number; // saving
  netMinor: number; // income - expense - saving
};

export type DashboardCashflowDTO = {
  operational: DashboardCashflowOperationalDTO;
  spendable: DashboardCashflowSpendableDTO;
  // Future: rolling?: { ... }
};

export type DashboardSpentByCategoryRowDTO = {
  categoryKey: string;
  spentMinor: number;
};

export type DashboardBudgetStatusRowDTO = {
  categoryKey: string;
  limitMinor: number;
  spentMinor: number;
  remainingMinor: number;
};

export type DashboardSavingsProgressRowDTO = {
  goalId: string;
  name: string;
  // Keep for Savings section (ok to include even if Cashflow details won't display it)
  targetMinor: number;
  progressRatio: number;
  // Used by both Savings section + Cashflow details (amount-only view)
  savedMinor: number;
};

export type DashboardRangeDTO = {
  periodStartUTC: string;
  periodEndUTC: string;
  periodStartLocal: string;
  periodEndLocal: string;
};

export type DashboardTotalsDTO = {
  incomeMinor: number;
  spentMinor: number;
  savingMinor: number;
  netMinor: number; // income - spent (operational net)
};

export type DashboardRecentTransactionDTO = {
  id: string;
  type: "INCOME" | "EXPENSE" | "SAVING";
  amountMinor: number;
  categoryKey: string;
  savingsGoalId: string | null;
  occurredAtUTC: string;
  occurredAtLocal: string;
  note: string | null;
};

export type DashboardPayloadDTO = {
  range: DashboardRangeDTO;
  totals: DashboardTotalsDTO;
  cashflow: DashboardCashflowDTO;
  spentByCategory: DashboardSpentByCategoryRowDTO[];
  budgetStatusRows: DashboardBudgetStatusRowDTO[];
  savingsProgressRows: DashboardSavingsProgressRowDTO[];
  recentTransactions: DashboardRecentTransactionDTO[];
  meta: {
    warnings: string[];
  };
};

