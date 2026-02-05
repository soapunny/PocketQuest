// apps/mobile/src/app/store/userPrefsStore.ts

import { create } from "zustand";

type CarryoverMode = "ROLLING";

type UserPrefsState = {
  // SSOT prefs
  language: string;
  currency: string; // keep legacy name; treat as “home currency”
  timeZone: string;

  // moved from planStore (UI prefs)
  advancedCurrencyMode: boolean;
  homeCurrency: string;
  displayCurrency: string;

  // NEW (DB-backed)
  cashflowCarryoverEnabled: boolean;
  cashflowCarryoverMode: CarryoverMode;

  isHydrated: boolean;

  applyUserPrefsFromBootstrap: (user: any) => void;

  // setters
  setLanguage: (v: string) => void;
  setAdvancedCurrencyMode: (enabled: boolean) => void;
  setHomeCurrency: (v: string) => void;
  setDisplayCurrency: (v: string) => void;

  // carryover setters (local)
  setCashflowCarryoverEnabled: (enabled: boolean) => void;
  setCashflowCarryoverMode: (mode: CarryoverMode) => void;

  resetUserPrefs: () => void;
};

export const useUserPrefsStore = create<UserPrefsState>((set, get) => ({
  language: "en",
  currency: "USD",
  timeZone: "UTC",

  advancedCurrencyMode: false,
  homeCurrency: "USD",
  displayCurrency: "USD",

  cashflowCarryoverEnabled: false,
  cashflowCarryoverMode: "ROLLING",

  isHydrated: false,

  applyUserPrefsFromBootstrap: (user) => {
    const prev = get();

    const language =
      user?.language ??
      user?.prefs?.language ??
      user?.settings?.language ??
      prev.language ??
      "en";

    const currency =
      user?.currency ??
      user?.homeCurrency ??
      user?.prefs?.currency ??
      prev.currency ??
      "USD";

    const timeZone =
      user?.timeZone ??
      user?.prefs?.timeZone ??
      user?.settings?.timeZone ??
      prev.timeZone ??
      "UTC";

    const cashflowCarryoverEnabled = !!(
      user?.cashflowCarryoverEnabled ?? prev.cashflowCarryoverEnabled
    );

    const cashflowCarryoverMode = String(
      user?.cashflowCarryoverMode ?? prev.cashflowCarryoverMode ?? "ROLLING"
    ) as "ROLLING";

    // homeCurrency is sourced from user.currency (SSOT)
    const homeCurrency = String(currency || "USD");
    const displayCurrency = String(prev.displayCurrency || homeCurrency);

    set({
      language: String(language || "en"),
      currency: String(currency || "USD"),
      timeZone: String(timeZone || "UTC"),

      // keep UI prefs unless you want to reset them
      advancedCurrencyMode: !!prev.advancedCurrencyMode,
      homeCurrency,
      displayCurrency,

      cashflowCarryoverEnabled,
      cashflowCarryoverMode,

      isHydrated: true,
    });
  },

  setLanguage: (v) => set({ language: String(v || "en") }),
  setAdvancedCurrencyMode: (enabled) => set({ advancedCurrencyMode: !!enabled }),
  setHomeCurrency: (v) =>
    set((s) => ({
      homeCurrency: String(v || "USD"),
      currency: String(v || "USD"), // keep legacy in sync
      ...(s.advancedCurrencyMode ? {} : { displayCurrency: String(v || "USD") }),
    })),
  setDisplayCurrency: (v) => set({ displayCurrency: String(v || "USD") }),

  setCashflowCarryoverEnabled: (enabled) =>
    set({ cashflowCarryoverEnabled: !!enabled }),
  setCashflowCarryoverMode: (mode) =>
    set({ cashflowCarryoverMode: mode === "ROLLING" ? "ROLLING" : "ROLLING" }),

  resetUserPrefs: () =>
    set({
      language: "en",
      currency: "USD",
      timeZone: "UTC",
      advancedCurrencyMode: false,
      homeCurrency: "USD",
      displayCurrency: "USD",
      cashflowCarryoverEnabled: false,
      cashflowCarryoverMode: "ROLLING",
      isHydrated: false,
    }),
}));
