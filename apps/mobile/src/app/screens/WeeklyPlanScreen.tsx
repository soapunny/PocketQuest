import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { usePlan } from "../lib/planStore";
import type { PeriodType } from "../lib/planStore";
import { useTransactions } from "../lib/transactionsStore";
import { EXPENSE_CATEGORIES, SAVINGS_GOALS } from "../lib/categories";
import {
  computePlanProgressPercent,
  getPlanPeriodRange,
  isISOInRange,
} from "../lib/planProgress";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function centsFromMoney(input: string) {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const [dollars, cents = ""] = cleaned.split(".");
  const c = (cents + "00").slice(0, 2);
  return Number(dollars || "0") * 100 + Number(c);
}

export default function WeeklyPlanScreen() {
  const { plan, upsertBudgetGoalLimit, upsertSavingsGoalTarget } = usePlan();
  const { transactions } = useTransactions();

  const { startISO, endISO, type } = useMemo(
    () => getPlanPeriodRange(plan as any),
    [plan]
  );

  const periodLabel =
    type === "MONTHLY"
      ? "Monthly"
      : type === "BIWEEKLY"
      ? "Bi-weekly"
      : "Weekly";

  const periodText =
    type === "MONTHLY"
      ? "this month"
      : type === "BIWEEKLY"
      ? "this 2 weeks"
      : "this week";

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
    setSelectedLimit(g && g.limitCents > 0 ? money(g.limitCents) : "");
  }, [selectedCategory, plan.budgetGoals]);

  useEffect(() => {
    const g = plan.savingsGoals.find((x) => x.name === selectedSavingsGoal);
    setSelectedSavingsTarget(
      g && g.targetCents > 0 ? money(g.targetCents) : ""
    );
  }, [selectedSavingsGoal, plan.savingsGoals]);

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of periodTransactions) {
      if (tx.type !== "EXPENSE") continue;
      map.set(tx.category, (map.get(tx.category) || 0) + tx.amountCents);
    }
    return map;
  }, [periodTransactions]);

  const totalSpentCents = useMemo(() => {
    let sum = 0;
    for (const tx of periodTransactions) {
      if (tx.type !== "EXPENSE") continue;
      sum += tx.amountCents;
    }
    return sum;
  }, [periodTransactions]);

  const savedByGoal = useMemo(() => {
    const map = new Map<string, number>();

    for (const tx of periodTransactions) {
      if (tx.type !== "SAVING") continue; // 저축 타입만
      const goalName = String(tx.category || "Other");
      map.set(goalName, (map.get(goalName) || 0) + tx.amountCents);
    }

    return map;
  }, [periodTransactions]);

  const progressPercent = useMemo(() => {
    return computePlanProgressPercent(plan as any, transactions);
  }, [plan, transactions]);

  const saveSelectedCategoryLimit = () =>
    upsertBudgetGoalLimit(selectedCategory, centsFromMoney(selectedLimit));
  const clearSelectedCategoryLimit = () => {
    setSelectedLimit("");
    upsertBudgetGoalLimit(selectedCategory, 0);
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
    >
      <Text style={{ fontSize: 18, fontWeight: "800", marginBottom: 6 }}>
        {periodLabel} Plan
      </Text>

      <Text style={{ color: "#666", marginBottom: 16 }}>
        Progress ({periodText}): {progressPercent}%
      </Text>

      <Text style={{ fontWeight: "800", marginBottom: 8 }}>Budget Goals</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: 8,
          paddingVertical: 6,
          marginBottom: 10,
          alignItems: "center", // ✅ 칩이 세로로 늘어나는 문제 방지
        }}
      >
        {EXPENSE_CATEGORIES.map((c) => {
          const selected = c === selectedCategory;
          return (
            <Pressable
              key={c}
              onPress={() => setSelectedCategory(c)}
              style={{
                flexShrink: 0,
                minHeight: 34,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? "black" : "#ddd",
                backgroundColor: selected ? "black" : "white",
                justifyContent: "center",
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  flexShrink: 0,
                  color: selected ? "white" : "#111",
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {c}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View
        style={{
          padding: 12,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#eee",
          backgroundColor: "white",
          marginBottom: 12,
        }}
      >
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
              <Text style={{ fontWeight: "800", marginBottom: 6 }}>
                {selectedCategory}
              </Text>

              {limit > 0 ? (
                <Text style={{ color: statusColor, marginBottom: 8 }}>
                  Spent: {money(spent)} / {money(limit)}{" "}
                  {status === "SAFE"
                    ? "✅"
                    : status === "WARNING"
                    ? "⚠️"
                    : "🚨 Over"}
                </Text>
              ) : (
                <Text style={{ color: "#666", marginBottom: 8 }}>
                  No limit set for this category yet.
                </Text>
              )}

              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={selectedLimit}
                  onChangeText={setSelectedLimit}
                  placeholder={`$ ${periodLabel.toLowerCase()} limit`}
                  inputMode="decimal"
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: "#ddd",
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                />
                <Pressable
                  onPress={saveSelectedCategoryLimit}
                  style={{
                    width: 90,
                    borderRadius: 12,
                    backgroundColor: "black",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>
                    Save
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={clearSelectedCategoryLimit}
                style={{ marginTop: 8 }}
              >
                <Text style={{ color: "#666" }}>Clear this category limit</Text>
              </Pressable>
            </>
          );
        })()}
      </View>

      <Text style={{ fontWeight: "800", marginBottom: 8 }}>Savings Goals</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: 8,
          paddingVertical: 6,
          marginBottom: 10,
          alignItems: "center",
        }}
      >
        {SAVINGS_GOALS.map((g) => {
          const selected = g === selectedSavingsGoal;
          return (
            <Pressable
              key={g}
              onPress={() => setSelectedSavingsGoal(g)}
              style={{
                flexShrink: 0,
                minHeight: 34,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? "black" : "#ddd",
                backgroundColor: selected ? "black" : "white",
                justifyContent: "center",
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  flexShrink: 0,
                  color: selected ? "white" : "#111",
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {g}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View
        style={{
          padding: 12,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#eee",
          backgroundColor: "white",
          marginBottom: 18,
        }}
      >
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
              <Text style={{ fontWeight: "800", marginBottom: 6 }}>
                {selectedSavingsGoal}
              </Text>

              {target > 0 ? (
                <Text
                  style={{ marginBottom: 8, color: done ? "#0a7" : "#666" }}
                >
                  Saved: {money(saved)} / {money(target)}({pct}%){" "}
                  {done ? "✅" : ""}
                </Text>
              ) : (
                <Text style={{ marginBottom: 8, color: "#666" }}>
                  No target set for this goal yet.
                </Text>
              )}

              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={selectedSavingsTarget}
                  onChangeText={setSelectedSavingsTarget}
                  placeholder={`$ ${periodLabel.toLowerCase()} target`}
                  inputMode="decimal"
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: "#ddd",
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                />
                <Pressable
                  onPress={() =>
                    upsertSavingsGoalTarget(
                      selectedSavingsGoal,
                      centsFromMoney(selectedSavingsTarget)
                    )
                  }
                  style={{
                    width: 90,
                    borderRadius: 12,
                    backgroundColor: "black",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>
                    Save
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => {
                  setSelectedSavingsTarget("");
                  upsertSavingsGoalTarget(selectedSavingsGoal, 0);
                }}
                style={{ marginTop: 8 }}
              >
                <Text style={{ color: "#666" }}>Clear this savings target</Text>
              </Pressable>
            </>
          );
        })()}
      </View>
    </ScrollView>
  );
}
