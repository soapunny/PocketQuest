import React, { createContext, useContext, useMemo, useState } from "react";
import { EXPENSE_CATEGORIES } from "./categories";

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

export type Plan = {
  // Period settings
  periodType: PeriodType;
  // Used only for BIWEEKLY. Should be a Monday start date ISO.
  periodAnchorISO: string;

  // Start of the current period (week / 2-week block / calendar month)
  periodStartISO: string;

  // Back-compat (legacy). For WEEKLY this equals periodStartISO.
  weekStartISO: string;

  totalBudgetLimitCents: number; // 0 = disabled
  budgetGoals: BudgetGoal[];
  savingsGoals: SavingsGoal[];
};

type Store = {
  plan: Plan;
  setPeriodType: (type: PeriodType) => void;
  setTotalBudgetLimitCents: (cents: number) => void;
  upsertBudgetGoalLimit: (category: BudgetCategory, limitCents: number) => void;
  upsertSavingsGoalTarget: (name: string, targetCents: number) => void;
  addSavingsGoal: (name: string, targetCents: number) => void;
  removeSavingsGoal: (id: string) => void;
};

const PlanContext = createContext<Store | null>(null);

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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
    return startOfMonth(now).toISOString();
  }

  if (type === "WEEKLY") {
    return startOfISOWeekMonday(now).toISOString();
  }

  // BIWEEKLY
  // Normalize anchor to a Monday start
  const anchor = startOfISOWeekMonday(new Date(anchorISO));
  const today = startOfISOWeekMonday(now); // align to week starts

  const diffMs = today.getTime() - anchor.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const periodIndex = Math.floor(diffDays / 14);

  const start = new Date(anchor);
  start.setDate(anchor.getDate() + periodIndex * 14);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function buildDefaultBudgetGoals(): BudgetGoal[] {
  return EXPENSE_CATEGORIES.map((c) => ({
    id: uid(),
    category: c,
    limitCents: 0,
  }));
}

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const DEFAULT_PERIOD_TYPE: PeriodType = "WEEKLY";
  const DEFAULT_BIWEEKLY_ANCHOR_ISO = "2025-01-06"; // Monday anchor

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

  const setPeriodType: Store["setPeriodType"] = (type) => {
    const nextType: PeriodType = type ?? "WEEKLY";
    setPlan((p) => {
      const periodStartISO = periodStartFrom(
        nextType,
        new Date(),
        p.periodAnchorISO
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

  const store = useMemo<Store>(
    () => ({
      plan,
      setPeriodType,
      setTotalBudgetLimitCents,
      upsertBudgetGoalLimit,
      upsertSavingsGoalTarget,
      addSavingsGoal,
      removeSavingsGoal,
    }),
    [plan]
  );

  return React.createElement(PlanContext.Provider, { value: store }, children);
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used within PlanProvider");
  return ctx;
}
