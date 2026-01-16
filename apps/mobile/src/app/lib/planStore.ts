import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { API_BASE_URL, DEV_USER_ID } from "./config";
import { EXPENSE_CATEGORIES } from "./categories";
import type { Currency } from "./currency";

export type BudgetCategory = (typeof EXPENSE_CATEGORIES)[number] | string;

export type BudgetGoal = {
  id: string;
  category: BudgetCategory;
  limitMinor: number;
};

export type SavingsGoal = {
  id: string;
  name: string;
  targetMinor: number;
};

export type PeriodType = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

export type UILanguage = "en" | "ko";

export type Plan = {
  // Period type
  periodType: PeriodType;

  // Period settings
  // Used only for BIWEEKLY. Should be a Monday start date (YYYY-MM-DD).
  periodAnchorISO?: string;

  // Start of the current period (week / 2-week block / calendar month) as YYYY-MM-DD.
  periodStartISO: string;

  // Back-compat (legacy). For WEEKLY this equals periodStartISO (YYYY-MM-DD).
  weekStartISO?: string;

  // Currency preferences
  // Home currency is the base for totals/progress calculations.
  homeCurrency: Currency;
  // Display currency controls how amounts are shown in the UI.
  displayCurrency: Currency;

  // Advanced currency mode (when false, treat currency as a single setting)
  advancedCurrencyMode?: boolean;

  // UI language
  language?: UILanguage;

  totalBudgetLimitMinor: number; // 0 = disabled
  budgetGoals: BudgetGoal[];
  savingsGoals: SavingsGoal[];
};

type Store = {
  plan: Plan;
  setPeriodType: (type: PeriodType) => void;
  // Switch period type on the server and set the returned plan as active.
  // Returns true on success.
  switchPeriodType: (type: PeriodType) => Promise<boolean>;
  refreshPeriodIfNeeded: () => void;
  homeCurrency: Currency;
  displayCurrency: Currency;
  switchPlanCurrency: (currency: Currency) => Promise<boolean>;
  advancedCurrencyMode: boolean;
  language: UILanguage;
  setHomeCurrency: (c: Currency) => void;
  setDisplayCurrency: (c: Currency) => void;
  setAdvancedCurrencyMode: (enabled: boolean) => void;
  setLanguage: (lang: UILanguage) => void;
  setTotalBudgetLimitMinor: (minor: number) => void;
  upsertBudgetGoalLimit: (category: BudgetCategory, limitMinor: number) => void;
  upsertSavingsGoalTarget: (name: string, targetMinor: number) => void;
  addSavingsGoal: (name: string, targetMinor: number) => void;
  removeSavingsGoal: (id: string) => void;

  refreshPlan: () => Promise<boolean>;
  applyServerPlan: (serverPlan: {
    periodType?: PeriodType;
    // server may send DateTime ISO under either key
    periodStartUTC?: string;
    periodStart?: string;

    // totals are in minor units
    totalBudgetLimitMinor?: number | null;

    currency?: Currency;
    homeCurrency?: Currency;
    displayCurrency?: Currency;

    // goals use minor units
    budgetGoals?:
      | {
          category: string;
          limitMinor?: number | null;
        }[]
      | null;
    savingsGoals?:
      | {
          name: string;
          targetMinor?: number | null;
        }[]
      | null;
  }) => void;

  // --- bootstrap/initialize 상태 및 함수 ---
  isInitialized: boolean;
  isLoading: boolean;
  initialize: () => Promise<void>;
};

const PlanContext = createContext<Store | null>(null);

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function toISODate(d: Date) {
  // Date-only ISO (YYYY-MM-DD)
  return d.toISOString().slice(0, 10);
}

