import { create } from "zustand";

export type DashboardPayload = {
  range: {
    periodStartUTC: string;
    periodEndUTC: string;
    periodStartLocal: string;
    periodEndLocal: string;
  };
  totals: {
    incomeMinor: number;
    spentMinor: number;
    savingMinor: number;
    netMinor: number;
  };
  spentByCategory: Array<{
    categoryKey: string;
    spentMinor: number;
  }>;
  budgetStatusRows: Array<{
    categoryKey: string;
    limitMinor: number;
    spentMinor: number;
    remainingMinor: number;
  }>;
  savingsProgressRows: Array<{
    goalId: string;
    name: string;
    targetMinor: number;
    savedMinor: number;
    progressRatio: number;
  }>;
  recentTransactions: Array<{
    id: string;
    type: string;
    amountMinor: number;
    categoryKey: string;
    occurredAtUTC: string;
    occurredAtLocal: string;
    note: string | null;
  }>;
  meta?: {
    warnings?: string[];
  };
};

type DashboardState = {
  dashboard: DashboardPayload | null;
  isHydrated: boolean;
  applyDashboardFromBootstrap: (bootstrap: any) => void;
  resetDashboard: () => void;
};

export const useDashboardStore = create<DashboardState>((set) => ({
  dashboard: null,
  isHydrated: false,
  applyDashboardFromBootstrap: (bootstrap) => {
    const d = bootstrap?.dashboard ?? null;
    set({
      dashboard: d,
      isHydrated: !!d,
    });
  },
  resetDashboard: () =>
    set({
      dashboard: null,
      isHydrated: false,
    }),
}));

