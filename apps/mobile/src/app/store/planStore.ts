// apps/mobile/src/app/store/planStore.ts
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { AppState, AppStateStatus } from "react-native";

import { useAuthStore } from "./authStore";
import { plansApi } from "../api/plansApi";
import type { Currency } from "../../../../../packages/shared/src/money/types";
import type {
  Plan,
  ServerPlanDTO,
  PlanPeriodType,
  Language,
  BudgetGoal,
  SavingsGoal,
  PatchPlanDTO,
  PatchBudgetGoalsRequestDTO,
  PatchSavingsGoalsRequestDTO,
  SwitchCurrencyRequestDTO,
} from "../../../../../packages/shared/src/plans/types";

import { EXPENSE_CATEGORY_KEYS } from "../../../../../packages/shared/src/transactions/categories";

export type BudgetCategory = (typeof EXPENSE_CATEGORY_KEYS)[number] | string;

type Store = {
  plan: Plan;
  setPeriodType: (type: PlanPeriodType) => void;
  // Switch period type on the server and set the returned plan as active.
  // Returns true on success.
  switchPeriodType: (type: PlanPeriodType) => Promise<boolean>;
  refreshPeriodIfNeeded: () => void;
  homeCurrency: Currency;
  displayCurrency: Currency;
  switchPlanCurrency: (currency: Currency) => Promise<boolean>;
  advancedCurrencyMode: boolean;
  language: Language;
  setHomeCurrency: (c: Currency) => void;
  setDisplayCurrency: (c: Currency) => void;
  setAdvancedCurrencyMode: (enabled: boolean) => void;
  setLanguage: (lang: Language) => void;
  setTotalBudgetLimitMinor: (minor: number) => void;
  upsertBudgetGoalLimit: (category: BudgetCategory, limitMinor: number) => void;
  upsertSavingsGoalTarget: (name: string, targetMinor: number) => void;
  addSavingsGoal: (name: string, targetMinor: number) => void;
  removeSavingsGoal: (id: string) => void;

  refreshPlan: () => Promise<boolean>;
  activePlanId: string | null;

  // Persist current budget goals to server using SSOT DTOs.
  // Prefers /api/plans/[id]/goals/budget when activePlanId is known.
  saveBudgetGoals: () => Promise<boolean>;

  // Single-goal upsert helper (POST /api/plans/[id]/goals/budget)
  saveBudgetGoal: (
    category: BudgetCategory,
    limitMinor: number
  ) => Promise<boolean>;

  // Persist current savings goals to server using SSOT DTOs.
  // Prefers /api/plans/[id]/goals/savings when activePlanId is known.
  saveSavingsGoals: () => Promise<boolean>;
  applyServerPlan: (serverPlan: ServerPlanDTO) => void;

  // Bootstrap hydrate (plan only). Prefs source is userPrefsStore; these fields are deprecated.
  applyBootstrapPlan: (bootstrap: any) => void;

  // --- bootstrap/initialize 상태 및 함수 ---
  isInitialized: boolean;
  isLoading: boolean;
  initialize: () => Promise<void>;
};

const PlanContext = createContext<Store | null>(null);

// Latest plan snapshot (module-level) for non-hook callers.
// This avoids stale closures in helper functions (e.g., merge after server responses).
let _latestPlanSnapshot: { plan: Plan } | null = null;

export function getPlanState() {
  return _latestPlanSnapshot;
}

// --- Module-level constants for defaults ---
const DEFAULT_PERIOD_TYPE: PlanPeriodType = "MONTHLY";
const DEFAULT_HOME_CURRENCY: Currency = "USD";
const DEFAULT_DISPLAY_CURRENCY: Currency = "USD";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function toISODateInTimeZone(d: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

function safeParseISODateTime(iso: any): Date | null {
  if (!iso) return null;
  const d = new Date(String(iso));
  return Number.isFinite(d.getTime()) ? d : null;
}

function deriveLocalISOFromUTCInstant(
  utcISO: string,
  timeZone: string
): string {
  const d = safeParseISODateTime(utcISO);
  if (!d) return "";
  return toISODateInTimeZone(d, timeZone);
}

// Period range is half-open: [periodStartUTC, periodEndUTC).
// For UI date-only comparisons, we keep endISO as the local calendar date of periodEndUTC (exclusive).

function stableIdForKey(prefix: string, key: string) {
  return `${prefix}:${key}`;
}

function buildDefaultBudgetGoals(): BudgetGoal[] {
  return EXPENSE_CATEGORY_KEYS.map((c) => ({
    id: stableIdForKey("budget", String(c)),
    category: String(c),
    limitMinor: 0,
  }));
}

function normalizeCategoryKey(x: any): string {
  const v = (x ?? "uncategorized").toString().trim();
  return (v || "uncategorized").toLowerCase();
}

function normalizeName(x: any): string {
  return (x ?? "Other").toString().trim() || "Other";
}

function normalizePositiveInt(n: any): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.round(v));
}

