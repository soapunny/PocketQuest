import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";

import { usePlan, getPlanState } from "../lib/planStore";
import { patchPlan, upsertPlan } from "../lib/api/plans";
import { useTransactions } from "../lib/transactionsStore";
import { EXPENSE_CATEGORIES, SAVINGS_GOALS } from "../lib/categories";

import {
  computePlanProgressPercent,
  getPlanPeriodRange,
  isISOInRange,
} from "../lib/planProgress";

import type { Currency } from "../lib/currency";
import { convertMinor, formatMoney, parseInputToMinor } from "../lib/currency";
import { CardSpacing } from "../components/Typography";
import ScreenHeader from "../components/layout/ScreenHeader";
import ScreenLayout from "../components/layout/ScreenLayout";

// DEV logging and warning helpers
const DEBUG_PLAN = __DEV__;
const dlog = (...args: any[]) => {
  if (DEBUG_PLAN) console.log(...args);
};

let __warnedPlanDev = false;
function warnPlanDevOnce(msg: string) {
  if (__DEV__ && !__warnedPlanDev) {
    __warnedPlanDev = true;
    console.warn(msg);
  }
}

function absMinor(n: any) {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.abs(v);
}

function txToHomeMinor(tx: any, homeCurrency: Currency): number {
  const currency: Currency = tx?.currency === "KRW" ? "KRW" : "USD";

  // Prefer new field; fallback to legacy amountCents
  const amountMinor =
    typeof tx?.amountMinor === "number"
      ? tx.amountMinor
      : typeof tx?.amountCents === "number"
        ? tx.amountCents
        : 0;

  const absAmount = absMinor(amountMinor);
  if (currency === homeCurrency) return absAmount;

  const fx = typeof tx?.fxUsdKrw === "number" ? tx.fxUsdKrw : NaN;
  if (!Number.isFinite(fx) || fx <= 0) return 0;

  return absMinor(convertMinor(absAmount, currency, homeCurrency, fx));
}

function placeholderForCurrency(currency: Currency) {
  return currency === "KRW" ? "0" : "0.00";
}

function currencyPrefix(currency: Currency) {
  return currency === "KRW" ? "₩" : "$";
}

function formatMoneyNoSymbol(minor: number, currency: Currency) {
  const s = formatMoney(minor, currency);
  if (currency === "KRW") return s.replace(/^₩\s?/, "");
  return s.replace(/^\$\s?/, "");
}

