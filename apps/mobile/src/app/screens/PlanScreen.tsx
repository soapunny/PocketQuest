import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";

import { usePlan } from "../lib/planStore";
import { patchMonthlyPlan, upsertMonthlyPlan } from "../lib/api/plans";
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
  const baseCurrency: Currency = (homeCurrency ??
    (plan as any).homeCurrency ??
    "USD") as Currency;
  const { transactions } = useTransactions();

  // DEV ONLY: replace with your real user id (until auth is wired)
  const DEV_USER_ID = "cmjw3lb0d000076zuddg5lo6o";
  const [serverHydrating, setServerHydrating] = useState(true);

  // Initial server sync (monthly only for now)
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setServerHydrating(true);

        // Use current month for initial hydration (YYYY-MM)
        const at = new Date().toISOString().slice(0, 7);

        const res: any = await upsertMonthlyPlan({ userId: DEV_USER_ID, at });
        if (!mounted) return;

        const sp = res?.plan;
        if (!sp) return;

        // Normalize server fields -> app store shape
        const budgetGoals = Array.isArray(sp.budgetGoals)
          ? sp.budgetGoals.map((g: any) => ({
              category: String(g.category ?? "Other"),
              // server uses limitMinor
              limitCents: Number(g.limitMinor ?? g.limitCents ?? 0),
            }))
          : [];

        const savingsGoals = Array.isArray(sp.savingsGoals)
          ? sp.savingsGoals.map((g: any) => ({
              name: String(g.name ?? "Other"),
              // server uses targetMinor
              targetCents: Number(g.targetMinor ?? g.targetCents ?? 0),
            }))
          : [];

        applyServerPlan({
          periodType: sp.periodType,
          periodStartUTC: sp.periodStart,
          totalBudgetLimitMinor: sp.totalBudgetLimitMinor,
          budgetGoals,
          savingsGoals,
        });

        console.log("[PlanScreen] server response raw", sp);
        console.log(
          "[PlanScreen] server response goals",
          sp?.budgetGoals,
          sp?.savingsGoals
        );
      } catch (e) {
        // OK to fail quietly when server is offline
        console.log("[Plan] initial load failed", e);
      } finally {
        if (mounted) setServerHydrating(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [applyServerPlan]);

  const { startISO, endISO, type } = useMemo(
    () => getPlanPeriodRange(plan as any),
    [plan]
  );

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
          ""
      );
      if (!iso) return false;
      return isISOInRange(iso, startISO, endISO);
    });
  }, [transactions, startISO, endISO]);

  const [selectedCategory, setSelectedCategory] = useState<string>(
    EXPENSE_CATEGORIES[0]
  );
  const [selectedLimit, setSelectedLimit] = useState("");

  const [selectedSavingsGoal, setSelectedSavingsGoal] = useState<string>(
    SAVINGS_GOALS[0]
  );
  const [selectedSavingsTarget, setSelectedSavingsTarget] = useState("");

  useEffect(() => {
    const g = plan.budgetGoals.find((x) => x.category === selectedCategory);
    setSelectedLimit(
      g && g.limitCents > 0 ? formatMoney(g.limitCents, baseCurrency) : ""
    );
  }, [selectedCategory, plan.budgetGoals, baseCurrency]);

  useEffect(() => {
    const g = plan.savingsGoals.find((x) => x.name === selectedSavingsGoal);
    setSelectedSavingsTarget(
      g && g.targetCents > 0 ? formatMoney(g.targetCents, baseCurrency) : ""
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

  const totalSpentCents = useMemo(() => {
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
        (map.get(goalName) || 0) + txToHomeMinor(tx, baseCurrency)
      );
    }

    return map;
  }, [periodTransactions, baseCurrency]);

  const progressPercent = useMemo(() => {
    return computePlanProgressPercent(plan as any, transactions);
  }, [plan, transactions]);

  const saveSelectedCategoryLimit = () => {
    const v = parseInputToMinor(selectedLimit, baseCurrency);
    upsertBudgetGoalLimit(selectedCategory, v);
  };
  const clearSelectedCategoryLimit = () => {
    setSelectedLimit("");
    upsertBudgetGoalLimit(selectedCategory, 0);
  };

  const [savingToServer, setSavingToServer] = useState(false);

  const savePlanToServer = async () => {
    try {
      setSavingToServer(true);

      // Server endpoint is monthly-only for now.
      const at =
        type === "MONTHLY"
          ? String((plan as any).periodStartISO || "").slice(0, 7)
          : undefined;

      const payload = {
        userId: DEV_USER_ID,
        at,
        // totalBudgetLimitCents in app == totalBudgetLimitMinor on server
        totalBudgetLimitMinor: Number((plan as any).totalBudgetLimitCents || 0),
        budgetGoals: (plan.budgetGoals || []).map((g: any) => ({
          category: String(g.category || "Other"),
          limitMinor: Number(g.limitCents || 0),
        })),
        savingsGoals: (plan.savingsGoals || []).map((g: any) => ({
          name: String(g.name || "Other"),
          targetMinor: Number(g.targetCents || 0),
        })),
      };

      const res = await patchMonthlyPlan(payload);

      // Map server response to planStore.applyServerPlan shape (normalize server fields)
      const sp: any = res.plan;

      const budgetGoals = Array.isArray(sp?.budgetGoals)
        ? sp.budgetGoals.map((g: any) => ({
            category: String(g.category ?? "Other"),
            limitCents: Number(g.limitMinor ?? g.limitCents ?? 0),
          }))
        : [];

      const savingsGoals = Array.isArray(sp?.savingsGoals)
        ? sp.savingsGoals.map((g: any) => ({
            name: String(g.name ?? "Other"),
            targetCents: Number(g.targetMinor ?? g.targetCents ?? 0),
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

  console.log(
    "[PlanScreen] render",
    plan.budgetGoals.length,
    plan.savingsGoals.length
  );

  console.log("[PlanScreen] goals sample", plan.budgetGoals?.[0]);
  console.log("[PlanScreen] selectedCategory", selectedCategory);

  return (
    <ScreenLayout
      keyboardAvoiding
      header={
        <ScreenHeader
          title={tr(`${periodLabel} Plan`, `${periodLabel} 플랜`)}
          subtitle={tr(
            `Progress (${periodText}): ${progressPercent}%`,
            `진행률(${periodText}): ${progressPercent}%`
          )}
          description={tr(
            `Base currency: ${baseCurrency}`,
            `기준 통화: ${baseCurrency}`
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
        <Pressable
          onPress={savePlanToServer}
          disabled={savingToServer}
          style={[styles.serverBtn, savingToServer && styles.serverBtnDisabled]}
        >
          {savingToServer ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.serverBtnText}>
              {tr("Save to Server", "서버에 저장")}
            </Text>
          )}
        </Pressable>

        {type !== "MONTHLY" ? (
          <Text style={styles.serverHint}>
            {tr(
              "(Server sync is monthly-only for now)",
              "(서버 동기화는 현재 월간만 지원)"
            )}
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
            (g) => g.category === selectedCategory
          );
          const limit = goal?.limitCents || 0;
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
                    "이 카테고리는 아직 예산 한도가 없어요."
                  )}
                </Text>
              )}

              <View style={styles.row}>
                <TextInput
                  value={selectedLimit}
                  onChangeText={setSelectedLimit}
                  placeholder={
                    isKo
                      ? `${periodLabel} 한도 (${baseCurrency})`
                      : `${periodLabel.toLowerCase()} limit (${baseCurrency})`
                  }
                  inputMode={baseCurrency === "KRW" ? "numeric" : "decimal"}
                  keyboardType={
                    baseCurrency === "KRW" ? "number-pad" : "decimal-pad"
                  }
                  style={styles.input}
                />
                <Pressable
                  onPress={saveSelectedCategoryLimit}
                  style={styles.saveBtn}
                >
                  <Text style={styles.saveBtnText}>{tr("Save", "저장")}</Text>
                </Pressable>
              </View>

              <Pressable
                onPress={clearSelectedCategoryLimit}
                style={styles.linkWrap}
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
            (x) => x.name === selectedSavingsGoal
          );
          const target = goal?.targetCents || 0;
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
                    "이 목표는 아직 목표 금액이 없어요."
                  )}
                </Text>
              )}

              <View style={styles.row}>
                <TextInput
                  value={selectedSavingsTarget}
                  onChangeText={setSelectedSavingsTarget}
                  placeholder={
                    isKo
                      ? `${periodLabel} 목표 (${baseCurrency})`
                      : `${periodLabel.toLowerCase()} target (${baseCurrency})`
                  }
                  inputMode={baseCurrency === "KRW" ? "numeric" : "decimal"}
                  keyboardType={
                    baseCurrency === "KRW" ? "number-pad" : "decimal-pad"
                  }
                  style={styles.input}
                />
                <Pressable
                  onPress={() =>
                    upsertSavingsGoalTarget(
                      selectedSavingsGoal,
                      parseInputToMinor(selectedSavingsTarget, baseCurrency)
                    )
                  }
                  style={styles.saveBtn}
                >
                  <Text style={styles.saveBtnText}>{tr("Save", "저장")}</Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => {
                  setSelectedSavingsTarget("");
                  upsertSavingsGoalTarget(selectedSavingsGoal, 0);
                }}
                style={styles.linkWrap}
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
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "white",
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

  linkWrap: { marginTop: 10 },
  linkText: { color: "#666", fontWeight: "600" },
});
