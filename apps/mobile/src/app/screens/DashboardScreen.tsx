import React, { useLayoutEffect, useMemo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { usePlan } from "../lib/planStore";
import type { PeriodType } from "../lib/planStore";
import { useTransactions } from "../lib/transactionsStore";
import { useNavigation } from "@react-navigation/native";

import { getPlanPeriodRange, isISOInRange } from "../lib/planProgress";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function DashboardScreen() {
  const navigation = useNavigation<any>();

  const { plan } = usePlan();
  const { transactions } = useTransactions();

  const { startISO, endISO, type } = useMemo(
    () => getPlanPeriodRange(plan as any),
    [plan]
  );
  const periodLabel =
    type === "MONTHLY"
      ? "This month"
      : type === "BIWEEKLY"
      ? "This 2 weeks"
      : "This week";

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

  // Helper to get category limit from plan
  const getCategoryLimitCents = (category: string): number => {
    const goals: any = (plan as any).budgetGoals;
    if (!goals) return 0;

    // Array form: [{ category: string, limitCents: number }]
    if (Array.isArray(goals)) {
      const found = goals.find((g) => String(g.category) === category);
      return found?.limitCents ?? 0;
    }

    // Object/map form: { [category]: number } or { [category]: { limitCents } }
    const v = (goals as any)[category];
    if (typeof v === "number") return v;
    if (v && typeof v.limitCents === "number") return v.limitCents;

    return 0;
  };

  const totalSpentCents = useMemo(() => {
    let sum = 0;
    for (const tx of periodTransactions) {
      if (tx.type !== "EXPENSE") continue;
      sum += tx.amountCents;
    }
    return sum;
  }, [periodTransactions]);

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of periodTransactions) {
      if (tx.type !== "EXPENSE") continue;
      const key = String(tx.category || "Other");
      map.set(key, (map.get(key) || 0) + tx.amountCents);
    }
    return map;
  }, [periodTransactions]);

  const budgetAlerts = useMemo(() => {
    const rows: Array<{
      category: string;
      spentCents: number;
      limitCents: number;
      ratio: number;
      status: "WARNING" | "OVER";
    }> = [];

    for (const [category, spentCents] of spentByCategory.entries()) {
      const limitCents = getCategoryLimitCents(category);
      if (!limitCents || limitCents <= 0) continue;

      const ratio = spentCents / limitCents;
      if (ratio < 0.8) continue;

      const status: "WARNING" | "OVER" = ratio > 1 ? "OVER" : "WARNING";
      rows.push({ category, spentCents, limitCents, ratio, status });
    }

    rows.sort((a, b) => {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      return b.spentCents - a.spentCents;
    });

    return rows.slice(0, 3);
  }, [spentByCategory, plan]);

  const savedByGoal = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of periodTransactions) {
      if (tx.type !== "SAVING") continue;
      const goalName = String(tx.category || "Other");
      map.set(goalName, (map.get(goalName) || 0) + tx.amountCents);
    }
    return map;
  }, [periodTransactions]);

  const totalSavedCents = useMemo(() => {
    let sum = 0;
    for (const v of savedByGoal.values()) sum += v;
    return sum;
  }, [savedByGoal]);

  const totalSavingsTargetCents = useMemo(() => {
    let sum = 0;
    for (const g of plan.savingsGoals) {
      if (g.targetCents > 0) sum += g.targetCents;
    }
    return sum;
  }, [plan.savingsGoals]);

  const savingsProgressRows = useMemo(() => {
    const rows: Array<{
      name: string;
      savedCents: number;
      targetCents: number;
      ratio: number;
    }> = [];

    for (const g of plan.savingsGoals) {
      const name = String(
        (g as any).name ?? (g as any).title ?? (g as any).goalName ?? "Goal"
      );
      const targetCents = Number((g as any).targetCents ?? 0);
      if (!Number.isFinite(targetCents) || targetCents <= 0) continue;

      const savedCents = savedByGoal.get(name) ?? 0;
      const ratio = targetCents > 0 ? savedCents / targetCents : 0;
      rows.push({ name, savedCents, targetCents, ratio });
    }

    rows.sort((a, b) => {
      // most behind first (lower ratio), then bigger targets
      if (a.ratio !== b.ratio) return a.ratio - b.ratio;
      return b.targetCents - a.targetCents;
    });

    return rows;
  }, [plan.savingsGoals, savedByGoal]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate("Settings")}
          style={{ paddingHorizontal: 12 }}
        >
          <Text style={{ fontSize: 18 }}>⚙️</Text>
        </Pressable>
      ),
    });
  }, [navigation]);
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Dashboard</Text>
        <Text style={styles.subtitle}>{periodLabel} at a glance</Text>
      </View>

      <Text style={styles.sectionTitle}>Budget</Text>

      {/* Total Budget Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Total Budget</Text>
          {plan.totalBudgetLimitCents > 0 ? (
            (() => {
              const ratio = totalSpentCents / plan.totalBudgetLimitCents;
              const status =
                ratio > 1 ? "OVER" : ratio > 0.8 ? "WARNING" : "SAFE";
              const statusLabel =
                status === "SAFE"
                  ? "Safe"
                  : status === "WARNING"
                  ? "Warning"
                  : "Over";
              const statusColor =
                status === "OVER"
                  ? "#c00"
                  : status === "WARNING"
                  ? "#c90"
                  : "#0a7";
              return (
                <Text
                  style={[
                    styles.pill,
                    { color: statusColor, borderColor: statusColor },
                  ]}
                >
                  {statusLabel}
                </Text>
              );
            })()
          ) : (
            <Text style={[styles.pill, { color: "#666", borderColor: "#ddd" }]}>
              Not set
            </Text>
          )}
        </View>

        {plan.totalBudgetLimitCents > 0 ? (
          (() => {
            const ratio = totalSpentCents / plan.totalBudgetLimitCents;
            const clamped = Math.min(1, Math.max(0, ratio));
            const remaining = plan.totalBudgetLimitCents - totalSpentCents;

            const status =
              ratio > 1 ? "OVER" : ratio > 0.8 ? "WARNING" : "SAFE";
            const statusColor =
              status === "OVER"
                ? "#c00"
                : status === "WARNING"
                ? "#c90"
                : "#0a7";

            return (
              <>
                <View style={styles.rowBetween}>
                  <Text style={styles.kpiLabel}>Spent</Text>
                  <Text style={styles.kpiValue}>
                    {money(totalSpentCents)} /{" "}
                    {money(plan.totalBudgetLimitCents)}
                  </Text>
                </View>

                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.round(clamped * 100)}%`,
                        backgroundColor: statusColor,
                      },
                    ]}
                  />
                </View>

                <View style={styles.rowBetween}>
                  <Text style={styles.kpiLabel}>Remaining</Text>
                  <Text
                    style={[
                      styles.kpiValue,
                      { color: remaining >= 0 ? "#111" : "#c00" },
                    ]}
                  >
                    {money(remaining)}
                  </Text>
                </View>

                <Text style={styles.help}>
                  Auto total is the sum of your category limits.
                </Text>
              </>
            );
          })()
        ) : (
          <Text style={styles.help}>
            Set category limits in Plan to generate your total budget
            automatically.
          </Text>
        )}
      </View>

      {/* Budget Alerts Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Budget Alerts</Text>
          <Text style={[styles.pill, { color: "#111", borderColor: "#ddd" }]}>
            {periodLabel}
          </Text>
        </View>

        {budgetAlerts.length === 0 ? (
          <Text style={styles.help}>
            No categories are near or over their limits. Nice work.
          </Text>
        ) : (
          <View style={{ gap: 12 }}>
            {budgetAlerts.map((row) => {
              const pctLabel = Math.round(row.ratio * 100);
              const pctBar = Math.round(
                Math.min(1, Math.max(0, row.ratio)) * 100
              );
              const color = row.status === "OVER" ? "#c00" : "#c90";
              return (
                <View key={row.category}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.kpiLabel}>{row.category}</Text>
                    <Text style={[styles.pill, { color, borderColor: color }]}>
                      {row.status === "OVER" ? "Over" : "Warning"}
                    </Text>
                  </View>

                  <View style={styles.rowBetween}>
                    <Text style={styles.help}>
                      {money(row.spentCents)} / {money(row.limitCents)}
                    </Text>
                    <Text style={[styles.help, { fontWeight: "800", color }]}>
                      {pctLabel}%
                    </Text>
                  </View>

                  <View style={styles.barTrackSmall}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${pctBar}%`, backgroundColor: color },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
            <Text style={styles.help}>
              Categories at 80%+ are flagged to help you avoid going over
              budget.
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.sectionTitle}>Savings</Text>
      {/* Total Savings Card */}
      <View style={[styles.card, styles.cardSavings]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Total Savings</Text>
          {totalSavingsTargetCents > 0 ? (
            (() => {
              const ratio = totalSavedCents / totalSavingsTargetCents;
              const done = ratio >= 1;
              return (
                <Text
                  style={[
                    styles.pill,
                    {
                      color: done ? "#0a7" : "#111",
                      borderColor: done ? "#0a7" : "#ddd",
                    },
                  ]}
                >
                  {done ? "Achieved" : "In progress"}
                </Text>
              );
            })()
          ) : (
            <Text style={[styles.pill, { color: "#666", borderColor: "#ddd" }]}>
              Not set
            </Text>
          )}
        </View>

        {totalSavingsTargetCents > 0 ? (
          (() => {
            const ratio = totalSavedCents / totalSavingsTargetCents;
            const clamped = Math.min(1, Math.max(0, ratio));
            const pct = Math.round(clamped * 100);
            const done = ratio >= 1;
            const color = done ? "#0a7" : "#111";

            return (
              <>
                <View style={styles.rowBetween}>
                  <Text style={styles.kpiLabel}>Saved</Text>
                  <Text style={styles.kpiValue}>
                    {money(totalSavedCents)} / {money(totalSavingsTargetCents)}
                  </Text>
                </View>

                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${pct}%`, backgroundColor: color },
                    ]}
                  />
                </View>

                <Text style={styles.help}>
                  Total target is the sum of your savings goal targets.
                </Text>

                {/* Per-goal breakdown */}
                {savingsProgressRows.length === 0 ? (
                  <Text style={styles.help}>
                    No savings goals with targets yet.
                  </Text>
                ) : (
                  <View style={{ gap: 10, marginTop: 10 }}>
                    <Text style={styles.subhead}>By goal</Text>
                    {savingsProgressRows.map((r) => {
                      const pctLabel = Math.round(r.ratio * 100);
                      const pctBar = Math.round(
                        Math.min(1, Math.max(0, r.ratio)) * 100
                      );
                      const done = r.ratio >= 1;
                      const rowColor = done ? "#0a7" : "#111";

                      return (
                        <View key={r.name} style={styles.goalRow}>
                          <View style={styles.rowBetween}>
                            <Text style={[styles.goalName, { color: "#111" }]}>
                              {r.name}
                            </Text>
                            <Text
                              style={[
                                styles.pill,
                                {
                                  color: rowColor,
                                  borderColor: done ? "#0a7" : "#ddd",
                                },
                              ]}
                            >
                              {done ? "Achieved" : `${pctLabel}%`}
                            </Text>
                          </View>

                          <View style={styles.rowBetween}>
                            <Text style={styles.help}>
                              {money(r.savedCents)} / {money(r.targetCents)}
                            </Text>
                          </View>

                          <View style={styles.barTrackSmall}>
                            <View
                              style={[
                                styles.barFill,
                                {
                                  width: `${pctBar}%`,
                                  backgroundColor: done ? "#0a7" : "#111",
                                },
                              ]}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            );
          })()
        ) : (
          <Text style={styles.help}>
            Set savings targets in Plan to track your savings progress for this
            period.
          </Text>
        )}
      </View>

      <View style={{ height: 18 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    marginTop: 6,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: "900",
    color: "#111",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  cardSavings: {
    borderColor: "#d7f5e6",
    backgroundColor: "#f7fffb",
  },
  page: {
    flex: 1,
    backgroundColor: "#f6f6f7",
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111",
  },
  subtitle: {
    marginTop: 4,
    color: "#666",
  },
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111",
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    fontWeight: "800",
    fontSize: 12,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  kpiLabel: {
    color: "#666",
    fontWeight: "700",
  },
  kpiValue: {
    color: "#111",
    fontWeight: "900",
  },
  barTrack: {
    height: 10,
    backgroundColor: "#eee",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 10,
    marginBottom: 10,
  },
  barTrackSmall: {
    height: 8,
    backgroundColor: "#eee",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 6,
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
  },
  help: {
    color: "#666",
    marginTop: 6,
    lineHeight: 18,
  },
  subhead: {
    fontSize: 13,
    fontWeight: "900",
    color: "#111",
    marginBottom: 2,
  },
  goalRow: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eee",
  },
  goalName: {
    fontWeight: "900",
    color: "#111",
  },
});
