import { create } from "zustand";

type UserPrefsState = {
  language: string;
  currency: string;
  timeZone: string;
  isHydrated: boolean;
  applyUserPrefsFromBootstrap: (user: any) => void;
  resetUserPrefs: () => void;
};

export const useUserPrefsStore = create<UserPrefsState>((set) => ({
  language: "en",
  currency: "USD",
  timeZone: "UTC",
  isHydrated: false,
  applyUserPrefsFromBootstrap: (user) => {
    const language =
      user?.language ??
      user?.prefs?.language ??
      user?.settings?.language ??
      "en";

    const currency =
      user?.currency ??
      user?.homeCurrency ??
      user?.displayCurrency ??
      user?.prefs?.currency ??
      "USD";

    const timeZone =
      user?.timeZone ?? user?.prefs?.timeZone ?? user?.settings?.timeZone ?? "UTC";

    set({
      language: String(language || "en"),
      currency: String(currency || "USD"),
      timeZone: String(timeZone || "UTC"),
      isHydrated: true,
    });
  },
  resetUserPrefs: () =>
    set({
      language: "en",
      currency: "USD",
      timeZone: "UTC",
      isHydrated: false,
    }),
}));

