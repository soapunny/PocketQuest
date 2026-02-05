// apps/mobile/src/app/store/dashboardStore.ts

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchBootstrap } from "../api/bootstrapApi";
import type {
  BootstrapResponseDTO,
  DashboardPayloadDTO,
} from "@pq/shared/bootstrap";
const SERVER_TOKEN_KEY = "pq_server_jwt";

type DashboardState = {
  dashboard: DashboardPayloadDTO | null;
  isHydrated: boolean;
  isRefreshing: boolean;
  applyDashboardFromBootstrap: (bootstrap: BootstrapResponseDTO) => void;
  refreshDashboard: (token?: string) => Promise<void>;
  resetDashboard: () => void;
};

export const useDashboardStore = create<DashboardState>((set) => ({
  dashboard: null,
  isHydrated: false,
  isRefreshing: false,

  applyDashboardFromBootstrap: (bootstrap) => {
    set({
      dashboard: bootstrap.dashboard,
      isHydrated: !!bootstrap.dashboard,
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

      set({
        dashboard: bootstrap.dashboard,
        isHydrated: !!bootstrap.dashboard,
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
