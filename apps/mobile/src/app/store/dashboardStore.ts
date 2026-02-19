// apps/mobile/src/app/store/dashboardStore.ts

import { create } from "zustand";
import type { DashboardPayloadDTO } from "@pq/shared/bootstrap";
import { fetchBootstrap } from "../api/bootstrapApi";

interface DashboardState {
  dashboard: DashboardPayloadDTO | null;
  isHydrated: boolean;
  isRefreshing: boolean;

  applyDashboardFromBootstrap: (bootstrap: {
    dashboard: DashboardPayloadDTO | null;
  }) => void;
  refreshDashboard: (supabaseAccessToken: string) => Promise<void>;
  resetDashboard: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  dashboard: null,
  isHydrated: false,
  isRefreshing: false,

  applyDashboardFromBootstrap: (bootstrap) => {
    set({
      dashboard: bootstrap?.dashboard ?? null,
      isHydrated: true,
    });
  },

  refreshDashboard: async (supabaseAccessToken) => {
    try {
      set({ isRefreshing: true });

      const token = String(supabaseAccessToken ?? "").trim();
      if (!token) {
        console.warn("[dashboardStore] refreshDashboard: missing token");
        return;
      }

      const bootstrap = await fetchBootstrap(token);

      set({
        dashboard: bootstrap.dashboard ?? null,
        isHydrated: true,
      });
    } catch (e) {
      console.warn("[dashboardStore] refreshDashboard failed", e);
    } finally {
      set({ isRefreshing: false });
    }
  },

  resetDashboard: () => {
    set({
      dashboard: null,
      isHydrated: false,
      isRefreshing: false,
    });
  },
}));
