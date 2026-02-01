// apps/mobile/src/app/screens/PlanScreen.tsx

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

// UI components and layout
import { CardSpacing } from "../components/Typography";
import ScreenHeader from "../components/layout/ScreenHeader";
import ScreenLayout from "../components/layout/ScreenLayout";

// types
import type { Currency } from "../../../../../packages/shared/src/money/types";

import { EXPENSE_CATEGORY_KEYS } from "../../../../../packages/shared/src/transactions/categories";
import { categoryLabelText } from "../domain/categories/categoryLabels";
import {
  formatMoney,
  formatMoneyNoSymbol,
  getCurrencySymbol,
  getPlaceholderForCurrency,
} from "../domain/money";
import { deriveBudgetDirty, deriveSavingsDirty } from "../domain/forms";

import { usePlan } from "../store/planStore";

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

function nextNewGoalName(existingNames: string[], isKo: boolean) {
  const base = isKo ? "새 목표" : "New Goal";
  const set = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  for (let i = 1; i <= 100; i++) {
    const candidate = `${base} ${i}`;
    if (!set.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${Date.now()}`;
}

export default function PlanScreen() {
  const {
    plan,
    upsertBudgetGoalLimit,
    upsertSavingsGoalTarget,
    addSavingsGoal,
    renameSavingsGoal,
    refreshPlan,
    saveBudgetGoals,
    saveBudgetGoal,
    saveSavingsGoals,
    removeSavingsGoal,
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
    EXPENSE_CATEGORY_KEYS[0]
  );
  const [selectedLimit, setSelectedLimit] = useState("");
  const [savingBudgetGoal, setSavingBudgetGoal] = useState(false);
  const [isEditingBudgetLimit, setIsEditingBudgetLimit] = useState(false);

  const savingsGoalOptions = useMemo(() => {
    return (plan.savingsGoals ?? [])
      .map((g: any) => ({
        id: String(g.id ?? ""),
        name: String(g.name ?? "").trim(),
      }))
      .filter((g) => g.id && g.name);
  }, [plan.savingsGoals]);

  const [selectedSavingsGoalId, setSelectedSavingsGoalId] = useState<string>(
    () => {
      return savingsGoalOptions[0]?.id ?? "";
    }
  );
  const [selectedSavingsTarget, setSelectedSavingsTarget] = useState("");
  const [savingSavingsGoal, setSavingSavingsGoal] = useState(false);
  const [deletingSavingsGoal, setDeletingSavingsGoal] = useState(false);
  const [isEditingSavingsTarget, setIsEditingSavingsTarget] = useState(false);
  const [pendingNewGoalName, setPendingNewGoalName] = useState<string | null>(
    null
  );
  const [selectedSavingsName, setSelectedSavingsName] = useState("");
  const [isEditingSavingsName, setIsEditingSavingsName] = useState(false);

  useEffect(() => {
    if (!savingsGoalOptions.length) return;
    if (
      selectedSavingsGoalId &&
      savingsGoalOptions.some((g) => g.id === selectedSavingsGoalId)
    ) {
      return;
    }
    setSelectedSavingsGoalId(savingsGoalOptions[0]?.id ?? "");
  }, [savingsGoalOptions, selectedSavingsGoalId]);

  useEffect(() => {
    if (!pendingNewGoalName) return;
    const found = (plan.savingsGoals ?? []).find(
      (g: any) =>
        String(g.name ?? "")
          .trim()
          .toLowerCase() === pendingNewGoalName.trim().toLowerCase()
    );
    if (found?.id) {
      setSelectedSavingsGoalId(String(found.id));
      setPendingNewGoalName(null);
    }
  }, [pendingNewGoalName, plan.savingsGoals]);

  const lastSyncedSavingsNameGoalIdRef = useRef<string>("");

  useEffect(() => {
    const id = String(selectedSavingsGoalId ?? "");
    if (!id) return;

    // 선택 goal이 바뀔 때만 이름을 plan에서 가져와서 input을 세팅
    if (lastSyncedSavingsNameGoalIdRef.current === id) return;

    const g = (plan.savingsGoals ?? []).find(
      (x: any) => String(x.id ?? "") === id
    );
    setSelectedSavingsName(String(g?.name ?? ""));
    lastSyncedSavingsNameGoalIdRef.current = id;
  }, [selectedSavingsGoalId, plan.savingsGoals]);

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
        : ""
    );
  }, [selectedCategory, plan.budgetGoals, baseCurrency, isEditingBudgetLimit]);

  useEffect(() => {
    if (isEditingSavingsTarget) return;

    const g = (plan.savingsGoals ?? []).find(
      (x: any) => String(x.id ?? "") === String(selectedSavingsGoalId)
    );
    const targetMinor = g ? toMinorNumber((g as any).targetMinor) : 0;
    setSelectedSavingsTarget(
      Number.isFinite(targetMinor) && targetMinor > 0
        ? formatMoneyNoSymbol(targetMinor, baseCurrency)
        : ""
    );
  }, [
    selectedSavingsGoalId,
    plan.savingsGoals,
    baseCurrency,
    isEditingSavingsTarget,
  ]);

  const saveSelectedCategoryLimit = async () => {
    try {
      if (savingBudgetGoal) return;
      setSavingBudgetGoal(true);

      // Guard: if nothing changed, do nothing
      const currentGoal = (plan.budgetGoals ?? []).find((g: any) => {
        const k = (g as any).categoryKey ?? (g as any).category ?? "";
        return normKey(k) === normKey(selectedCategory);
      });
      const currentLimitMinor = currentGoal
        ? toMinorNumber((currentGoal as any).limitMinor)
        : 0;

      const { dirty: budgetDirty, nextLimitMinor: v } = deriveBudgetDirty({
        selectedLimitText: selectedLimit,
        currentLimitMinor,
        currency: baseCurrency,
      });

      if (!budgetDirty) return;

      if (__DEV__) {
        console.log("[PlanScreen] saving budget goal", {
          selectedCategory,
          input: selectedLimit,
          parsedMinor: v,
        });
      }

      // Policy: saving 0 (or empty/invalid -> 0) deletes the goal
      if (v <= 0) {
        setSelectedLimit("");
        upsertBudgetGoalLimit(selectedCategory, 0);
        const ok = await saveBudgetGoal(selectedCategory, 0);
        if (__DEV__) console.log("[PlanScreen] saveBudgetGoal ok?", ok);
        if (!ok) throw new Error("Failed to save budget goals");
        return;
      }

      // optimistic local update
      upsertBudgetGoalLimit(selectedCategory, v);
      const ok = await saveBudgetGoal(selectedCategory, v);
      if (__DEV__) console.log("[PlanScreen] saveBudgetGoal ok?", ok);
      if (!ok) throw new Error("Failed to save budget goals");
    } catch (e: any) {
      Alert.alert(
        tr("Save failed", "저장 실패"),
        e?.message || "Unknown error"
      );
    } finally {
      setSavingBudgetGoal(false);
      setIsEditingBudgetLimit(false);
    }
  };

  const clearSelectedCategoryLimit = () => {
    // Clear는 draft만 변경. 저장은 Save 버튼으로.
    setSelectedLimit("");
    setIsEditingBudgetLimit(false);
  };

  const saveSelectedSavingsTarget = async () => {
    try {
      if (savingSavingsGoal) return;
      setSavingSavingsGoal(true);

      if (!String(selectedSavingsGoalId || "").trim()) {
        throw new Error(tr("Please select a goal", "목표를 선택하세요"));
      }
      const nameDraft = (selectedSavingsName || "").trim();
      if (!nameDraft) {
        Alert.alert(
          tr("Goal name required", "목표 이름 필요"),
          tr(
            "Please enter a goal name before saving.",
            "저장하려면 목표 이름을 입력하세요."
          )
        );
        return;
      }

      const current = (plan.savingsGoals ?? []).find(
        (x: any) => String(x.id ?? "") === String(selectedSavingsGoalId)
      );

      const currentName = String(current?.name ?? "");
      const currentTargetMinor = toMinorNumber((current as any)?.targetMinor);

      const { dirty: savingsDirty, nextTargetMinor: v } = deriveSavingsDirty({
        draftName: nameDraft,
        currentName,
        draftTargetText: selectedSavingsTarget,
        currentTargetMinor,
        currency: baseCurrency,
      });

      if (!savingsDirty) return;

      // Commit name changes on Save (blank name is already prevented above)
      if (nameDraft && String(current?.name ?? "") !== nameDraft) {
        renameSavingsGoal(selectedSavingsGoalId, nameDraft);
      }

      // 0 is allowed (draft). Do not delete.
      upsertSavingsGoalTarget(selectedSavingsGoalId, Math.max(0, v));

      const ok = await saveSavingsGoals();
      if (__DEV__) console.log("[PlanScreen] saveSavingsGoals ok?", ok);
      if (!ok) throw new Error("Failed to save savings goals");
    } catch (e: any) {
      Alert.alert(
        tr("Save failed", "저장 실패"),
        e?.message || "Unknown error"
      );
    } finally {
      setSavingSavingsGoal(false);
      setIsEditingSavingsTarget(false);
    }
  };

  const clearSelectedSavingsTarget = () => {
    // Clear는 draft만 변경. 저장은 Save 버튼으로.
    setSelectedSavingsTarget("");
    setIsEditingSavingsTarget(false);
  };

  const deleteSelectedSavingsGoal = async () => {
    const id = String(selectedSavingsGoalId ?? "").trim();
    if (!id) return;

    if (deletingSavingsGoal || savingSavingsGoal) return;

    const goal = (plan.savingsGoals ?? []).find(
      (x: any) => String(x.id ?? "") === id
    );
    const goalName =
      String(goal?.name ?? "").trim() || tr("this goal", "이 목표");

    Alert.alert(
      tr("Delete savings goal?", "저축 목표를 삭제할까요?"),
      tr(
        `Delete "${goalName}"? This cannot be undone.`,
        `"${goalName}"을(를) 삭제할까요? 되돌릴 수 없어요.`
      ),
      [
        { text: tr("Cancel", "취소"), style: "cancel" },
        {
          text: tr("Delete", "삭제"),
          style: "destructive",
          onPress: async () => {
            try {
              setDeletingSavingsGoal(true);

              // Optimistic local remove
              // (store will update snapshot)
              // @ts-ignore removeSavingsGoal exists in planStore
              removeSavingsGoal(id);

              const ok = await saveSavingsGoals();
              if (!ok) throw new Error("Failed to delete savings goal");

              // Clear local drafts so stale values don't appear on next selection
              setSelectedSavingsName("");
              setSelectedSavingsTarget("");
              setPendingNewGoalName(null);
            } catch (e: any) {
              Alert.alert(
                tr("Delete failed", "삭제 실패"),
                e?.message || "Unknown error"
              );
              // Best-effort: refresh plan to recover correct server state
              try {
                await refreshPlan();
              } catch {}
            } finally {
              setDeletingSavingsGoal(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenLayout
      keyboardAvoiding
      header={
        <ScreenHeader
          title={tr(`${periodLabel} Plan`, `${periodLabel} 플랜`)}
          subtitle={tr(
            `Set your goals for ${periodText}`,
            `${periodText} 목표를 설정하세요`
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
          const { dirty: isBudgetDirty } = deriveBudgetDirty({
            selectedLimitText: selectedLimit,
            currentLimitMinor: limit,
            currency: baseCurrency,
          });

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
                    "이 카테고리는 아직 목표 금액이 없어요."
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
                  disabled={savingBudgetGoal || !isBudgetDirty}
                  style={[
                    styles.saveBtn,
                    (savingBudgetGoal || !isBudgetDirty) &&
                      styles.saveBtnDisabled,
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
                disabled={savingBudgetGoal || !isBudgetDirty}
                style={[
                  styles.linkWrap,
                  (savingBudgetGoal || !isBudgetDirty) && styles.linkDisabled,
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

      <View style={styles.savingsHeaderRow}>
        <Text style={CardSpacing.section}>
          {tr("Savings Goals", "저축 목표")}
        </Text>
        <Pressable
          onPress={async () => {
            const existing = plan.savingsGoals ?? [];
            if (existing.length >= 10) {
              Alert.alert(
                tr("Limit reached", "제한 도달"),
                tr(
                  "You can create up to 10 savings goals per plan.",
                  "플랜당 저축 목표는 최대 10개까지 만들 수 있어요."
                )
              );
              return;
            }

            const name = nextNewGoalName(
              existing.map((g: any) => String(g.name ?? "")),
              isKo
            );

            addSavingsGoal(name, 0);
            setPendingNewGoalName(name);

            const ok = await saveSavingsGoals();
            if (!ok) {
              Alert.alert(
                tr("Save failed", "저장 실패"),
                tr(
                  "Failed to create a new savings goal.",
                  "새 저축 목표를 만드는 데 실패했어요."
                )
              );
            }
          }}
          style={styles.addGoalBtn}
        >
          <Text style={styles.addGoalBtnText}>+</Text>
        </Pressable>
      </View>

      {savingsGoalOptions.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {savingsGoalOptions.map((g) => {
            const selected = g.id === selectedSavingsGoalId;
            return (
              <Pressable
                key={g.id}
                onPress={() => setSelectedSavingsGoalId(g.id)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <View style={styles.savingsChipInnerRow}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {g.name}
                  </Text>
                  {selected ? (
                    <Pressable
                      onPress={(e: any) => {
                        // prevent changing selection when tapping the delete icon
                        e?.stopPropagation?.();
                        deleteSelectedSavingsGoal();
                      }}
                      disabled={deletingSavingsGoal || savingSavingsGoal}
                      hitSlop={10}
                      style={[
                        styles.savingsChipDeleteWrap,
                        (deletingSavingsGoal || savingSavingsGoal) &&
                          styles.savingsChipDeleteWrapDisabled,
                      ]}
                    >
                      <Text style={styles.savingsChipDeleteText}>
                        {deletingSavingsGoal ? "…" : "×"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={[CardSpacing.card, styles.card]}>
        {(() => {
          const goal = (plan.savingsGoals ?? []).find(
            (x: any) => String(x.id ?? "") === String(selectedSavingsGoalId)
          );
          const target = toMinorNumber((goal as any)?.targetMinor);
          const currentName = String((goal as any)?.name ?? "");
          const {
            dirty: isSavingsDirty,
            nameDirty: isSavingsNameDirty,
            targetDirty: isSavingsTargetDirty,
          } = deriveSavingsDirty({
            draftName: selectedSavingsName,
            currentName,
            draftTargetText: selectedSavingsTarget,
            currentTargetMinor: target,
            currency: baseCurrency,
          });
          return (
            <>
              {/* Delete button header row removed per UI update */}
              {savingsGoalOptions.length ? (
                <View style={styles.textInputWrap}>
                  <TextInput
                    value={selectedSavingsName}
                    onChangeText={setSelectedSavingsName}
                    onFocus={() => setIsEditingSavingsName(true)}
                    onBlur={() => {
                      setIsEditingSavingsName(false);
                      // Save가 커밋이므로 blur에서 store/plan을 변경하지 않는다.
                      const id = String(selectedSavingsGoalId ?? "").trim();
                      if (id) lastSyncedSavingsNameGoalIdRef.current = id;
                    }}
                    placeholder={tr("Goal name", "목표 이름")}
                    autoCapitalize="words"
                    style={styles.moneyInput}
                  />
                </View>
              ) : (
                <>
                  <Text style={[CardSpacing.cardTitle, styles.cardTitle]}>
                    {tr("No savings goals yet", "저축 목표가 아직 없어요")}
                  </Text>
                  <Text style={styles.cardBody}>
                    {tr(
                      "Tap + to create your first savings goal.",
                      "+ 버튼을 눌러 첫 저축 목표를 만들어보세요."
                    )}
                  </Text>
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
                    "이 목표는 아직 목표 금액이 없어요."
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
                    editable={savingsGoalOptions.length > 0}
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
                  disabled={
                    savingSavingsGoal ||
                    !isSavingsDirty ||
                    savingsGoalOptions.length === 0
                  }
                  style={[
                    styles.saveBtn,
                    (savingSavingsGoal ||
                      !isSavingsDirty ||
                      savingsGoalOptions.length === 0) &&
                      styles.saveBtnDisabled,
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
                disabled={
                  savingSavingsGoal ||
                  !isSavingsDirty ||
                  savingsGoalOptions.length === 0
                }
                style={[
                  styles.linkWrap,
                  (savingSavingsGoal ||
                    !isSavingsDirty ||
                    savingsGoalOptions.length === 0) &&
                    styles.linkDisabled,
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
  savingsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addGoalBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },
  addGoalBtnText: { fontSize: 18, fontWeight: "900", color: "#111" },

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

  savingsChipInnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  savingsChipDeleteWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ff4d4f",
    backgroundColor: "white",
  },
  savingsChipDeleteWrapDisabled: {
    opacity: 0.5,
  },
  savingsChipDeleteText: {
    color: "#ff4d4f",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 14,
  },
});
