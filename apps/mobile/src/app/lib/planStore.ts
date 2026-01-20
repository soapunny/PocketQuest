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
  // Server-source-of-truth period boundaries (UTC instants as ISO strings)
  periodStartUTC?: string;
  periodEndUTC?: string;

  // For BIWEEKLY, server may provide an anchor instant (UTC ISO)
  periodAnchorUTC?: string;
  // Optional timezone (IANA). If not provided by server, device timezone is used.
  timeZone?: string;

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

    // server may send period end under either key
    periodEndUTC?: string;
    periodEnd?: string;

    periodAnchorUTC?: string;
    periodAnchor?: string;

    // optional user timezone
    timeZone?: string;

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

// BIWEEKLY 기준일(로컬 날짜, 월요일 시작). 서버/클라이언트 공통 기본값.
export const DEFAULT_BIWEEKLY_ANCHOR_ISO = "2025-01-06";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function toISODate(d: Date) {
  // Date-only ISO (YYYY-MM-DD)
  return d.toISOString().slice(0, 10);
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
    const raw = g.targetMinor ?? 0;
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

      const timeZone = (serverPlan as any)?.timeZone
      ? String((serverPlan as any).timeZone)
      : undefined;

      const periodStartUTC = (
        serverPlan?.periodStartUTC ?? (serverPlan as any)?.periodStart ?? ""
      ).toString();

      const periodEndUTC = (
        (serverPlan as any)?.periodEndUTC ?? (serverPlan as any)?.periodEnd ?? ""
      ).toString();

      const periodAnchorUTC = (
        (serverPlan as any)?.periodAnchorUTC ??
        (serverPlan as any)?.periodAnchor ??
        ""
      ).toString();

      // Derive YYYY-MM-DD strings for UI from UTC instants when possible
      const tzForDerive =
        timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

      const startDt = safeParseISODateTime(periodStartUTC);
      const derivedStartISO = startDt ? toISODateInTimeZone(startDt, tzForDerive) : "";

      const anchorDt = safeParseISODateTime(periodAnchorUTC);
      const derivedAnchorISO = anchorDt ? toISODateInTimeZone(anchorDt, tzForDerive) : "";

      const periodStartISO =
        derivedStartISO || (periodStartUTC ? periodStartUTC.slice(0, 10) : "");

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

        const next = {
          ...p,
          periodType,
          periodAnchorISO:
            periodType === "BIWEEKLY" && derivedAnchorISO
              ? derivedAnchorISO
              : p.periodAnchorISO,
          periodStartISO: nextPeriodStartISO,
          periodStartUTC: periodStartUTC || p.periodStartUTC,
          periodEndUTC: periodEndUTC || p.periodEndUTC,
          periodAnchorUTC: periodAnchorUTC || p.periodAnchorUTC,
          timeZone: timeZone ?? p.timeZone,
          weekStartISO: periodType === "WEEKLY" ? nextPeriodStartISO : p.weekStartISO,
          totalBudgetLimitMinor,
          homeCurrency: serverPlan.homeCurrency ?? serverPlan.currency ?? p.homeCurrency,
          displayCurrency:
            serverPlan.displayCurrency ?? serverPlan.currency ?? p.displayCurrency,
          budgetGoals: nextBudgetGoals,
          savingsGoals: nextSavingsGoals,
        };
        
        console.log("[applyServerPlan] applied:", {
          periodType: next.periodType,
          currencyFromServer: serverPlan.currency,
          homeCurrency: next.homeCurrency,
          displayCurrency: next.displayCurrency,
          periodStartUTC: next.periodStartUTC,
          periodEndUTC: next.periodEndUTC,
          timeZone: next.timeZone,
        });
        
        console.log("[planStore] post-apply rollover check queued");

        setTimeout(() => {
          console.log("[planStore] post-apply rollover check running");
          void tryRolloverIfNeededRef.current("resume");
        }, 0);
        
        return next;
      });
    },
    []
  );

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
        periodEndUTC: raw?.periodEndUTC ?? raw?.periodEnd,
        periodAnchorUTC: raw?.periodAnchorUTC ?? raw?.periodAnchor,
        timeZone: raw?.timeZone,
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

      console.log("[switchPeriodType] server raw:", {
        periodType: raw?.periodType,
        currency: raw?.currency,
        periodStartUTC: raw?.periodStartUTC ?? raw?.periodStart,
        periodEndUTC: raw?.periodEndUTC ?? raw?.periodEnd,
        timeZone: raw?.timeZone,
        periodAnchorUTC: raw?.periodAnchorUTC ?? raw?.periodAnchor,
      });
      applyRawPlan(raw);
      return true;
    } catch (err) {
      console.error("[planStore] Error while refreshing plan", err);
      return false;
    }
  }, [applyServerPlan]);

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

  const postRollover = useCallback(async () => {
    const endpoint = `${API_BASE_URL}/api/plans/rollover`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-dev-user-id": DEV_USER_ID,
    };

    const res = await fetch(endpoint, { method: "POST", headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`rollover failed: ${res.status} ${text}`);
    }
    return res.json();
  }, []);

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
        console.log("[planStore] rollover skip (not ready)", {
          reason,
          isInitialized,
          isLoading,
        });
        return;
      }

      const endISO = plan.periodEndUTC;
      if (!endISO) {
        console.log("[planStore] rollover skip (no periodEndUTC)", { reason });
        return;
      }

      // Session-level de-dupe key (prevents repeated attempts for the same server period)
      const key = `${plan.periodType}|${plan.periodStartUTC ?? ""}|${endISO}`;
      if (lastRolloverKeyRef.current === key) {
        console.log("[planStore] rollover skip (same key)", { reason, key });
        return;
      }

      // Cooldown (avoid spamming rollover calls)
      // For `timer`, allow it to proceed even if a recent resume check happened.
      // Same-key de-dupe still prevents double-rollover for the same period.
      const nowMs = Date.now();
      if (
        reason !== "timer" &&
        nowMs - lastRolloverAttemptAtRef.current < 2 * 60 * 1000
      ) {
        console.log("[planStore] rollover skip (cooldown)", {
          reason,
          msSinceLast: nowMs - lastRolloverAttemptAtRef.current,
        });
        return;
      }
      lastRolloverAttemptAtRef.current = nowMs;

      const endMs = Date.parse(endISO);
      if (!Number.isFinite(endMs)) {
        console.log("[planStore] rollover skip (bad endMs)", {
          reason,
          endISO,
        });
        return;
      }

      // Only rollover after the plan has actually ended
      const now = Date.now();
      if (now < endMs) {
        console.log("[planStore] rollover skip (not ended yet)", {
          reason,
          endISO,
          msUntilEnd: endMs - now,
        });
        return;
      }

      // Mark key as in-flight for this session (prevents back-to-back double calls)
      lastRolloverKeyRef.current = key;

      console.log("[planStore] rollover attempt", {
        reason,
        key,
        endISO,
      });

      try {
        const r = await postRollover();
        console.log("[planStore] rollover response", {
          reason,
          key,
          rolled: !!r?.rolled,
        });

        if (r?.rolled) {
          await refreshPlan();
        } else {
          // If server says nothing rolled, allow a future attempt (e.g., if clocks differ)
          if (lastRolloverKeyRef.current === key) lastRolloverKeyRef.current = null;
        }
      } catch (e) {
        // On failure, release the key so a later resume/timer can retry
        if (lastRolloverKeyRef.current === key) lastRolloverKeyRef.current = null;
        console.warn(`[planStore] rollover failed (${reason})`, e);
      }
    },
    [isInitialized, isLoading, plan.periodType, plan.periodStartUTC, plan.periodEndUTC, postRollover, refreshPlan]
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
          periodEndUTC: raw?.periodEndUTC ?? raw?.periodEnd,
          periodAnchorUTC: raw?.periodAnchorUTC ?? raw?.periodAnchor,
          timeZone: raw?.timeZone,
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
          periodEndUTC: raw?.periodEndUTC ?? raw?.periodEnd,
          periodAnchorUTC: raw?.periodAnchorUTC ?? raw?.periodAnchor,
          timeZone: raw?.timeZone,
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

  const refreshPeriodIfNeeded: Store["refreshPeriodIfNeeded"] = useCallback(() => {
    setPlan((p) => {
      // If server provided precise UTC bounds, don't "recompute" locally.
      // We only keep UI date-only fields in sync with the server boundaries.
      const tz = p.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

      // If plan already ended, do nothing here. Rollover logic will create/apply next plan.
      if (p.periodEndUTC) {
        const endMs = Date.parse(p.periodEndUTC);
        if (Number.isFinite(endMs) && Date.now() >= endMs) {
          return p;
        }
      }

      if (p.periodStartUTC) {
        const startDt = safeParseISODateTime(p.periodStartUTC);
        if (!startDt) return p;

        const expectedStartISO = toISODateInTimeZone(startDt, tz);
        if (!expectedStartISO || p.periodStartISO === expectedStartISO) return p;

        return {
          ...p,
          periodStartISO: expectedStartISO,
          // Keep legacy field aligned for WEEKLY
          weekStartISO: p.periodType === "WEEKLY" ? expectedStartISO : p.weekStartISO,
        };
      }

      // Fallback: older flows before server boundaries were standardized.
      const expectedStartISO = periodStartFrom(
        p.periodType,
        new Date(),
        p.periodAnchorISO ?? DEFAULT_BIWEEKLY_ANCHOR_ISO
      );

      if (p.periodStartISO === expectedStartISO) return p;

      return {
        ...p,
        periodStartISO: expectedStartISO,
        weekStartISO: p.periodType === "WEEKLY" ? expectedStartISO : p.weekStartISO,
      };
    });
  }, []);

  const initialize: Store["initialize"] = useCallback(async () => {
    if (isInitialized || isLoading) return;
    setIsLoading(true);
    try {
      // 1) 클라이언트 기준 기간 보정 (UI용)
      refreshPeriodIfNeeded();

      // 2) 서버 plan 로드 (중복 fetch 제거)
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
