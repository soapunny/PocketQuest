// apps/mobile/src/app/store/dashboardStore.ts

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchBootstrap } from "../api/bootstrapApi";
const SERVER_TOKEN_KEY = "pq_server_jwt";

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
    goalId: string | null;
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
  isRefreshing: boolean;
  applyDashboardFromBootstrap: (bootstrap: any) => void;
  refreshDashboard: (token?: string) => Promise<void>;
  resetDashboard: () => void;
};

export const useDashboardStore = create<DashboardState>((set) => ({
  dashboard: null,
  isHydrated: false,
  isRefreshing: false,

  applyDashboardFromBootstrap: (bootstrap) => {
    // Runtime bootstrap response shape includes `dashboard`.
    // Keep fallbacks for older shapes.
    const d =
      (bootstrap as any)?.dashboard ??
      (bootstrap as any)?.txSummary ??
      (bootstrap as any)?.txSummary?.dashboard ??
      null;

    set({
      dashboard: d,
      isHydrated: !!d,
    });
  },

  refreshDashboard: async (token) => {
    try {
      set({ isRefreshing: true });

      const fromArg = String(token ?? "").trim();
      const fromStorage = String(
        (await AsyncStorage.getItem(SERVER_TOKEN_KEY).catch(() => null)) ?? ""
      ).trim();

      const resolvedToken = fromArg || fromStorage;

      if (!resolvedToken) {
        console.warn("[dashboardStore] refreshDashboard: missing token");
        return;
      }

      const bootstrap = await fetchBootstrap(resolvedToken);
      const d =
        (bootstrap as any)?.dashboard ??
        (bootstrap as any)?.txSummary ??
        (bootstrap as any)?.txSummary?.dashboard ??
        null;

      set({
        dashboard: d,
        isHydrated: !!d,
      });
    } catch (e) {
      console.warn("[dashboardStore] refreshDashboard failed", e);
    } finally {
      set({ isRefreshing: false });
    }
  },

  resetDashboard: () =>
    set({ dashboard: null, isHydrated: false, isRefreshing: false }),
}));