function parseISODateLocal(isoDate: string) {
  // Parse YYYY-MM-DD as a local date (avoids UTC parsing surprises)
  const [y, m, d] = (isoDate || "").split("-").map((x) => Number(x));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function startOfISOWeekMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay(); // 0..6 (0=Sun)
  const diff = (day === 0 ? -6 : 1) - day; // back to Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(d: Date) {
  const date = new Date(d);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function periodStartFrom(type: PeriodType, now: Date, anchorISO: string) {
  if (type === "MONTHLY") {
    return toISODate(startOfMonth(now));
  }

  if (type === "WEEKLY") {
    return toISODate(startOfISOWeekMonday(now));
  }

  // BIWEEKLY
  // Normalize anchor to a Monday start (treat anchor as local date-only)
  const anchor = startOfISOWeekMonday(parseISODateLocal(anchorISO));
  const today = startOfISOWeekMonday(now); // align to week starts

  const diffMs = today.getTime() - anchor.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const periodIndex = Math.floor(diffDays / 14);

  const start = new Date(anchor);
  start.setDate(anchor.getDate() + periodIndex * 14);
  start.setHours(0, 0, 0, 0);
  return toISODate(start);
}

function stableIdForKey(prefix: string, key: string) {
  return `${prefix}:${key}`;
}

function buildDefaultBudgetGoals(): BudgetGoal[] {
  return EXPENSE_CATEGORIES.map((c) => ({
    id: stableIdForKey("budget", String(c)),
    category: c,
    limitMinor: 0,
  }));
}

function normalizeCategory(x: any): string {
  return (x ?? "Other").toString().trim() || "Other";
}

function normalizePositiveInt(n: any): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.round(v));
}

function mergeBudgetGoalsWithDefaults(
  defaults: BudgetGoal[],
  serverGoals: {
    category: string;
    limitMinor?: number | null;
  }[]
): BudgetGoal[] {
  const byCat = new Map<string, number>();
  serverGoals.forEach((g) => {
    const cat = normalizeCategory(g.category);
    const raw = g.limitMinor ?? 0;
    byCat.set(cat, normalizePositiveInt(raw));
  });

  // Start with defaults (keeps ordering + stable IDs)
  const merged: BudgetGoal[] = defaults.map((d) => ({
    ...d,
    limitMinor: byCat.has(String(d.category))
      ? (byCat.get(String(d.category)) as number)
      : d.limitMinor,
  }));

  // Append any server categories not in defaults
  byCat.forEach((limit, cat) => {
    const exists = merged.some((m) => String(m.category) === cat);
    if (!exists) {
      merged.push({
        id: stableIdForKey("budget", cat),
        category: cat,
        limitMinor: limit,
      });
    }
  });

  return merged;
}

function mergeSavingsGoals(
  current: SavingsGoal[],
  serverGoals: {
    name: string;
    targetMinor?: number | null;
  }[]
): SavingsGoal[] {
  const byName = new Map<string, number>();
  serverGoals.forEach((g) => {
    const name = normalizeCategory(g.name);
    const raw = g.targetMinor ?? g.targetMinor;
    byName.set(name, normalizePositiveInt(raw));
  });

  // Keep existing IDs when possible
  const merged: SavingsGoal[] = [];
  byName.forEach((target, name) => {
    const existing = current.find((x) => x.name === name);
    merged.push({
      id: existing?.id ?? stableIdForKey("savings", name),
      name,
      targetMinor: target,
    });
  });

  return merged;
}