function normalizeLanguage(v: any): Language {
  return String(v) === "ko" ? "ko" : "en";
}

function normalizeCurrency(v: any): Currency {
  return String(v).toUpperCase() === "KRW" ? "KRW" : "USD";
}

function normalizePlan(
  server: ServerPlanDTO | null | undefined,
  fallback: { existing: Plan }
): Plan {
  const existing = fallback.existing;
  const timeZone =
    (server?.timeZone && String(server.timeZone)) ||
    existing.timeZone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC";

  const periodType: PlanPeriodType =
    (server?.periodType as PlanPeriodType | undefined) ||
    existing.periodType ||
    DEFAULT_PERIOD_TYPE;

  const language: Language =
    server?.language == null
      ? existing.language || "en"
      : normalizeLanguage(server.language);

  const currency: Currency =
    server?.currency != null
      ? normalizeCurrency(server.currency)
      : server?.homeCurrency != null
      ? normalizeCurrency(server.homeCurrency)
      : server?.displayCurrency != null
      ? normalizeCurrency(server.displayCurrency)
      : existing.currency || existing.displayCurrency || "USD";

  const homeCurrency: Currency =
    server?.homeCurrency != null
      ? normalizeCurrency(server.homeCurrency)
      : server?.currency != null
      ? currency
      : existing.homeCurrency;

  const displayCurrency: Currency =
    server?.displayCurrency != null
      ? normalizeCurrency(server.displayCurrency)
      : server?.currency != null
      ? currency
      : existing.displayCurrency;

  const periodStartUTC = server?.periodStartUTC || existing.periodStartUTC;
  const periodEndUTC = server?.periodEndUTC || existing.periodEndUTC;
  const periodAnchorUTC = server?.periodAnchorUTC || existing.periodAnchorUTC;

  const periodStartISO =
    periodStartUTC != null && String(periodStartUTC)
      ? deriveLocalISOFromUTCInstant(String(periodStartUTC), timeZone) ||
        String(periodStartUTC).slice(0, 10)
      : existing.periodStartISO;

  const periodEndISO =
    periodEndUTC != null && String(periodEndUTC)
      ? deriveLocalISOFromUTCInstant(String(periodEndUTC), timeZone) ||
        String(periodEndUTC).slice(0, 10)
      : existing.periodEndISO;

  const serverBudgetGoals = Array.isArray(server?.budgetGoals)
    ? server?.budgetGoals ?? []
    : [];
  const serverSavingsGoals = Array.isArray(server?.savingsGoals)
    ? server?.savingsGoals ?? []
    : [];

  const nextBudgetGoals = mergeBudgetGoalsWithDefaults(
    buildDefaultBudgetGoals(),
    serverBudgetGoals
  );
  const nextSavingsGoals = mergeSavingsGoals(
    existing.savingsGoals,
    serverSavingsGoals
  );

  const serverTotalClean = normalizePositiveInt(server?.totalBudgetLimitMinor);
  const computedTotal = sumBudgetLimits(nextBudgetGoals);
  const totalBudgetLimitMinor =
    serverTotalClean > 0 ? serverTotalClean : computedTotal;

  return {
    ...existing,
    periodType,
    currency,
    language,
    timeZone,
    periodStartISO,
    periodEndISO,
    periodStartUTC: periodStartUTC || existing.periodStartUTC,
    periodEndUTC: periodEndUTC || existing.periodEndUTC,
    periodAnchorUTC: periodAnchorUTC || existing.periodAnchorUTC,
    totalBudgetLimitMinor,
    // keep multi-currency fields aligned unless server provides something else
    homeCurrency,
    displayCurrency,
    budgetGoals: nextBudgetGoals,
    savingsGoals: nextSavingsGoals,
  };
}

