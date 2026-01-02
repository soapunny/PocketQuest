import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { EXPENSE_CATEGORIES } from "./categories";
import type { Currency } from "./currency";

export type BudgetCategory = (typeof EXPENSE_CATEGORIES)[number] | string;

export type BudgetGoal = {
  id: string;
  category: BudgetCategory;
  limitCents: number;
};

export type SavingsGoal = {
  id: string;
  name: string;
  targetCents: number;
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

  totalBudgetLimitCents: number; // 0 = disabled
  budgetGoals: BudgetGoal[];
  savingsGoals: SavingsGoal[];
};

type Store = {
  plan: Plan;
  setPeriodType: (type: PeriodType) => void;
  refreshPeriodIfNeeded: () => void;
  homeCurrency: Currency;
  displayCurrency: Currency;
  advancedCurrencyMode: boolean;
  language: UILanguage;
  setHomeCurrency: (c: Currency) => void;
  setDisplayCurrency: (c: Currency) => void;
  setAdvancedCurrencyMode: (enabled: boolean) => void;
  setLanguage: (lang: UILanguage) => void;
  setTotalBudgetLimitCents: (cents: number) => void;
  upsertBudgetGoalLimit: (category: BudgetCategory, limitCents: number) => void;
  upsertSavingsGoalTarget: (name: string, targetCents: number) => void;
  addSavingsGoal: (name: string, targetCents: number) => void;
  removeSavingsGoal: (id: string) => void;
  applyServerPlan: (serverPlan: {
    periodType?: PeriodType;
    // server may send DateTime ISO under either key
    periodStartUTC?: string;
    periodStart?: string;

    // server may send totals under either key
    totalBudgetLimitMinor?: number | null;
    totalBudgetLimitCents?: number | null;

    // goals: allow either minor/cents field names and allow null
    budgetGoals?:
      | {
          category: string;
          limitMinor?: number | null;
          limitCents?: number | null;
        }[]
      | null;
    savingsGoals?:
      | {
          name: string;
          targetMinor?: number | null;
          targetCents?: number | null;
        }[]
      | null;
  }) => void;
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
    limitCents: 0,
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
    limitCents?: number | null;
  }[]
): BudgetGoal[] {
  const byCat = new Map<string, number>();
  serverGoals.forEach((g) => {
    const cat = normalizeCategory(g.category);
    const raw = g.limitMinor ?? g.limitCents;
    byCat.set(cat, normalizePositiveInt(raw));
  });

  // Start with defaults (keeps ordering + stable IDs)
  const merged: BudgetGoal[] = defaults.map((d) => ({
    ...d,
    limitCents: byCat.has(String(d.category))
      ? (byCat.get(String(d.category)) as number)
      : d.limitCents,
  }));

  // Append any server categories not in defaults
  byCat.forEach((limit, cat) => {
    const exists = merged.some((m) => String(m.category) === cat);
    if (!exists) {
      merged.push({
        id: stableIdForKey("budget", cat),
        category: cat,
        limitCents: limit,
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
    targetCents?: number | null;
  }[]
): SavingsGoal[] {
  const byName = new Map<string, number>();
  serverGoals.forEach((g) => {
    const name = normalizeCategory(g.name);
    const raw = g.targetMinor ?? g.targetCents;
    byName.set(name, normalizePositiveInt(raw));
  });

  // Keep existing IDs when possible
  const merged: SavingsGoal[] = [];
  byName.forEach((target, name) => {
    const existing = current.find((x) => x.name === name);
    merged.push({
      id: existing?.id ?? stableIdForKey("savings", name),
      name,
      targetCents: target,
    });
  });

  return merged;
}

function sumBudgetLimits(goals: BudgetGoal[]) {
  return goals.reduce(
    (sum, g) => sum + (g.limitCents > 0 ? g.limitCents : 0),
    0
  );
}

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const DEFAULT_PERIOD_TYPE: PeriodType = "WEEKLY";
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
      totalBudgetLimitCents: 0,
      budgetGoals: buildDefaultBudgetGoals(),
      savingsGoals: [],
    };
  });

  const setTotalBudgetLimitCents: Store["setTotalBudgetLimitCents"] = (
    cents
  ) => {
    const clean = Math.max(0, Number.isFinite(cents) ? Math.round(cents) : 0);
    setPlan((p) => ({ ...p, totalBudgetLimitCents: clean }));
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
    const nextType: PeriodType = type ?? "WEEKLY";
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

  useEffect(() => {
    // Ensure correct start on app launch
    refreshPeriodIfNeeded();
    // Poll periodically so the plan rolls over even if the app stays open.
    // 60s is light and good enough for weekly/monthly boundaries.
    const id = setInterval(() => {
      refreshPeriodIfNeeded();
    }, 60 * 1000);
    return () => clearInterval(id);
  }, [refreshPeriodIfNeeded]);

  const upsertBudgetGoalLimit: Store["upsertBudgetGoalLimit"] = (
    category,
    limitCents
  ) => {
    const cat = (category || "Other").toString().trim() || "Other";
    const cleanLimit = Math.max(
      0,
      Number.isFinite(limitCents) ? Math.round(limitCents) : 0
    );

    setPlan((p) => {
      const idx = p.budgetGoals.findIndex((g) => g.category === cat);
      let nextGoals = p.budgetGoals;

      if (idx >= 0) {
        nextGoals = p.budgetGoals.slice();
        nextGoals[idx] = { ...nextGoals[idx], limitCents: cleanLimit };
      } else {
        nextGoals = [
          ...p.budgetGoals,
          { id: uid(), category: cat, limitCents: cleanLimit },
        ];
      }

      // ✅ total budget = sum of all category limits (only > 0)
      const total = nextGoals.reduce(
        (sum, g) => sum + (g.limitCents > 0 ? g.limitCents : 0),
        0
      );

      return {
        ...p,
        budgetGoals: nextGoals,
        totalBudgetLimitCents: total, // auto
      };
    });
  };

  const upsertSavingsGoalTarget: Store["upsertSavingsGoalTarget"] = (
    name,
    targetCents
  ) => {
    const n = (name || "Other").toString().trim() || "Other";
    const clean = Math.max(
      0,
      Number.isFinite(targetCents) ? Math.round(targetCents) : 0
    );

    setPlan((p) => {
      const idx = p.savingsGoals.findIndex((g) => g.name === n);

      if (idx >= 0) {
        const next = p.savingsGoals.slice();
        next[idx] = { ...next[idx], targetCents: clean };
        return { ...p, savingsGoals: next };
      }

      // target이 0이면 새로 만들 필요 없음
      if (clean <= 0) return p;

      return {
        ...p,
        savingsGoals: [
          ...p.savingsGoals,
          { id: uid(), name: n, targetCents: clean },
        ],
      };
    });
  };

  const addSavingsGoal: Store["addSavingsGoal"] = (name, targetCents) => {
    const n = (name || "").trim();
    const t = Math.max(
      0,
      Number.isFinite(targetCents) ? Math.round(targetCents) : 0
    );
    if (!n || t <= 0) return;

    setPlan((p) => ({
      ...p,
      savingsGoals: [...p.savingsGoals, { id: uid(), name: n, targetCents: t }],
    }));
  };

  const removeSavingsGoal: Store["removeSavingsGoal"] = (id) => {
    setPlan((p) => ({
      ...p,
      savingsGoals: p.savingsGoals.filter((g) => g.id !== id),
    }));
  };

  const applyServerPlan: Store["applyServerPlan"] = useCallback(
    (serverPlan) => {
      // Be permissive: server might omit some fields
      const periodType: PeriodType = (serverPlan?.periodType ??
        plan.periodType ??
        "MONTHLY") as PeriodType;

      // Server sends DateTime ISO for periodStart. Use date-only (YYYY-MM-DD).
      const rawStart = (
        serverPlan?.periodStartUTC ??
        serverPlan?.periodStart ??
        ""
      ).toString();
      const periodStartISO = rawStart ? rawStart.slice(0, 10) : "";

      const serverBudgetGoals = Array.isArray(serverPlan?.budgetGoals)
        ? serverPlan!.budgetGoals
        : [];

      const serverSavingsGoals = Array.isArray(serverPlan?.savingsGoals)
        ? serverPlan!.savingsGoals
        : [];

      const serverTotalRaw =
        serverPlan?.totalBudgetLimitMinor ?? serverPlan?.totalBudgetLimitCents;
      const serverTotalClean = normalizePositiveInt(serverTotalRaw);

      setPlan((p) => {
        // Merge budget goals against defaults so chips/order stay stable
        const defaults = buildDefaultBudgetGoals();
        const nextBudgetGoals = mergeBudgetGoalsWithDefaults(
          defaults,
          serverBudgetGoals
        );

        // Savings goals: keep stable IDs when possible
        const nextSavingsGoals = mergeSavingsGoals(
          p.savingsGoals,
          serverSavingsGoals
        );

        // Prefer explicit server total when provided (>0). Otherwise compute from category limits.
        const computedTotal = sumBudgetLimits(nextBudgetGoals);
        const totalBudgetLimitCents =
          serverTotalClean > 0 ? serverTotalClean : computedTotal;

        const nextPeriodStartISO = periodStartISO || p.periodStartISO;

        return {
          ...p,
          periodType,
          periodStartISO: nextPeriodStartISO,
          // Keep legacy field aligned for WEEKLY (back-compat)
          weekStartISO:
            periodType === "WEEKLY" ? nextPeriodStartISO : p.weekStartISO,
          totalBudgetLimitCents,
          budgetGoals: nextBudgetGoals,
          savingsGoals: nextSavingsGoals,
        };
      });
    },
    [plan.periodType]
  );

  const store = useMemo<Store>(
    () => ({
      plan,
      setPeriodType,
      refreshPeriodIfNeeded,
      homeCurrency: plan.homeCurrency,
      displayCurrency: plan.displayCurrency,
      advancedCurrencyMode: !!plan.advancedCurrencyMode,
      language: (plan.language ?? "en") as UILanguage,
      setHomeCurrency,
      setDisplayCurrency,
      setAdvancedCurrencyMode,
      setLanguage,
      setTotalBudgetLimitCents,
      upsertBudgetGoalLimit,
      upsertSavingsGoalTarget,
      addSavingsGoal,
      removeSavingsGoal,
      applyServerPlan, // <-- add the missing required property
    }),
    [
      plan,
      setPeriodType,
      refreshPeriodIfNeeded,
      setHomeCurrency,
      setDisplayCurrency,
      setAdvancedCurrencyMode,
      setLanguage,
      setTotalBudgetLimitCents,
      upsertBudgetGoalLimit,
      upsertSavingsGoalTarget,
      addSavingsGoal,
      removeSavingsGoal,
      applyServerPlan,
    ]
  );

  return React.createElement(PlanContext.Provider, { value: store }, children);
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used within PlanProvider");
  return ctx;
}