function sumBudgetLimits(goals: BudgetGoal[]) {
  return goals.reduce(
    (sum, g) => sum + (g.limitMinor > 0 ? g.limitMinor : 0),
    0
  );
}

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const DEFAULT_PERIOD_TYPE: PeriodType = "MONTHLY";
  const DEFAULT_BIWEEKLY_ANCHOR_ISO = "2025-01-06"; // Monday anchor (YYYY-MM-DD)

  const DEFAULT_HOME_CURRENCY: Currency = "USD";
  const DEFAULT_DISPLAY_CURRENCY: Currency = "USD";

  const [plan, setPlan] = useState<Plan>(() => {
    const periodStartISO = periodStartFrom(
      DEFAULT_PERIOD_TYPE,
      new Date(),
      DEFAULT_BIWEEKLY_ANCHOR_ISO
    );

    return {
      periodType: DEFAULT_PERIOD_TYPE,
      periodAnchorISO: DEFAULT_BIWEEKLY_ANCHOR_ISO,
      periodStartISO,
      weekStartISO: periodStartISO, // back-compat for now
      homeCurrency: DEFAULT_HOME_CURRENCY,
      displayCurrency: DEFAULT_DISPLAY_CURRENCY,
      advancedCurrencyMode: false,
      language: "en",
      totalBudgetLimitMinor: 0,
      budgetGoals: buildDefaultBudgetGoals(),
      savingsGoals: [],
    };
  });

  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const setTotalBudgetLimitMinor: Store["setTotalBudgetLimitMinor"] = (
    minor
  ) => {
    const clean = Math.max(0, Number.isFinite(minor) ? Math.round(minor) : 0);
    setPlan((p) => ({ ...p, totalBudgetLimitMinor: clean }));
  };

  const setHomeCurrency: Store["setHomeCurrency"] = (c) => {
    const next: Currency = c === "KRW" ? "KRW" : "USD";
    setPlan((p) => ({ ...p, homeCurrency: next }));
  };

  const setDisplayCurrency: Store["setDisplayCurrency"] = (c) => {
    const next: Currency = c === "KRW" ? "KRW" : "USD";
    setPlan((p) => ({ ...p, displayCurrency: next }));
  };

  const setAdvancedCurrencyMode: Store["setAdvancedCurrencyMode"] = (
    enabled
  ) => {
    const on = !!enabled;

    setPlan((p) => {
      // If turning OFF advanced mode, keep currencies aligned to the current display currency
      // so the app behaves like a single-currency experience.
      if (!on) {
        const base: Currency = p.displayCurrency === "KRW" ? "KRW" : "USD";
        return {
          ...p,
          advancedCurrencyMode: false,
          homeCurrency: base,
          displayCurrency: base,
        };
      }

      return {
        ...p,
        advancedCurrencyMode: true,
      };
    });
  };

  const setLanguage: Store["setLanguage"] = (lang) => {
    const next: UILanguage = lang === "ko" ? "ko" : "en";
    setPlan((p) => ({
      ...p,
      language: next,
    }));
  };

  const setPeriodType: Store["setPeriodType"] = (type) => {
    const nextType: PeriodType = type ?? DEFAULT_PERIOD_TYPE;
    setPlan((p) => {
      const periodStartISO = periodStartFrom(
        nextType,
        new Date(),
        p.periodAnchorISO ?? DEFAULT_BIWEEKLY_ANCHOR_ISO
      );
      return {
        ...p,
        periodType: nextType,
        periodStartISO,
        // Keep legacy field aligned for now
        weekStartISO: nextType === "WEEKLY" ? periodStartISO : p.weekStartISO,
      };
    });
  };

  /**
   * ✅ applyServerPlan을 먼저 정의 (refreshPlan에서 참조하므로 순서 중요)
   * - deps는 []: setPlan(updater)만 사용하므로 stale problem 없음
   */
  const applyServerPlan: Store["applyServerPlan"] = useCallback(
    (serverPlan) => {
      const periodType: PeriodType = (serverPlan?.periodType ??
        DEFAULT_PERIOD_TYPE) as PeriodType;

      const rawStart = (
        serverPlan?.periodStartUTC ??
        serverPlan?.periodStart ??
        ""
      ).toString();
      const periodStartISO = rawStart ? rawStart.slice(0, 10) : "";

      const serverBudgetGoals = Array.isArray(serverPlan?.budgetGoals)
        ? serverPlan.budgetGoals
        : [];

      const serverSavingsGoals = Array.isArray(serverPlan?.savingsGoals)
        ? serverPlan.savingsGoals
        : [];

      const serverTotalRaw = serverPlan?.totalBudgetLimitMinor;
      const serverTotalClean = normalizePositiveInt(serverTotalRaw);

      setPlan((p) => {
        const defaults = buildDefaultBudgetGoals();
        const nextBudgetGoals = mergeBudgetGoalsWithDefaults(
          defaults,
          serverBudgetGoals
        );

        const nextSavingsGoals = mergeSavingsGoals(
          p.savingsGoals,
          serverSavingsGoals
        );

        const computedTotal = sumBudgetLimits(nextBudgetGoals);
        const totalBudgetLimitMinor =
          serverTotalClean > 0 ? serverTotalClean : computedTotal;

        const nextPeriodStartISO = periodStartISO || p.periodStartISO;

        return {
          ...p,
          periodType,
          periodStartISO: nextPeriodStartISO,
          weekStartISO:
            periodType === "WEEKLY" ? nextPeriodStartISO : p.weekStartISO,
          totalBudgetLimitMinor,
          homeCurrency:
            serverPlan.homeCurrency ?? serverPlan.currency ?? p.homeCurrency,
          displayCurrency:
            serverPlan.displayCurrency ??
            serverPlan.currency ??
            p.displayCurrency,
          budgetGoals: nextBudgetGoals,
          savingsGoals: nextSavingsGoals,
        };
      });
    },
    []
  );

  const switchPlanCurrency = useCallback(
    async (nextCurrency: "USD" | "KRW") => {
      const endpoint = `${API_BASE_URL}/api/plans`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-dev-user-id": DEV_USER_ID,
      };

      const currentType: PeriodType = (plan.periodType ??
        DEFAULT_PERIOD_TYPE) as PeriodType;
      const anchorISO = plan.periodAnchorISO ?? DEFAULT_BIWEEKLY_ANCHOR_ISO;

      const body: any = {
        periodType: currentType,
        setActive: true,
        useCurrentPeriod: true,
        currency: nextCurrency,
        language: plan.language ?? "en",
        totalBudgetLimitMinor: plan.totalBudgetLimitMinor ?? 0,
      };

      if (currentType === "BIWEEKLY") {
        body.periodAnchorISO = anchorISO;
      }

      try {
        const res = await fetch(endpoint, {
          method: "PATCH",
          headers,
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.warn(
            "[planStore] switchPlanCurrency failed",
            res.status,
            text
          );
          return false;
        }

        const raw = await res.json();

        applyServerPlan({
          periodType: raw?.periodType,
          periodStartUTC: raw?.periodStartUTC ?? raw?.periodStart,
          totalBudgetLimitMinor: raw?.totalBudgetLimitMinor ?? null,
          currency: raw?.currency,
          budgetGoals: Array.isArray(raw?.budgetGoals)
            ? raw.budgetGoals.map((g: any) => ({
                category: g.category,
                limitMinor:
                  typeof g.limitMinor === "number" ? g.limitMinor : null,
              }))
            : null,
          savingsGoals: Array.isArray(raw?.savingsGoals)
            ? raw.savingsGoals.map((g: any) => ({
                name: g.name,
                targetMinor:
                  typeof g.targetMinor === "number" ? g.targetMinor : null,
              }))
            : null,
        } as any);

        return true;
      } catch (err) {
        console.error("[planStore] switchPlanCurrency error", err);
        return false;
      }
    },
    [plan, applyServerPlan]
  );

  const switchPeriodType: Store["switchPeriodType"] = useCallback(
    async (type) => {
      const nextType: PeriodType = (type ?? DEFAULT_PERIOD_TYPE) as PeriodType;

      const endpoint = `${API_BASE_URL}/api/plans`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-dev-user-id": DEV_USER_ID,
      };

      // BIWEEKLY requires an anchor.
      const anchorISO = plan.periodAnchorISO ?? DEFAULT_BIWEEKLY_ANCHOR_ISO;

      const body: any = {
        periodType: nextType,
        setActive: true,
        useCurrentPeriod: true,
        // keep user preferences when switching
        // currency: plan.homeCurrency,
        language: plan.language ?? "en",
        totalBudgetLimitMinor: plan.totalBudgetLimitMinor ?? 0,
      };

      if (nextType === "BIWEEKLY") {
        body.periodAnchorISO = anchorISO;
      }

      try {
        const res = await fetch(endpoint, {
          method: "PATCH",
          headers,
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.warn(
            "[planStore] Failed to switch period type",
            res.status,
            text
          );
          return false;
        }

        const raw = await res.json();

        // Apply server plan (source of truth)
        applyServerPlan({
          periodType: raw?.periodType,
          periodStartUTC: raw?.periodStartUTC ?? raw?.periodStart,
          totalBudgetLimitMinor: raw?.totalBudgetLimitMinor ?? null,
          // ✅ 새 플랜의 통화로 UI도 자동 동기화
          currency: raw?.currency,
          budgetGoals: Array.isArray(raw?.budgetGoals)
            ? raw.budgetGoals.map((g: any) => ({
                category: g.category,
                limitMinor:
                  typeof g.limitMinor === "number" ? g.limitMinor : null,
              }))
            : null,
          savingsGoals: Array.isArray(raw?.savingsGoals)
            ? raw.savingsGoals.map((g: any) => ({
                name: g.name,
                targetMinor:
                  typeof g.targetMinor === "number" ? g.targetMinor : null,
              }))
            : null,
        });

        return true;
      } catch (err) {
        console.error("[planStore] Error while switching period type", err);
        return false;
      }
    },
    [plan, applyServerPlan]
  );

  const refreshPeriodIfNeeded: Store["refreshPeriodIfNeeded"] =
    useCallback(() => {
      setPlan((p) => {
        const expectedStartISO = periodStartFrom(
          p.periodType,
          new Date(),
          p.periodAnchorISO ?? DEFAULT_BIWEEKLY_ANCHOR_ISO
        );
        // If the computed period start matches, no change.
        if (p.periodStartISO === expectedStartISO) return p;
        return {
          ...p,
          periodStartISO: expectedStartISO,
          // Keep legacy field aligned for WEEKLY
          weekStartISO:
            p.periodType === "WEEKLY" ? expectedStartISO : p.weekStartISO,
        };
      });
    }, []);

  const refreshPlan: Store["refreshPlan"] = useCallback(async () => {
    const endpoint = `${API_BASE_URL}/api/plans`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-dev-user-id": DEV_USER_ID,
    };

    // Helper to map raw server plan to applyServerPlan
    const applyRawPlan = (raw: any) => {
      applyServerPlan({
        periodType: raw?.periodType,
        // server may send DateTime ISO under either key
        periodStartUTC: raw?.periodStartUTC ?? raw?.periodStart,
        totalBudgetLimitMinor: raw?.totalBudgetLimitMinor ?? null,
        currency: raw?.currency,
        budgetGoals: Array.isArray(raw?.budgetGoals)
          ? raw.budgetGoals.map((g: any) => ({
              category: g.category,
              limitMinor:
                typeof g.limitMinor === "number" ? g.limitMinor : null,
            }))
          : null,
        savingsGoals: Array.isArray(raw?.savingsGoals)
          ? raw.savingsGoals.map((g: any) => ({
              name: g.name,
              targetMinor:
                typeof g.targetMinor === "number" ? g.targetMinor : null,
            }))
          : null,
      });
    };

    try {
      // 1) active plan 조회
      const res = await fetch(endpoint, {
        method: "GET",
        headers,
      });

      // 404면 최초 생성 흐름으로 넘어감
      if (res.status === 404) {
        console.log("[planStore] No plan found. Creating monthly plan...");

        const createRes = await fetch(endpoint, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            periodType: DEFAULT_PERIOD_TYPE,
            // 기본값=MONTHLY+ 즉시 active로 전환
            setActive: true,
            useCurrentPeriod: true,
            currency: "USD",
            language: "en",
            totalBudgetLimitMinor: 0,
          }),
        });

        if (!createRes.ok) {
          const text = await createRes.text().catch(() => "");
          console.warn(
            "[planStore] Failed to create monthly plan",
            createRes.status,
            text
          );
          return false;
        }

        const raw = await createRes.json();
        applyRawPlan(raw);
        return true;
      }

      // 그 외 에러는 실패 처리
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn(
          "[planStore] Failed to refresh plan from server",
          res.status,
          text
        );
        return false;
      }

      // 2) 정상 조회면 plan 적용
      const raw = await res.json();
      applyRawPlan(raw);
      return true;
    } catch (err) {
      console.error("[planStore] Error while refreshing plan", err);
      return false;
    }
  }, [applyServerPlan]);

  const initialize: Store["initialize"] = useCallback(async () => {
    if (isInitialized || isLoading) return;
    setIsLoading(true);
    try {
      // 1) 클라이언트 기준 기간 보정 (UI용)
      refreshPeriodIfNeeded();

      // 2) 서버 plan 로드 (중복 fetch 제거)
      await refreshPlan();
    } finally {
      setIsLoading(false);
      setIsInitialized(true);
    }
  }, [isInitialized, isLoading, refreshPeriodIfNeeded, refreshPlan]);

  useEffect(() => {
    refreshPeriodIfNeeded();
    const id = setInterval(() => {
      refreshPeriodIfNeeded();
    }, 60 * 1000);
    return () => clearInterval(id);
  }, [refreshPeriodIfNeeded]);

  const upsertBudgetGoalLimit: Store["upsertBudgetGoalLimit"] = (
    category,
    limitMinor
  ) => {
    const cat = (category || "Other").toString().trim() || "Other";
    const cleanLimit = Math.max(
      0,
      Number.isFinite(limitMinor) ? Math.round(limitMinor) : 0
    );

    setPlan((p) => {
      const idx = p.budgetGoals.findIndex((g) => g.category === cat);
      let nextGoals = p.budgetGoals;

      if (idx >= 0) {
        nextGoals = p.budgetGoals.slice();
        nextGoals[idx] = { ...nextGoals[idx], limitMinor: cleanLimit };
      } else {
        nextGoals = [
          ...p.budgetGoals,
          { id: uid(), category: cat, limitMinor: cleanLimit },
        ];
      }

      const total = nextGoals.reduce(
        (sum, g) => sum + (g.limitMinor > 0 ? g.limitMinor : 0),
        0
      );

      return {
        ...p,
        budgetGoals: nextGoals,
        totalBudgetLimitMinor: total,
      };
    });
  };

  const upsertSavingsGoalTarget: Store["upsertSavingsGoalTarget"] = (
    name,
    targetMinor
  ) => {
    const n = (name || "Other").toString().trim() || "Other";
    const clean = Math.max(
      0,
      Number.isFinite(targetMinor) ? Math.round(targetMinor) : 0
    );

    setPlan((p) => {
      const idx = p.savingsGoals.findIndex((g) => g.name === n);

      if (idx >= 0) {
        const next = p.savingsGoals.slice();
        next[idx] = { ...next[idx], targetMinor: clean };
        return { ...p, savingsGoals: next };
      }

      if (clean <= 0) return p;

      return {
        ...p,
        savingsGoals: [
          ...p.savingsGoals,
          { id: uid(), name: n, targetMinor: clean },
        ],
      };
    });
  };

  const addSavingsGoal: Store["addSavingsGoal"] = (name, targetMinor) => {
    const n = (name || "").trim();
    const t = Math.max(
      0,
      Number.isFinite(targetMinor) ? Math.round(targetMinor) : 0
    );
    if (!n || t <= 0) return;

    setPlan((p) => ({
      ...p,
      savingsGoals: [...p.savingsGoals, { id: uid(), name: n, targetMinor: t }],
    }));
  };

  const removeSavingsGoal: Store["removeSavingsGoal"] = (id) => {
    setPlan((p) => ({
      ...p,
      savingsGoals: p.savingsGoals.filter((g) => g.id !== id),
    }));
  };

  const store = useMemo<Store>(
    () => ({
      plan,
      refreshPlan,
      setPeriodType,
      switchPeriodType,
      switchPlanCurrency,
      refreshPeriodIfNeeded,
      homeCurrency: plan.homeCurrency,
      displayCurrency: plan.displayCurrency,
      advancedCurrencyMode: !!plan.advancedCurrencyMode,
      language: (plan.language ?? "en") as UILanguage,
      setHomeCurrency,
      setDisplayCurrency,
      setAdvancedCurrencyMode,
      setLanguage,
      setTotalBudgetLimitMinor,
      upsertBudgetGoalLimit,
      upsertSavingsGoalTarget,
      addSavingsGoal,
      removeSavingsGoal,
      applyServerPlan,
      isInitialized,
      isLoading,
      initialize,
    }),
    [
      plan,
      refreshPlan, // ✅ deps 추가 (중요)
      setPeriodType,
      switchPeriodType,
      refreshPeriodIfNeeded,
      setHomeCurrency,
      setDisplayCurrency,
      switchPlanCurrency,
      setAdvancedCurrencyMode,
      setLanguage,
      setTotalBudgetLimitMinor,
      upsertBudgetGoalLimit,
      upsertSavingsGoalTarget,
      addSavingsGoal,
      removeSavingsGoal,
      applyServerPlan,
      isInitialized,
      isLoading,
      initialize,
    ]
  );

  return React.createElement(PlanContext.Provider, { value: store }, children);
}

export function usePlanStore() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlanStore must be used within PlanProvider");
  return ctx;
}

// 기존 코드와의 호환성을 위해 usePlan도 그대로 export (alias)
export const usePlan = usePlanStore;