export default function PlanScreen() {
  const {
    plan,
    homeCurrency,
    upsertBudgetGoalLimit,
    upsertSavingsGoalTarget,
    applyServerPlan,
  } = usePlan();
  // Keep isKo/tr logic as-is for translation
  const isKo = (plan as any)?.language === "ko" || false;
  const tr = (en: string, ko: string) => (isKo ? ko : en);
  const baseCurrency: Currency = ((plan as any)?.currency ??
    homeCurrency ??
    (plan as any).homeCurrency ??
    "USD") as Currency;
  const { transactions } = useTransactions();

  // DEV ONLY: read from Expo public env so 각자 로컬 .env.development에서 설정 가능
  // 예: EXPO_PUBLIC_DEV_USER_ID=cmjw3lb0d000076zuddg5lo6o
  const DEV_USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID;
  const [serverHydrating, setServerHydrating] = useState(true);

  const lastHydrateKeyRef = useRef<string>("");

  const { startISO, endISO, type } = useMemo(
    () => getPlanPeriodRange(plan as any),
    [plan],
  );

  const periodStartUTC = useMemo(() => {
    const fromPlan = String((plan as any)?.periodStartUTC || "");
    if (fromPlan) return fromPlan;
    return new Date(String(startISO || new Date().toISOString())).toISOString();
  }, [plan, startISO]);

  const periodAnchorUTC = useMemo(() => {
    const fromPlan = String((plan as any)?.periodAnchorUTC || "");
    if (fromPlan) return fromPlan;

    // For biweekly, if no anchor is present yet, use the current period start as the anchor.
    if (type === "BIWEEKLY") return periodStartUTC;

    return "";
  }, [plan, type, periodStartUTC]);

  // Initial server sync (period-aware)
  useEffect(() => {
    let mounted = true;
    const hydrateKey = `${type}|${startISO || ""}`;
    if (lastHydrateKeyRef.current === hydrateKey) return;
    lastHydrateKeyRef.current = hydrateKey;

    const load = async () => {
      try {
        setServerHydrating(true);
        // Hydrate the server plan that matches the currently selected period
        if (__DEV__ && !DEV_USER_ID) {
          warnPlanDevOnce(
            "[PlanScreen] Missing EXPO_PUBLIC_DEV_USER_ID. Skipping server hydration in DEV.",
          );
          return;
        }

        const res: any = await upsertPlan({
          userId: DEV_USER_ID,
          periodType: type as any,
          periodStartUTC,
          ...(type === "BIWEEKLY"
            ? {
                // Server requires an anchor for biweekly boundaries.
                periodAnchorUTC: periodAnchorUTC || periodStartUTC,
              }
            : {}),
        });
        if (!mounted) return;

        const sp = res?.plan;
        if (!sp) return;

        // Normalize server fields -> app store shape
        const budgetGoals = Array.isArray(sp.budgetGoals)
          ? sp.budgetGoals.map((g: any) => ({
              category: String(g.category ?? "Other"),
              // server uses limitMinor
              limitMinor: Number(g.limitMinor ?? 0),
            }))
          : [];

        const savingsGoals = Array.isArray(sp.savingsGoals)
          ? sp.savingsGoals.map((g: any) => ({
              name: String(g.name ?? "Other"),
              // server uses targetMinor
              targetMinor: Number(g.targetMinor ?? 0),
            }))
          : [];

        applyServerPlan({
          currency: sp.currency,
          timeZone: sp.timeZone,
          language: sp.language,
          periodType: sp.periodType,
          periodStartUTC: sp.periodStartUTC ?? sp.periodStart,
          periodAnchorUTC: sp.periodAnchorUTC ?? sp.periodAnchor ?? null,
          totalBudgetLimitMinor: sp.totalBudgetLimitMinor,
          budgetGoals,
          savingsGoals,
        });

        dlog("[PlanScreen] server response raw", sp);
        dlog(
          "[PlanScreen] server response goals",
          sp?.budgetGoals,
          sp?.savingsGoals,
        );
      } catch (e) {
        // OK to fail quietly when server is offline
        dlog("[Plan] initial load failed", e);
      } finally {
        if (mounted) setServerHydrating(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [applyServerPlan, plan, startISO, type, periodStartUTC, periodAnchorUTC]);

  const periodLabel =
    type === "MONTHLY"
      ? tr("Monthly", "월간")
      : type === "BIWEEKLY"
        ? tr("Bi-weekly", "2주")
        : tr("Weekly", "주간");

  const periodText =
    type === "MONTHLY"
      ? tr("this month", "이번 달")
      : type === "BIWEEKLY"
        ? tr("this 2 weeks", "이번 2주")
        : tr("this week", "이번 주");

  const periodTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const iso = String(
        (t as any).dateISO ??
          (t as any).occurredAtISO ??
          (t as any).createdAtISO ??
          (t as any).createdAt ??
          "",
      );
      if (!iso) return false;
      return isISOInRange(iso, startISO, endISO);
    });
  }, [transactions, startISO, endISO]);

  const [selectedCategory, setSelectedCategory] = useState<string>(
    EXPENSE_CATEGORIES[0],
  );
  const [selectedLimit, setSelectedLimit] = useState("");
  const [savingBudgetGoal, setSavingBudgetGoal] = useState(false);

  const [selectedSavingsGoal, setSelectedSavingsGoal] = useState<string>(
    SAVINGS_GOALS[0],
  );
  const [selectedSavingsTarget, setSelectedSavingsTarget] = useState("");
  const [savingSavingsGoal, setSavingSavingsGoal] = useState(false);

  useEffect(() => {
    const g = plan.budgetGoals.find((x) => x.category === selectedCategory);
    setSelectedLimit(
      g && g.limitMinor > 0
        ? formatMoneyNoSymbol(g.limitMinor, baseCurrency)
        : "",
    );
  }, [selectedCategory, plan.budgetGoals, baseCurrency]);

  useEffect(() => {
    const g = plan.savingsGoals.find((x) => x.name === selectedSavingsGoal);
    setSelectedSavingsTarget(
      g && g.targetMinor > 0
        ? formatMoneyNoSymbol(g.targetMinor, baseCurrency)
        : "",
    );
  }, [selectedSavingsGoal, plan.savingsGoals, baseCurrency]);

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of periodTransactions) {
      if (tx.type !== "EXPENSE") continue;
      const key = String((tx as any).category ?? "Other");
      map.set(key, (map.get(key) || 0) + txToHomeMinor(tx, baseCurrency));
    }
    return map;
  }, [periodTransactions, baseCurrency]);

  const totalSpentMinor = useMemo(() => {
    let sum = 0;
    for (const tx of periodTransactions) {
      if (tx.type !== "EXPENSE") continue;
      sum += txToHomeMinor(tx, baseCurrency);
    }
    return sum;
  }, [periodTransactions, baseCurrency]);

  const savedByGoal = useMemo(() => {
    const map = new Map<string, number>();

    for (const tx of periodTransactions) {
      if (tx.type !== "SAVING") continue; // 저축 타입만
      const goalName = String((tx as any).category || "Other");
      map.set(
        goalName,
        (map.get(goalName) || 0) + txToHomeMinor(tx, baseCurrency),
      );
    }

    return map;
  }, [periodTransactions, baseCurrency]);

  const progressPercent = useMemo(() => {
    return computePlanProgressPercent(plan as any, transactions);
  }, [plan, transactions]);

  const applyServerResponse = (res: any) => {
    const sp: any = res?.plan;
    if (!sp) return;

    // 서버에서 내려온 "부분 goals"을 기존 plan과 merge
    const latest = getPlanState();
    const currentBudget = Array.isArray(latest?.plan?.budgetGoals)
      ? latest.plan.budgetGoals
      : [];
    const currentSavings = Array.isArray(latest?.plan?.savingsGoals)
      ? latest.plan.savingsGoals
      : [];

    const incomingBudget = Array.isArray(sp?.budgetGoals)
      ? sp.budgetGoals.map((g: any) => ({
          category: String(g.category ?? "Other"),
          limitMinor: Number(g.limitMinor ?? 0),
        }))
      : [];

    const incomingSavings = Array.isArray(sp?.savingsGoals)
      ? sp.savingsGoals.map((g: any) => ({
          name: String(g.name ?? "Other"),
          targetMinor: Number(g.targetMinor ?? 0),
        }))
      : [];

    // merge budgetGoals by category
    const budgetMap = new Map<
      string,
      { category: string; limitMinor: number }
    >();
    for (const g of currentBudget) budgetMap.set(g.category, { ...g });
    for (const g of incomingBudget) {
      if ((g.limitMinor ?? 0) <= 0) budgetMap.delete(g.category);
      else budgetMap.set(g.category, g);
    }

    // merge savingsGoals by name
    const savingsMap = new Map<string, { name: string; targetMinor: number }>();
    for (const g of currentSavings) savingsMap.set(g.name, { ...g });
    for (const g of incomingSavings) {
      if ((g.targetMinor ?? 0) <= 0) savingsMap.delete(g.name);
      else savingsMap.set(g.name, g);
    }

    applyServerPlan({
      currency: sp.currency,
      timeZone: sp.timeZone,
      language: sp.language,
      periodType: sp.periodType,
      periodStartUTC: sp.periodStartUTC ?? sp.periodStart,
      periodAnchorUTC: sp.periodAnchorUTC ?? sp.periodAnchor ?? null,
      totalBudgetLimitMinor: sp.totalBudgetLimitMinor,
      budgetGoals: Array.from(budgetMap.values()),
      savingsGoals: Array.from(savingsMap.values()),
    });
  };

  const saveSelectedCategoryLimit = async () => {
    try {
      if (savingBudgetGoal) return;
      setSavingBudgetGoal(true);
      const v = parseInputToMinor(selectedLimit, baseCurrency);

      // Policy: saving 0 (or empty/invalid -> 0) deletes the goal
      if (v <= 0) {
        setSelectedLimit("");
        upsertBudgetGoalLimit(selectedCategory, 0);

        if (__DEV__ && !DEV_USER_ID) {
          Alert.alert(
            tr("Save failed", "저장 실패"),
            tr(
              "Missing DEV user id. Set EXPO_PUBLIC_DEV_USER_ID in your Expo env.",
              "DEV 유저 ID가 없어요. EXPO_PUBLIC_DEV_USER_ID를 설정해 주세요.",
            ),
          );
          return;
        }

        const res = await patchPlan({
          userId: DEV_USER_ID,
          periodType: type as any,
          periodStartUTC,
          ...(type === "BIWEEKLY" ? { periodAnchorUTC } : {}),
          budgetGoals: [{ category: selectedCategory, limitMinor: 0 }],
        });

        applyServerResponse(res);
        return;
      }

      // optimistic local update
      upsertBudgetGoalLimit(selectedCategory, v);

      if (__DEV__ && !DEV_USER_ID) {
        Alert.alert(
          tr("Save failed", "저장 실패"),
          tr(
            "Missing DEV user id. Set EXPO_PUBLIC_DEV_USER_ID in your Expo env.",
            "DEV 유저 ID가 없어요. EXPO_PUBLIC_DEV_USER_ID를 설정해 주세요.",
          ),
        );
        return;
      }

      const res = await patchPlan({
        userId: DEV_USER_ID,
        periodType: type as any,
        periodStartUTC,
        ...(type === "BIWEEKLY" ? { periodAnchorUTC } : {}),
        budgetGoals: [{ category: selectedCategory, limitMinor: v }],
      });

      applyServerResponse(res);
    } catch (e: any) {
      Alert.alert(
        tr("Save failed", "저장 실패"),
        e?.message || "Unknown error",
      );
    } finally {
      setSavingBudgetGoal(false);
    }
  };

  const clearSelectedCategoryLimit = async () => {
    try {
      if (savingBudgetGoal) return;
      setSavingBudgetGoal(true);
      setSelectedLimit("");

      // optimistic local update
      upsertBudgetGoalLimit(selectedCategory, 0);

      if (__DEV__ && !DEV_USER_ID) {
        Alert.alert(
          tr("Save failed", "저장 실패"),
          tr(
            "Missing DEV user id. Set EXPO_PUBLIC_DEV_USER_ID in your Expo env.",
            "DEV 유저 ID가 없어요. EXPO_PUBLIC_DEV_USER_ID를 설정해 주세요.",
          ),
        );
        return;
      }

      const res = await patchPlan({
        userId: DEV_USER_ID,
        periodType: type as any,
        periodStartUTC,
        ...(type === "BIWEEKLY" ? { periodAnchorUTC } : {}),
        budgetGoals: [{ category: selectedCategory, limitMinor: 0 }],
      });

      applyServerResponse(res);
    } catch (e: any) {
      Alert.alert(
        tr("Save failed", "저장 실패"),
        e?.message || "Unknown error",
      );
    } finally {
      setSavingBudgetGoal(false);
    }
  };
  // NOTE: legacy full-sync action (UI hidden). Keeping for now for debugging/future use.
  /*
  const savePlanToServer = async () => {
    try {
      setSavingToServer(true);

      // Server endpoint is monthly-only for now.
      // IMPORTANT: use the same month key as hydration (YYYY-MM) so saves persist after restart.
      // Avoid Date parsing/toISOString here (can throw "Date value out of bounds" on invalid dates).
      const at =
        type === "MONTHLY"
          ? String(startISO || new Date().toISOString()).slice(0, 7)
          : undefined;

      // If the user typed a new value but didn't press the local "Save" button,
      // we still want "Save to Server" to persist the latest edits.
      const pendingLimitMinor = parseInputToMinor(selectedLimit, baseCurrency);
      const pendingSavingsTargetMinor = parseInputToMinor(
        selectedSavingsTarget,
        baseCurrency
      );

      // Build a snapshot for payload (do NOT rely on async state updates)
      const budgetGoalsSnapshot = [...(plan.budgetGoals ?? [])].map(
        (g: any) => ({
          category: String(g?.category ?? "Other"),
          limitMinor: Number(g?.limitMinor ?? 0),
        })
      );

      const savingsGoalsSnapshot = [...(plan.savingsGoals ?? [])].map(
        (g: any) => ({
          name: String(g?.name ?? "Other"),
          targetMinor: Number(g?.targetMinor ?? 0),
        })
      );

      // Override currently edited category/goal in the snapshot
      {
        const cat = String(selectedCategory ?? "Other");
        const idx = budgetGoalsSnapshot.findIndex((g) => g.category === cat);
        if (idx >= 0) budgetGoalsSnapshot[idx].limitMinor = pendingLimitMinor;
        else if (pendingLimitMinor > 0)
          budgetGoalsSnapshot.push({
            category: cat,
            limitMinor: pendingLimitMinor,
          });
      }

      {
        const name = String(selectedSavingsGoal ?? "Other");
        const idx = savingsGoalsSnapshot.findIndex((g) => g.name === name);
        if (idx >= 0)
          savingsGoalsSnapshot[idx].targetMinor = pendingSavingsTargetMinor;
        else if (pendingSavingsTargetMinor > 0)
          savingsGoalsSnapshot.push({
            name,
            targetMinor: pendingSavingsTargetMinor,
          });
      }

      // Also update local store so UI stays consistent after saving
      upsertBudgetGoalLimit(selectedCategory, pendingLimitMinor);
      upsertSavingsGoalTarget(selectedSavingsGoal, pendingSavingsTargetMinor);

      const payload = {
        userId: DEV_USER_ID,
        at,
        // totalBudgetLimitMinor in app == totalBudgetLimitMinor on server
        totalBudgetLimitMinor: Number((plan as any).totalBudgetLimitMinor || 0),

        // IMPORTANT: filter out zeros so server-side replace doesn't wipe goals accidentally
        budgetGoals: budgetGoalsSnapshot
          .filter((g) => (g.limitMinor ?? 0) > 0)
          .map((g) => ({
            category: String(g.category),
            limitMinor: Number(g.limitMinor) || 0,
          })),

        savingsGoals: savingsGoalsSnapshot
          .filter((g) => (g.targetMinor ?? 0) > 0)
          .map((g) => ({
            name: String(g.name),
            targetMinor: Number(g.targetMinor) || 0,
          })),
      };

      console.log("[PlanScreen] PATCH monthly plan", {
        at,
        startISO,
        selectedCategory,
        pendingLimitMinor,
        utilities: budgetGoalsSnapshot.find((g) => g.category === "Utilities")
          ?.limitMinor,
        goalsCount: budgetGoalsSnapshot.length,
      });

      const res = await patchMonthlyPlan(payload);

      // Map server response to planStore.applyServerPlan shape (normalize server fields)
      const sp: any = res.plan;

      const budgetGoals = Array.isArray(sp?.budgetGoals)
        ? sp.budgetGoals.map((g: any) => ({
            category: String(g.category ?? "Other"),
            limitMinor: Number(g.limitMinor ?? 0),
          }))
        : [];

      const savingsGoals = Array.isArray(sp?.savingsGoals)
        ? sp.savingsGoals.map((g: any) => ({
            name: String(g.name ?? "Other"),
            targetMinor: Number(g.targetMinor ?? g.targetMinor ?? 0),
          }))
        : [];

      applyServerPlan({
        periodType: sp.periodType,
        periodStartUTC: sp.periodStart,
        totalBudgetLimitMinor: sp.totalBudgetLimitMinor,
        budgetGoals,
        savingsGoals,
      });

      console.log("AFTER APPLY", plan.budgetGoals.slice(0, 3));

      Alert.alert(
        isKo ? "저장 완료" : "Saved",
        isKo ? "서버에 저장했어요." : "Saved to server."
      );
    } catch (e: any) {
      Alert.alert(
        isKo ? "저장 실패" : "Save failed",
        e?.message || "Unknown error"
      );
    } finally {
      setSavingToServer(false);
    }
  };
  */

  const saveSelectedSavingsTarget = async () => {
    try {
      if (savingSavingsGoal) return;
      setSavingSavingsGoal(true);
      const v = parseInputToMinor(selectedSavingsTarget, baseCurrency);

      // Policy: saving 0 (or empty/invalid -> 0) deletes the goal
      if (v <= 0) {
        setSelectedSavingsTarget("");
        upsertSavingsGoalTarget(selectedSavingsGoal, 0);

        if (__DEV__ && !DEV_USER_ID) {
          Alert.alert(
            tr("Save failed", "저장 실패"),
            tr(
              "Missing DEV user id. Set EXPO_PUBLIC_DEV_USER_ID in your Expo env.",
              "DEV 유저 ID가 없어요. EXPO_PUBLIC_DEV_USER_ID를 설정해 주세요.",
            ),
          );
          return;
        }

        const res = await patchPlan({
          userId: DEV_USER_ID,
          periodType: type as any,
          periodStartUTC,
          ...(type === "BIWEEKLY" ? { periodAnchorUTC } : {}),
          savingsGoals: [{ name: selectedSavingsGoal, targetMinor: 0 }],
        });

        applyServerResponse(res);
        return;
      }

      // optimistic local update
      upsertSavingsGoalTarget(selectedSavingsGoal, v);

      if (__DEV__ && !DEV_USER_ID) {
        Alert.alert(
          tr("Save failed", "저장 실패"),
          tr(
            "Missing DEV user id. Set EXPO_PUBLIC_DEV_USER_ID in your Expo env.",
            "DEV 유저 ID가 없어요. EXPO_PUBLIC_DEV_USER_ID를 설정해 주세요.",
          ),
        );
        return;
      }

      const res = await patchPlan({
        userId: DEV_USER_ID,
        periodType: type as any,
        periodStartUTC,
        ...(type === "BIWEEKLY" ? { periodAnchorUTC } : {}),
        savingsGoals: [{ name: selectedSavingsGoal, targetMinor: v }],
      });

      applyServerResponse(res);
    } catch (e: any) {
      Alert.alert(
        tr("Save failed", "저장 실패"),
        e?.message || "Unknown error",
      );
    } finally {
      setSavingSavingsGoal(false);
    }
  };

  const clearSelectedSavingsTarget = async () => {
    try {
      if (savingSavingsGoal) return;
      setSavingSavingsGoal(true);
      setSelectedSavingsTarget("");

      // optimistic local update
      upsertSavingsGoalTarget(selectedSavingsGoal, 0);

      if (__DEV__ && !DEV_USER_ID) {
        Alert.alert(
          tr("Save failed", "저장 실패"),
          tr(
            "Missing DEV user id. Set EXPO_PUBLIC_DEV_USER_ID in your Expo env.",
            "DEV 유저 ID가 없어요. EXPO_PUBLIC_DEV_USER_ID를 설정해 주세요.",
          ),
        );
        return;
      }

      const res = await patchPlan({
        userId: DEV_USER_ID,
        periodType: type as any,
        periodStartUTC,
        ...(type === "BIWEEKLY" ? { periodAnchorUTC } : {}),
        savingsGoals: [{ name: selectedSavingsGoal, targetMinor: 0 }],
      });

      applyServerResponse(res);
    } catch (e: any) {
      Alert.alert(
        tr("Save failed", "저장 실패"),
        e?.message || "Unknown error",
      );
    } finally {
      setSavingSavingsGoal(false);
    }
  };

  // DEV-only: log render key values on change, not every render
  useEffect(() => {
    dlog("[PlanScreen] render", {
      budgetGoals: plan.budgetGoals.length,
      savingsGoals: plan.savingsGoals.length,
      selectedCategory,
      period: { startISO, endISO, type },
    });
  }, [
    plan.budgetGoals.length,
    plan.savingsGoals.length,
    selectedCategory,
    startISO,
    endISO,
    type,
  ]);

  return (
    <ScreenLayout
      keyboardAvoiding
      header={
        <ScreenHeader
          title={tr(`${periodLabel} Plan`, `${periodLabel} 플랜`)}
          subtitle={tr(
            `Progress (${periodText}): ${progressPercent}%`,
            `진행률(${periodText}): ${progressPercent}%`,
          )}
          description={tr(
            `Base currency: ${baseCurrency}`,
            `기준 통화: ${baseCurrency}`,
          )}
        />
      }
    >
      <View style={styles.topActions}>
        {serverHydrating ? (
          <Text style={styles.serverHint}>
            {tr("Loading from server...", "서버에서 불러오는 중...")}
          </Text>
        ) : null}
      </View>

      <Text style={CardSpacing.section}>{tr("Budget Goals", "예산 목표")}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {EXPENSE_CATEGORIES.map((c) => {
          const selected = c === selectedCategory;
          return (
            <Pressable
              key={c}
              onPress={() => setSelectedCategory(c)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text
                numberOfLines={1}
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {c}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[CardSpacing.card, styles.card]}>
        {(() => {
          const goal = plan.budgetGoals.find(
            (g) => g.category === selectedCategory,
          );
          const limit = goal?.limitMinor || 0;
          const spent = spentByCategory.get(selectedCategory) || 0;
          const ratio = limit > 0 ? spent / limit : 0;
          const status =
            limit <= 0
              ? "NO_LIMIT"
              : ratio > 1
                ? "OVER"
                : ratio > 0.8
                  ? "WARNING"
                  : "SAFE";
          const statusColor =
            status === "OVER" ? "#c00" : status === "WARNING" ? "#c90" : "#0a7";

          return (
            <>
              <Text style={[CardSpacing.cardTitle, styles.cardTitle]}>
                {selectedCategory}
              </Text>

              {limit > 0 ? (
                <Text style={[styles.cardMeta, { color: statusColor }]}>
                  {tr("Spent:", "지출:")} {formatMoney(spent, baseCurrency)} /{" "}
                  {formatMoney(limit, baseCurrency)}{" "}
                  {status === "SAFE"
                    ? "✅"
                    : status === "WARNING"
                      ? "⚠️"
                      : tr("🚨 Over", "🚨 초과")}
                </Text>
              ) : (
                <Text style={styles.cardBody}>
                  {tr(
                    "No limit set for this category yet.",
                    "이 카테고리는 아직 예산 한도가 없어요.",
                  )}
                </Text>
              )}

              <View style={styles.row}>
                <View style={styles.moneyInputWrap}>
                  <Text style={styles.moneyPrefix}>
                    {currencyPrefix(baseCurrency)}
                  </Text>
                  <TextInput
                    value={selectedLimit}
                    onChangeText={setSelectedLimit}
                    placeholder={placeholderForCurrency(baseCurrency)}
                    inputMode={baseCurrency === "KRW" ? "numeric" : "decimal"}
                    keyboardType={
                      baseCurrency === "KRW" ? "number-pad" : "decimal-pad"
                    }
                    style={styles.moneyInput}
                  />
                </View>
                <Pressable
                  onPress={saveSelectedCategoryLimit}
                  disabled={savingBudgetGoal}
                  style={[
                    styles.saveBtn,
                    savingBudgetGoal && styles.saveBtnDisabled,
                  ]}
                >
                  <Text style={styles.saveBtnText}>
                    {savingBudgetGoal
                      ? tr("Saving...", "저장중...")
                      : tr("Save", "저장")}
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={clearSelectedCategoryLimit}
                disabled={savingBudgetGoal}
                style={[
                  styles.linkWrap,
                  savingBudgetGoal && styles.linkDisabled,
                ]}
              >
                <Text style={styles.linkText}>
                  {tr("Clear this category limit", "이 카테고리 한도 지우기")}
                </Text>
              </Pressable>
            </>
          );
        })()}
      </View>

      <Text style={CardSpacing.section}>
        {tr("Savings Goals", "저축 목표")}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {SAVINGS_GOALS.map((g) => {
          const selected = g === selectedSavingsGoal;
          return (
            <Pressable
              key={g}
              onPress={() => setSelectedSavingsGoal(g)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text
                numberOfLines={1}
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {g}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[CardSpacing.card, styles.card]}>
        {(() => {
          const goal = plan.savingsGoals.find(
            (x) => x.name === selectedSavingsGoal,
          );
          const target = goal?.targetMinor || 0;
          const saved = savedByGoal.get(selectedSavingsGoal) || 0;

          const ratio = target > 0 ? saved / target : 0;
          const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
          const done = target > 0 && ratio >= 1;

          return (
            <>
              <Text style={[CardSpacing.cardTitle, styles.cardTitle]}>
                {selectedSavingsGoal}
              </Text>

              {target > 0 ? (
                <Text
                  style={[styles.cardMeta, { color: done ? "#0a7" : "#666" }]}
                >
                  {tr("Saved:", "저축:")} {formatMoney(saved, baseCurrency)} /{" "}
                  {formatMoney(target, baseCurrency)} ({pct}%){" "}
                  {done ? "✅" : ""}
                </Text>
              ) : (
                <Text style={styles.cardBody}>
                  {tr(
                    "No target set for this goal yet.",
                    "이 목표는 아직 목표 금액이 없어요.",
                  )}
                </Text>
              )}

              <View style={styles.row}>
                <View style={styles.moneyInputWrap}>
                  <Text style={styles.moneyPrefix}>
                    {currencyPrefix(baseCurrency)}
                  </Text>
                  <TextInput
                    value={selectedSavingsTarget}
                    onChangeText={setSelectedSavingsTarget}
                    placeholder={placeholderForCurrency(baseCurrency)}
                    inputMode={baseCurrency === "KRW" ? "numeric" : "decimal"}
                    keyboardType={
                      baseCurrency === "KRW" ? "number-pad" : "decimal-pad"
                    }
                    style={styles.moneyInput}
                  />
                </View>
                <Pressable
                  onPress={saveSelectedSavingsTarget}
                  disabled={savingSavingsGoal}
                  style={[
                    styles.saveBtn,
                    savingSavingsGoal && styles.saveBtnDisabled,
                  ]}
                >
                  <Text style={styles.saveBtnText}>
                    {savingSavingsGoal
                      ? tr("Saving...", "저장중...")
                      : tr("Save", "저장")}
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={clearSelectedSavingsTarget}
                disabled={savingSavingsGoal}
                style={[
                  styles.linkWrap,
                  savingSavingsGoal && styles.linkDisabled,
                ]}
              >
                <Text style={styles.linkText}>
                  {tr("Clear this savings target", "이 저축 목표 지우기")}
                </Text>
              </Pressable>
            </>
          );
        })()}
      </View>

      <View style={{ height: 24 }} />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  topActions: { marginBottom: 10 },
  serverBtn: {
    alignSelf: "flex-start",
    borderRadius: 12,
    backgroundColor: "black",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  serverBtnDisabled: { opacity: 0.6 },
  serverBtnText: { color: "white", fontWeight: "800" },
  serverHint: { marginTop: 6, color: "#666", fontWeight: "600" },

  chipsRow: {
    gap: 8,
    paddingVertical: 6,
    marginBottom: 12,
    alignItems: "center",
  },
  chip: {
    flexShrink: 0,
    minHeight: 34,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "white",
    justifyContent: "center",
  },
  chipSelected: {
    borderColor: "black",
    backgroundColor: "black",
  },
  chipText: {
    flexShrink: 0,
    color: "#111",
    fontWeight: "700",
    fontSize: 13,
  },
  chipTextSelected: { color: "white" },

  card: {
    backgroundColor: "white",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#eee",
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111",
    marginBottom: 6,
  },
  cardMeta: { marginBottom: 10, fontSize: 13, fontWeight: "600" },
  cardBody: { color: "#666", marginBottom: 10 },

  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  moneyInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "white",
  },
  moneyPrefix: {
    fontWeight: "800",
    color: "#111",
    marginRight: 6,
  },
  moneyInput: {
    flex: 1,
    paddingVertical: 10,
  },
  saveBtn: {
    width: 92,
    borderRadius: 12,
    backgroundColor: "black",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  saveBtnText: { color: "white", fontWeight: "800" },
  saveBtnDisabled: { opacity: 0.6 },
  linkDisabled: { opacity: 0.5 },

  linkWrap: { marginTop: 10 },
  linkText: { color: "#666", fontWeight: "600" },
});
