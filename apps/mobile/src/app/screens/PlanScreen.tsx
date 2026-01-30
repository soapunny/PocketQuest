import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";

// UI components and layout
import { CardSpacing } from "../components/Typography";
import ScreenHeader from "../components/layout/ScreenHeader";
import ScreenLayout from "../components/layout/ScreenLayout";

// types
import type { Currency } from "../../../../../packages/shared/src/money/types";

import { usePlan } from "../store/planStore";

import { EXPENSE_CATEGORY_KEYS } from "../domain/categories";
import { categoryLabelText } from "../domain/categories/categoryLabels";
import {
  parseInputToMinor,
  formatMoney,
  formatMoneyNoSymbol,
  getCurrencySymbol,
  getPlaceholderForCurrency,
} from "../domain/money";

// --- Helpers for robust category key matching and number coercion ---
function normKey(v: unknown) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function toMinorNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    // Accept numeric strings ("1200"), and ignore commas/spaces.
    const cleaned = v.replace(/[,\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  // Defensive: Prisma/Decimal-like objects sometimes have `.toString()`
  try {
    const s = String((v as any)?.toString?.() ?? "");
    const cleaned = s.replace(/[,\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export default function PlanScreen() {
  const {
    plan,
    upsertBudgetGoalLimit,
    upsertSavingsGoalTarget,
    refreshPlan,
    saveBudgetGoals,
    saveBudgetGoal,
    saveSavingsGoals,
  } = usePlan();
  // Keep isKo/tr logic as-is for translation
  const isKo = plan.language === "ko";
  const tr = (en: string, ko: string) => (isKo ? ko : en);
  const baseCurrency: Currency = plan.currency;

  const [serverHydrating, setServerHydrating] = useState(true);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        setServerHydrating(true);
        await refreshPlan();
      } catch {
        // ignore
      } finally {
        if (mounted) setServerHydrating(false);
      }
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [refreshPlan]);

  const periodType = plan.periodType;

  const periodLabel =
    periodType === "MONTHLY"
      ? tr("Monthly", "월간")
      : periodType === "BIWEEKLY"
        ? tr("Bi-weekly", "2주")
        : tr("Weekly", "주간");

  const periodText =
    periodType === "MONTHLY"
      ? tr("this month", "이번 달")
      : periodType === "BIWEEKLY"
        ? tr("this 2 weeks", "이번 2주")
        : tr("this week", "이번 주");

  const [selectedCategory, setSelectedCategory] = useState<string>(
    EXPENSE_CATEGORY_KEYS[0],
  );
  const [selectedLimit, setSelectedLimit] = useState("");
  const [savingBudgetGoal, setSavingBudgetGoal] = useState(false);
  const [isEditingBudgetLimit, setIsEditingBudgetLimit] = useState(false);

  const savingsGoalNames = useMemo(
    () => (plan.savingsGoals ?? []).map((g) => String(g.name)).filter(Boolean),
    [plan.savingsGoals],
  );

  const [selectedSavingsGoal, setSelectedSavingsGoal] = useState<string>(() => {
    return savingsGoalNames[0] ?? "";
  });
  const [selectedSavingsTarget, setSelectedSavingsTarget] = useState("");
  const [savingSavingsGoal, setSavingSavingsGoal] = useState(false);
  const [isEditingSavingsTarget, setIsEditingSavingsTarget] = useState(false);

  useEffect(() => {
    if (!savingsGoalNames.length) return;
    if (selectedSavingsGoal && savingsGoalNames.includes(selectedSavingsGoal))
      return;
    setSelectedSavingsGoal(savingsGoalNames[0] ?? "");
  }, [savingsGoalNames, selectedSavingsGoal]);

  useEffect(() => {
    if (isEditingBudgetLimit) return;

    const g = (plan.budgetGoals ?? []).find((x: any) => {
      const k = (x as any).categoryKey ?? (x as any).category ?? "";
      return normKey(k) === normKey(selectedCategory);
    });
    const limitMinor = g ? toMinorNumber((g as any).limitMinor) : 0;
    setSelectedLimit(
      Number.isFinite(limitMinor) && limitMinor > 0
        ? formatMoneyNoSymbol(limitMinor, baseCurrency)
        : "",
    );
  }, [selectedCategory, plan.budgetGoals, baseCurrency, isEditingBudgetLimit]);

  useEffect(() => {
    if (isEditingSavingsTarget) return;

    const g = plan.savingsGoals.find((x) => x.name === selectedSavingsGoal);
    const targetMinor = g ? toMinorNumber((g as any).targetMinor) : 0;
    setSelectedSavingsTarget(
      Number.isFinite(targetMinor) && targetMinor > 0
        ? formatMoneyNoSymbol(targetMinor, baseCurrency)
        : "",
    );
  }, [
    selectedSavingsGoal,
    plan.savingsGoals,
    baseCurrency,
    isEditingSavingsTarget,
  ]);

  const saveSelectedCategoryLimit = async () => {
    try {
      if (savingBudgetGoal) return;
      setSavingBudgetGoal(true);

      const v = parseInputToMinor(selectedLimit, baseCurrency);

      console.log("[PlanScreen] saving budget goal", {
        selectedCategory,
        input: selectedLimit,
        parsedMinor: v,
      });

      // Policy: saving 0 (or empty/invalid -> 0) deletes the goal
      if (v <= 0) {
        setSelectedLimit("");
        upsertBudgetGoalLimit(selectedCategory, 0);
        const ok = await saveBudgetGoal(selectedCategory, 0);
        console.log("[PlanScreen] saveBudgetGoal ok?", ok);
        if (!ok) throw new Error("Failed to save budget goals");
        return;
      }

      // optimistic local update
      upsertBudgetGoalLimit(selectedCategory, v);
      const ok = await saveBudgetGoal(selectedCategory, v);
      console.log("[PlanScreen] saveBudgetGoal ok?", ok);
      if (!ok) throw new Error("Failed to save budget goals");
    } catch (e: any) {
      Alert.alert(
        tr("Save failed", "저장 실패"),
        e?.message || "Unknown error",
      );
    } finally {
      setSavingBudgetGoal(false);
      setIsEditingBudgetLimit(false);
    }
  };

  const clearSelectedCategoryLimit = async () => {
    try {
      if (savingBudgetGoal) return;
      setSavingBudgetGoal(true);
      setSelectedLimit("");

      // optimistic local update
      upsertBudgetGoalLimit(selectedCategory, 0);

      const ok = await saveBudgetGoal(selectedCategory, 0);
      console.log("[PlanScreen] saveBudgetGoal ok?", ok);
      if (!ok) throw new Error("Failed to save budget goals");
    } catch (e: any) {
      Alert.alert(
        tr("Save failed", "저장 실패"),
        e?.message || "Unknown error",
      );
    } finally {
      setSavingBudgetGoal(false);
      setIsEditingBudgetLimit(false);
    }
  };

  const saveSelectedSavingsTarget = async () => {
    try {
      if (savingSavingsGoal) return;
      setSavingSavingsGoal(true);

      if (!String(selectedSavingsGoal || "").trim()) {
        throw new Error(
          tr("Please enter a goal name", "목표 이름을 입력하세요"),
        );
      }

      const v = parseInputToMinor(selectedSavingsTarget, baseCurrency);

      if (v <= 0) {
        setSelectedSavingsTarget("");
        upsertSavingsGoalTarget(selectedSavingsGoal, 0);
        const ok = await saveSavingsGoals();
        console.log("[PlanScreen] saveSavingsGoals ok?", ok);
        if (!ok) throw new Error("Failed to save savings goals");
        return;
      }

      upsertSavingsGoalTarget(selectedSavingsGoal, v);
      const ok = await saveSavingsGoals();
      console.log("[PlanScreen] saveSavingsGoals ok?", ok);
      if (!ok) throw new Error("Failed to save savings goals");
    } catch (e: any) {
      Alert.alert(
        tr("Save failed", "저장 실패"),
        e?.message || "Unknown error",
      );
    } finally {
      setSavingSavingsGoal(false);
      setIsEditingSavingsTarget(false);
    }
  };

  const clearSelectedSavingsTarget = async () => {
    try {
      if (savingSavingsGoal) return;
      setSavingSavingsGoal(true);
      setSelectedSavingsTarget("");

      if (!String(selectedSavingsGoal || "").trim()) {
        throw new Error(
          tr("Please enter a goal name", "목표 이름을 입력하세요"),
        );
      }

      // optimistic local update
      upsertSavingsGoalTarget(selectedSavingsGoal, 0);

      const ok = await saveSavingsGoals();
      console.log("[PlanScreen] saveSavingsGoals ok?", ok);
      if (!ok) throw new Error("Failed to save savings goals");
    } catch (e: any) {
      Alert.alert(
        tr("Save failed", "저장 실패"),
        e?.message || "Unknown error",
      );
    } finally {
      setSavingSavingsGoal(false);
      setIsEditingSavingsTarget(false);
    }
  };

  return (
    <ScreenLayout
      keyboardAvoiding
      header={
        <ScreenHeader
          title={tr(`${periodLabel} Plan`, `${periodLabel} 플랜`)}
          subtitle={tr(
            `Set your goals for ${periodText}`,
            `${periodText} 목표를 설정하세요`,
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
        {EXPENSE_CATEGORY_KEYS.map((c) => {
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
                {categoryLabelText(c, plan.language)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[CardSpacing.card, styles.card]}>
        {(() => {
          const goal = (plan.budgetGoals ?? []).find((g: any) => {
            const k = (g as any).categoryKey ?? (g as any).category ?? "";
            return normKey(k) === normKey(selectedCategory);
          });
          const limit = toMinorNumber((goal as any)?.limitMinor);
          console.log("[PlanScreen] selectedCategory:", selectedCategory);
          console.log(
            "[PlanScreen] matched goal:",
            goal,
            "limitMinor(raw):",
            (goal as any)?.limitMinor,
            "limitMinor(num):",
            limit,
          );

          return (
            <>
              <Text style={[CardSpacing.cardTitle, styles.cardTitle]}>
                {categoryLabelText(selectedCategory, plan.language)}
              </Text>

              {limit > 0 ? (
                <Text style={styles.cardMeta}>
                  {tr("Current goal:", "현재 목표:")}{" "}
                  {formatMoney(limit, baseCurrency)}
                </Text>
              ) : (
                <Text style={styles.cardBody}>
                  {tr(
                    "No goal set for this category yet.",
                    "이 카테고리는 아직 목표 금액이 없어요.",
                  )}
                </Text>
              )}

              <View style={styles.row}>
                <View style={styles.moneyInputWrap}>
                  <Text style={styles.moneyPrefix}>
                    {getCurrencySymbol(baseCurrency)}
                  </Text>
                  <TextInput
                    value={selectedLimit}
                    onChangeText={setSelectedLimit}
                    onFocus={() => setIsEditingBudgetLimit(true)}
                    onBlur={() => setIsEditingBudgetLimit(false)}
                    placeholder={getPlaceholderForCurrency(baseCurrency)}
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

      {savingsGoalNames.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {savingsGoalNames.map((g) => {
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
      ) : null}

      <View style={[CardSpacing.card, styles.card]}>
        {(() => {
          const goal = plan.savingsGoals.find(
            (x) => x.name === selectedSavingsGoal,
          );
          const target = toMinorNumber((goal as any)?.targetMinor);

          return (
            <>
              {savingsGoalNames.length ? (
                <Text style={[CardSpacing.cardTitle, styles.cardTitle]}>
                  {selectedSavingsGoal}
                </Text>
              ) : (
                <>
                  <Text style={[CardSpacing.cardTitle, styles.cardTitle]}>
                    {tr("Add savings goal", "저축 목표 추가")}
                  </Text>
                  <View style={styles.textInputWrap}>
                    <TextInput
                      value={selectedSavingsGoal}
                      onChangeText={setSelectedSavingsGoal}
                      placeholder={tr("Goal name", "목표 이름")}
                      autoCapitalize="words"
                      style={styles.moneyInput}
                    />
                  </View>
                </>
              )}

              {target > 0 ? (
                <Text style={styles.cardMeta}>
                  {tr("Current goal:", "현재 목표:")}{" "}
                  {formatMoney(target, baseCurrency)}
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
                    {getCurrencySymbol(baseCurrency)}
                  </Text>
                  <TextInput
                    value={selectedSavingsTarget}
                    onChangeText={setSelectedSavingsTarget}
                    onFocus={() => setIsEditingSavingsTarget(true)}
                    onBlur={() => setIsEditingSavingsTarget(false)}
                    placeholder={getPlaceholderForCurrency(baseCurrency)}
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
  textInputWrap: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "white",
    marginBottom: 10,
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