function mergeBudgetGoalsWithDefaults(
  defaults: BudgetGoal[],
  serverGoals: {
    id?: string | null;
    category: string;
    limitMinor?: number | null;
  }[]
): BudgetGoal[] {
  // Map by normalized category key: { limit, id? }
  const byCat = new Map<string, { limit: number; id?: string }>();
  serverGoals.forEach((g) => {
    const cat = normalizeCategoryKey(g.category);
    const raw = g.limitMinor ?? 0;
    const limit = normalizePositiveInt(raw);
    const id = g.id ? String(g.id) : undefined;
    byCat.set(cat, { limit, id });
  });

  // Start with defaults (keeps ordering + stable IDs), but if server provides an id for
  // a default category we accept it.
  const merged: BudgetGoal[] = defaults.map((d) => {
    const key = normalizeCategoryKey(d.category);
    const hit = byCat.get(key);
    if (!hit) return d;

    return {
      ...d,
      // Keep client-stable IDs; accept server id if it exists
      id: hit.id || d.id,
      // Ensure category stays canonical
      category: key,
      limitMinor: hit.limit,
    };
  });

  // Append any server categories not in defaults
  byCat.forEach((val, cat) => {
    const exists = merged.some(
      (m) => normalizeCategoryKey(m.category) === normalizeCategoryKey(cat)
    );
    if (!exists) {
      const key = normalizeCategoryKey(cat);
      merged.push({
        id: val.id || stableIdForKey("budget", key),
        category: key,
        limitMinor: val.limit,
      });
    }
  });

  return merged;
}

function mergeSavingsGoals(
  current: SavingsGoal[],
  serverGoals: {
    id?: string | null;
    name: string;
    targetMinor?: number | null;
  }[]
): SavingsGoal[] {
  const byName = new Map<string, { target: number; id?: string }>();
  serverGoals.forEach((g) => {
    const name = normalizeName(g.name);
    const raw = g.targetMinor ?? 0;
    const target = normalizePositiveInt(raw);
    const id = g.id ? String(g.id) : undefined;
    byName.set(name, { target, id });
  });

  // Keep existing IDs when possible, otherwise accept server id, otherwise stable id.
  const merged: SavingsGoal[] = [];
  byName.forEach((val, name) => {
    const existing = current.find((x) => x.name === name);
    merged.push({
      id: existing?.id ?? val.id ?? stableIdForKey("savings", name),
      name,
      targetMinor: val.target,
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
  const { token } = useAuthStore();

  const makeInitialPlan = useCallback((): Plan => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const todayISO = toISODateInTimeZone(new Date(), tz);

    return {
      periodType: DEFAULT_PERIOD_TYPE,
      currency: DEFAULT_DISPLAY_CURRENCY,
      // Server-driven: we don't compute boundaries client-side.
      // Initialize with today's local date as a placeholder; will be replaced by server plan/bundle.
      periodStartISO: todayISO,
      periodEndISO: todayISO,
      homeCurrency: DEFAULT_HOME_CURRENCY,
      displayCurrency: DEFAULT_DISPLAY_CURRENCY,
      advancedCurrencyMode: false,
      language: "en",
      totalBudgetLimitMinor: 0,
      budgetGoals: buildDefaultBudgetGoals(),
      savingsGoals: [],
    };
  }, []);

  const [plan, setPlan] = useState<Plan>(() => makeInitialPlan());
  const [activePlanId, setActivePlanId] = useState<string | null>(null);

  // Keep module-level snapshot in sync for non-hook reads.
  useEffect(() => {
    _latestPlanSnapshot = { plan };
  }, [plan]);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const setErrorSafe = useCallback(() => {
    // planStore currently does not expose an error field; keep as a no-op for future.
  }, []);
  // `applyServerPlan` is memoized with [], so anything it calls can become stale.
  // Keep a ref to the latest rollover callback so we can trigger rollover right after
  // applying a server plan without stale-closure issues.
  const tryRolloverIfNeededRef = useRef<
    (reason: "launch" | "resume" | "period-switch" | "timer") => Promise<void>
  >(async () => {});

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
    const next: Language = lang === "ko" ? "ko" : "en";
    setPlan((p) => ({
      ...p,
      language: next,
    }));
  };

  const setPeriodType: Store["setPeriodType"] = (type) => {
    const nextType: PlanPeriodType = type ?? DEFAULT_PERIOD_TYPE;
    setPlan((p) => {
      return {
        ...p,
        periodType: nextType,
      };
    });
  };

  /**
   * ✅ applyServerPlan을 먼저 정의 (refreshPlan에서 참조하므로 순서 중요)
   * - deps는 []: setPlan(updater)만 사용하므로 stale problem 없음
   */
  const applyServerPlan: Store["applyServerPlan"] = useCallback(
    (serverPlan) => {
      const maybeId = serverPlan?.id;
      if (typeof maybeId === "string" && maybeId.trim()) {
        setActivePlanId(maybeId.trim());
      }

      setPlan((prev) => {
        const next = normalizePlan(serverPlan, { existing: prev });
        setTimeout(() => {
          void tryRolloverIfNeededRef.current("resume");
        }, 0);
        return next;
      });
    },
    []
  );

  const refreshPlan: Store["refreshPlan"] = useCallback(async () => {
    if (!token) {
      console.warn("[planStore] Missing auth token. Cannot refresh plan.");
      return false;
    }

    try {
      const resp = await plansApi.getActive(token);
      applyServerPlan(resp.plan);
      return true;
    } catch (err: any) {
      // If server reports no plan yet, create a default active plan.
      if (err?.status === 404) {
        try {
          const created = await plansApi.update(token, {
            periodType: DEFAULT_PERIOD_TYPE,
            setActive: true,
            useCurrentPeriod: true,
            currency: "USD",
            language: "en",
            totalBudgetLimitMinor: 0,
          });
          applyServerPlan(created.plan);
          return true;
        } catch (e) {
          console.warn("[planStore] Failed to create default plan", e);
          return false;
        }
      }

      console.error("[planStore] Error while refreshing plan", err);
      return false;
    }
  }, [applyServerPlan, token]);

  // ---------------------------------------------------------------------------
  // Global rollover orchestration (works from any screen)
  // Triggers:
  // - app launch (after first refreshPlan)
  // - foreground resume (AppState)
  // - period switch (after switchPeriodType applies new plan)
  // - optional: single timer when plan ends "today" (local day)
  // ---------------------------------------------------------------------------

  const rolloverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRolloverAttemptAtRef = useRef<number>(0);
  // Prevent duplicate rollover attempts for the same period end within a single app session
  const lastRolloverKeyRef = useRef<string | null>(null);

  const clearRolloverTimer = useCallback(() => {
    if (rolloverTimerRef.current) {
      clearTimeout(rolloverTimerRef.current);
      rolloverTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // When logging out, clear sensitive plan state and reset initialization.
    if (!token) {
      clearRolloverTimer();
      lastRolloverAttemptAtRef.current = 0;
      lastRolloverKeyRef.current = null;
      setErrorSafe();
      setPlan(makeInitialPlan());
      setIsInitialized(false);
      setIsLoading(false);
      return;
    }

    // When logging in (token becomes available), refresh the active plan.
    void refreshPlan();
  }, [token, clearRolloverTimer, makeInitialPlan, refreshPlan, setErrorSafe]);

  const postRollover = useCallback(async () => {
    if (!token) {
      throw new Error("Missing auth token");
    }
    return plansApi.rollover(token);
  }, [token]);

  const getUserTimeZone = useCallback((): string => {
    return (
      plan.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    );
  }, [plan.timeZone]);

  const isSameLocalDay = useCallback((a: Date, b: Date, timeZone: string) => {
    // Compare YYYY-MM-DD in the given IANA timezone
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(a) === fmt.format(b);
  }, []);

  const tryRolloverIfNeeded = useCallback(
    async (reason: "launch" | "resume" | "period-switch" | "timer") => {
      // Need server plan info first
      // initialize 중(isLoading=true)에도 launch 체크는 허용
      if (!isInitialized && !isLoading && reason !== "launch") {
        return;
      }

      const endISO = plan.periodEndUTC;
      if (!endISO) {
        return;
      }

      // Session-level de-dupe key (prevents repeated attempts for the same server period)
      const key = `${plan.periodType}|${plan.periodStartUTC ?? ""}|${endISO}`;
      if (lastRolloverKeyRef.current === key) {
        return;
      }

      const endMs = Date.parse(endISO);
      if (!Number.isFinite(endMs)) {
        return;
      }

      const nowMs = Date.now();

      // Only rollover after the plan has actually ended
      if (nowMs < endMs) {
        return;
      }

      // Cooldown (avoid spamming rollover calls)
      // For `timer`, allow it to proceed even if a recent resume check happened.
      // Same-key de-dupe still prevents double-rollover for the same period.
      if (
        reason !== "timer" &&
        nowMs - lastRolloverAttemptAtRef.current < 2 * 60 * 1000
      ) {
        return;
      }

      // Record this attempt only when we are actually eligible to rollover.
      lastRolloverAttemptAtRef.current = nowMs;

      // Mark key as in-flight for this session (prevents back-to-back double calls)
      lastRolloverKeyRef.current = key;

      try {
        const r = await postRollover();
        if (r?.rolled) {
          await refreshPlan();
        } else {
          // If server says nothing rolled, allow a future attempt (e.g., if clocks differ)
          if (lastRolloverKeyRef.current === key)
            lastRolloverKeyRef.current = null;
        }
      } catch (e) {
        // On failure, release the key so a later resume/timer can retry
        if (lastRolloverKeyRef.current === key)
          lastRolloverKeyRef.current = null;
        console.warn(`[planStore] rollover failed (${reason})`, e);
      }
    },
    [
      isInitialized,
      isLoading,
      plan.periodType,
      plan.periodStartUTC,
      plan.periodEndUTC,
      postRollover,
      refreshPlan,
    ]
  );

  useEffect(() => {
    tryRolloverIfNeededRef.current = tryRolloverIfNeeded;
  }, [tryRolloverIfNeeded]);

  const scheduleRolloverTimerIfNeeded = useCallback(() => {
    clearRolloverTimer();

    if (!isInitialized) return;

    const endISO = plan.periodEndUTC;
    if (!endISO) return;

    const endMs = Date.parse(endISO);
    if (!Number.isFinite(endMs)) return;

    const nowMs = Date.now();
    if (nowMs >= endMs) return; // already ended; resume/launch will catch it

    // Schedule only if it ends "today" (local day) AND app is foreground
    const tz = getUserTimeZone();
    const now = new Date(nowMs);
    const end = new Date(endMs);

    if (!isSameLocalDay(now, end, tz)) return;
    if (AppState.currentState !== "active") return;

    const delay = Math.max(0, endMs - nowMs);
    // Small jitter helps avoid edge timing issues at the exact boundary
    const jitter = 2000;

    rolloverTimerRef.current = setTimeout(() => {
      tryRolloverIfNeeded("timer");
    }, delay + jitter);
  }, [
    clearRolloverTimer,
    getUserTimeZone,
    isInitialized,
    isSameLocalDay,
    plan.periodEndUTC,
    tryRolloverIfNeeded,
  ]);

  // Foreground resume trigger
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === "active") {
        tryRolloverIfNeeded("resume");
        scheduleRolloverTimerIfNeeded();
      } else {
        clearRolloverTimer();
      }
    };

    const sub = AppState.addEventListener("change", onChange);
    return () => {
      sub.remove();
      clearRolloverTimer();
    };
  }, [clearRolloverTimer, scheduleRolloverTimerIfNeeded, tryRolloverIfNeeded]);

  // Reschedule timer whenever active plan changes
  useEffect(() => {
    scheduleRolloverTimerIfNeeded();
  }, [
    plan.periodType,
    plan.periodStartISO,
    plan.periodEndUTC,
    scheduleRolloverTimerIfNeeded,
  ]);

  const switchPlanCurrency = useCallback(
    async (nextCurrency: "USD" | "KRW") => {
      if (!token) {
        console.warn(
          "[planStore] Missing auth token. Cannot switch plan currency."
        );
        return false;
      }

      const currentType: PlanPeriodType = (plan.periodType ??
        DEFAULT_PERIOD_TYPE) as PlanPeriodType;

      try {
        if (activePlanId) {
          const dto: SwitchCurrencyRequestDTO = {
            periodType: currentType,
            currency: nextCurrency,
          };
          const resp = await plansApi.switchCurrency(token, activePlanId, dto);
          applyServerPlan(resp.plan);
          return true;
        }

        // Fallback: patch active plan until we know planId
        const serverPlan = await plansApi.update(token, {
          periodType: currentType,
          setActive: true,
          useCurrentPeriod: true,
          currency: nextCurrency,
          language: plan.language ?? "en",
          totalBudgetLimitMinor: plan.totalBudgetLimitMinor ?? 0,
        });
        applyServerPlan(serverPlan.plan);

        return true;
      } catch (err) {
        console.error("[planStore] switchPlanCurrency error", err);
        return false;
      }
    },
    [plan, activePlanId, applyServerPlan, token]
  );

  const switchPeriodType: Store["switchPeriodType"] = useCallback(
    async (type) => {
      const nextType: PlanPeriodType = (type ??
        DEFAULT_PERIOD_TYPE) as PlanPeriodType;

      if (!token) {
        console.warn(
          "[planStore] Missing auth token. Cannot switch period type."
        );
        return false;
      }

      const body: PatchPlanDTO = {
        periodType: nextType,
        setActive: true,
        useCurrentPeriod: true,
        // keep user preferences when switching
        // currency: plan.homeCurrency,
        language: plan.language ?? "en",
        totalBudgetLimitMinor: plan.totalBudgetLimitMinor ?? 0,
      } as any;

      try {
        const serverPlan = await plansApi.update(token, body);
        applyServerPlan(serverPlan.plan);

        return true;
      } catch (err) {
        console.error("[planStore] Error while switching period type", err);
        return false;
      }
    },
    [plan, applyServerPlan, token]
  );

  const refreshPeriodIfNeeded: Store["refreshPeriodIfNeeded"] =
    useCallback(() => {
      setPlan((p) => {
        // Server-driven: keep UI date-only fields in sync with server UTC instants.
        const tz =
          p.timeZone ||
          Intl.DateTimeFormat().resolvedOptions().timeZone ||
          "UTC";

        // If plan already ended, do nothing here. Rollover logic will create/apply next plan.
        if (p.periodEndUTC) {
          const endMs = Date.parse(p.periodEndUTC);
          if (Number.isFinite(endMs) && Date.now() >= endMs) {
            return p;
          }
        }

        const nextStartISO = p.periodStartUTC
          ? deriveLocalISOFromUTCInstant(p.periodStartUTC, tz)
          : "";
        const nextEndISO = p.periodEndUTC
          ? deriveLocalISOFromUTCInstant(p.periodEndUTC, tz)
          : "";

        if (!nextStartISO && !nextEndISO) return p;
        if (
          (!nextStartISO || p.periodStartISO === nextStartISO) &&
          (!nextEndISO || (p as any).periodEndISO === nextEndISO)
        )
          return p;

        return {
          ...p,
          periodStartISO: nextStartISO || p.periodStartISO,
          periodEndISO: nextEndISO || (p as any).periodEndISO,
        };
      });
    }, []);

  const initialize: Store["initialize"] = useCallback(async () => {
    if (isInitialized || isLoading) return;
    if (!token) {
      // Not authenticated yet; wait for login.
      return;
    }
    setIsLoading(true);
    try {
      // 1) 클라이언트 기준 기간 보정 (UI용)
      refreshPeriodIfNeeded();

      // 2) 서버 plan 로드 (중복 요청 제거)
      await refreshPlan();

      // 3) 이미 기간이 끝났으면 즉시 rollover (앱 진입 시)
      await tryRolloverIfNeeded("launch");
    } finally {
      setIsLoading(false);
      setIsInitialized(true);
    }
  }, [
    isInitialized,
    isLoading,
    token,
    refreshPeriodIfNeeded,
    refreshPlan,
    tryRolloverIfNeeded,
  ]);

  useEffect(() => {
    refreshPeriodIfNeeded();
  }, [refreshPeriodIfNeeded]);

  const upsertBudgetGoalLimit: Store["upsertBudgetGoalLimit"] = (
    category,
    limitMinor
  ) => {
    const cat = normalizeCategoryKey(category);
    const cleanLimit = Math.max(
      0,
      Number.isFinite(limitMinor) ? Math.round(limitMinor) : 0
    );

    setPlan((p) => {
      // Compare using normalized keys to avoid casing mismatches
      const idx = p.budgetGoals.findIndex(
        (g) => normalizeCategoryKey(g.category) === cat
      );

      let nextGoals = p.budgetGoals;

      if (idx >= 0) {
        nextGoals = p.budgetGoals.slice();
        nextGoals[idx] = {
          ...nextGoals[idx],
          category: cat,
          limitMinor: cleanLimit,
        };
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

      const nextPlan = {
        ...p,
        budgetGoals: nextGoals,
        totalBudgetLimitMinor: total,
      };

      // IMPORTANT: keep module-level snapshot in sync immediately.
      // useEffect runs after render, so without this an immediate save can read stale goals.
      _latestPlanSnapshot = { plan: nextPlan };

      return nextPlan;
    });
  };
  const saveBudgetGoals: Store["saveBudgetGoals"] = useCallback(async () => {
    if (!token) {
      console.warn("[planStore] Missing auth token. Cannot save budget goals.");
      return false;
    }

    // Build from the freshest snapshot to avoid stale-closure/state timing issues
    // (e.g., saving immediately after `upsertBudgetGoalLimit`)
    const latest = getPlanState()?.plan ?? plan;

    const payload: PatchBudgetGoalsRequestDTO = {
      budgetGoals: (latest.budgetGoals ?? []).map((g) => ({
        category: normalizeCategoryKey(g.category),
        limitMinor: Math.max(0, Math.trunc(Number(g.limitMinor) || 0)),
      })),
    };

    console.log(
      "[planStore] PATCH budget goals payload:",
      JSON.stringify(payload)
    );

    try {
      if (activePlanId) {
        const resp = await plansApi.patchBudgetGoals(
          token,
          activePlanId,
          payload
        );
        if (resp?.plan) {
          applyServerPlan(resp.plan);
        }
        return true;
      }

      // Fallback: patch the active plan via /api/plans (until we know planId)
      const latest = getPlanState()?.plan ?? plan;
      const resp = await plansApi.update(token, {
        periodType: latest.periodType,
        budgetGoals: payload.budgetGoals.map((g) => ({
          category: g.category,
          limitMinor: g.limitMinor,
        })),
        setActive: true,
        useCurrentPeriod: true,
      } as any);
      applyServerPlan(resp.plan);
      return true;
    } catch (e) {
      console.warn("[planStore] saveBudgetGoals error", e);
      return false;
    }
  }, [token, plan.budgetGoals, plan.periodType, activePlanId, applyServerPlan]);

  const saveBudgetGoal: Store["saveBudgetGoal"] = useCallback(
    async (category, limitMinor) => {
      if (!token) {
        console.warn(
          "[planStore] Missing auth token. Cannot save budget goal."
        );
        return false;
      }

      const planId = activePlanId;
      if (!planId) {
        // If we don't know planId yet, fall back to bulk save.
        return saveBudgetGoals();
      }

      const payload = {
        category: normalizeCategoryKey(category),
        limitMinor: Math.max(0, Math.trunc(Number(limitMinor) || 0)),
      };

      console.log(
        "[planStore] POST budget goal payload:",
        JSON.stringify(payload)
      );

      try {
        const resp = await plansApi.upsertBudgetGoal(token, planId, payload);
        if (resp?.plan) {
          applyServerPlan(resp.plan);
        }
        return true;
      } catch (e) {
        console.warn("[planStore] saveBudgetGoal error", e);
        return false;
      }
    },
    [token, activePlanId, applyServerPlan, saveBudgetGoals]
  );

  const saveSavingsGoals: Store["saveSavingsGoals"] = useCallback(async () => {
    if (!token) {
      console.warn(
        "[planStore] Missing auth token. Cannot save savings goals."
      );
      return false;
    }

    // Build from the freshest snapshot to avoid stale-closure/state timing issues
    // (e.g., saving immediately after `upsertSavingsGoalTarget`)
    const latest = getPlanState()?.plan ?? plan;

    const payload: PatchSavingsGoalsRequestDTO = {
      savingsGoals: (latest.savingsGoals ?? []).map((g) => ({
        name: normalizeName(g.name),
        targetMinor: Math.max(0, Math.trunc(Number(g.targetMinor) || 0)),
      })),
    };

    console.log(
      "[planStore] PATCH savings goals payload:",
      JSON.stringify(payload)
    );

    try {
      if (activePlanId) {
        const resp = await plansApi.patchSavingsGoals(
          token,
          activePlanId,
          payload
        );
        if (resp?.plan) {
          applyServerPlan(resp.plan);
        }
        return true;
      }

      // Fallback: patch the active plan via /api/plans (until we know planId)
      const resp = await plansApi.update(token, {
        periodType: latest.periodType,
        savingsGoals: payload.savingsGoals.map((g) => ({
          name: g.name,
          targetMinor: g.targetMinor,
        })),
        setActive: true,
        useCurrentPeriod: true,
      } as any);
      applyServerPlan(resp.plan);
      return true;
    } catch (e) {
      console.warn("[planStore] saveSavingsGoals error", e);
      return false;
    }
  }, [token, plan, activePlanId, applyServerPlan]);

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

        const nextPlan = { ...p, savingsGoals: next };
        _latestPlanSnapshot = { plan: nextPlan };
        return nextPlan;
      }

      if (clean <= 0) return p;

      const nextPlan = {
        ...p,
        savingsGoals: [
          ...p.savingsGoals,
          { id: uid(), name: n, targetMinor: clean },
        ],
      };

      _latestPlanSnapshot = { plan: nextPlan };
      return nextPlan;
    });
  };

  const addSavingsGoal: Store["addSavingsGoal"] = (name, targetMinor) => {
    const n = (name || "").trim();
    const t = Math.max(
      0,
      Number.isFinite(targetMinor) ? Math.round(targetMinor) : 0
    );
    if (!n || t <= 0) return;

    setPlan((p) => {
      const nextPlan = {
        ...p,
        savingsGoals: [
          ...p.savingsGoals,
          { id: uid(), name: n, targetMinor: t },
        ],
      };
      _latestPlanSnapshot = { plan: nextPlan };
      return nextPlan;
    });
  };

  const removeSavingsGoal: Store["removeSavingsGoal"] = (id) => {
    setPlan((p) => {
      const nextPlan = {
        ...p,
        savingsGoals: p.savingsGoals.filter((g) => g.id !== id),
      };
      _latestPlanSnapshot = { plan: nextPlan };
      return nextPlan;
    });
  };

  const applyBootstrapPlan: Store["applyBootstrapPlan"] = useCallback(
    (bootstrap) => {
      const planCandidate =
        bootstrap?.activePlan ??
        bootstrap?.plan ??
        bootstrap?.data?.activePlan ??
        bootstrap?.data?.plan ??
        null;

      if (planCandidate) {
        applyServerPlan(planCandidate);
        setIsInitialized(true);
      } else {
        // If bootstrap doesn't include a plan, keep app usable but mark initialized to unblock UI.
        setIsInitialized(true);
      }
    },
    [applyServerPlan]
  );

  const store = useMemo<Store>(
    () => ({
      plan,
      activePlanId,
      saveBudgetGoals,
      saveBudgetGoal,
      saveSavingsGoals,
      refreshPlan,
      setPeriodType,
      switchPeriodType,
      switchPlanCurrency,
      refreshPeriodIfNeeded,
      homeCurrency: plan.homeCurrency,
      displayCurrency: plan.displayCurrency,
      advancedCurrencyMode: !!plan.advancedCurrencyMode,
      language: (plan.language ?? "en") as Language,
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
      applyBootstrapPlan,
      isInitialized,
      isLoading,
      initialize,
    }),
    [
      plan,
      activePlanId,
      saveBudgetGoals,
      saveBudgetGoal,
      saveSavingsGoals,
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
      applyBootstrapPlan,
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

// Back-compat type aliases (some screens import these from planStore)
export type PeriodType = PlanPeriodType;
export type UILanguage = Language;
