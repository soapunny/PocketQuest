// apps/mobile/src/app/screens/DashboardScreen.tsx

import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";

import ScreenLayout from "../components/layout/ScreenLayout";
import ScreenHeader from "../components/layout/ScreenHeader";
import ScreenCard from "../components/layout/ScreenCard";
import { CardSpacing } from "../components/Typography";
import { MetricCard } from "../components/MetricCard";
import { LoadingCard } from "../components/LoadingCard";
import { Colors, FontSize, FontWeight, Radius, Spacing, Opacity } from "../theme";

import type { Currency } from "@pq/shared/money";

import { useDashboardStore } from "../store/dashboardStore";
import { useUserPrefsStore } from "../store/userPrefsStore";
import { usePlanStore } from "../store/planStore";

import { formatMoney } from "../domain/money";
import {
  getPeriodLabelKey,
  periodLabelText,
  getPlanPeriodType,
} from "../domain/plan/period";
import { categoryLabelText } from "../domain/categories/categoryLabels";

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function pctFromRatio(ratio: number, cap: number = 999) {
  if (!Number.isFinite(ratio)) return 0;
  const pct = Math.round(ratio * 100);
  return Math.max(-cap, Math.min(cap, pct));
}

type CashflowHealthKey = "HEALTHY" | "OK" | "CAUTION" | "RISK";

type BudgetHealthKey = "GOOD" | "CAUTION" | "OVER";

// Cashflow status should reflect how much of income remains (net/income), not raw spend rate.
// Example: spending 50% => remaining 50% => should be "HEALTHY"/"OK", not "CAUTION".
function cashflowHealthKeyFromRemainingRatio(
  remainingRatio: number
): CashflowHealthKey {
  if (!Number.isFinite(remainingRatio)) return "CAUTION";

  // remainingRatio can be negative (overspent)
  if (remainingRatio < 0) return "RISK";

  // 0%~10% remaining: caution
  if (remainingRatio < 0.1) return "CAUTION";

  // 10%~30% remaining: ok
  if (remainingRatio < 0.3) return "OK";

  // 30%+ remaining: healthy
  return "HEALTHY";
}

function budgetHealthKeyFromRatio(
  ratio: number,
  limitMinor: number
): BudgetHealthKey {
  if (!Number.isFinite(limitMinor) || limitMinor <= 0) return "GOOD";
  if (ratio < 0.9) return "GOOD";
  if (ratio <= 1.0) return "CAUTION";
  return "OVER";
}

type SavingsHealthKey = "PUSH" | "GOOD" | "BEST";

function savingsHealthKeyFromRatio(ratio: number): SavingsHealthKey {
  if (!Number.isFinite(ratio)) return "PUSH";
  if (ratio < 0.5) return "PUSH";
  if (ratio >= 0.9) return "BEST";
  return "GOOD";
}

export default function DashboardScreen() {
  const { dashboard, isHydrated } = useDashboardStore();
  const { language, currency } = useUserPrefsStore();
  const { plan } = usePlanStore();

  const isKo = language === "ko";
  const tr = (en: string, ko: string) => (isKo ? ko : en);

  const [isBudgetDetailsOpen, setIsBudgetDetailsOpen] = useState(false);
  const [isSavingsDetailsOpen, setIsSavingsDetailsOpen] = useState(false);
  const [isCashflowDetailsOpen, setIsCashflowDetailsOpen] = useState(false);

  type StatusDescriptor = { text: string; color: string; arrow: string };
  const cashflowHealthDescriptor = (
    key: CashflowHealthKey
  ): StatusDescriptor => {
    switch (key) {
      case "HEALTHY":
        return { text: tr("Good", "좋음"), color: Colors.statusGood, arrow: "👍" };
      case "OK":
        return { text: tr("Okay", "보통"), color: Colors.statusOk, arrow: "👌" };
      case "CAUTION":
        return { text: tr("Caution", "주의"), color: Colors.statusCaution, arrow: "❗" };
      case "RISK":
        return { text: tr("Risk", "위험"), color: Colors.statusRisk, arrow: "⚠️" };
    }
  };

  const budgetHealthDescriptor = (key: BudgetHealthKey): StatusDescriptor => {
    switch (key) {
      case "GOOD":
        return { text: tr("Good", "좋음"), color: Colors.statusGood, arrow: "👍" };
      case "CAUTION":
        return { text: tr("Caution", "주의"), color: Colors.statusCaution, arrow: "❗" };
      case "OVER":
        return { text: tr("Over", "초과"), color: Colors.statusRisk, arrow: "🚨" };
    }
  };

  const savingsHealthDescriptor = (key: SavingsHealthKey): StatusDescriptor => {
    switch (key) {
      case "PUSH":
        return { text: tr("Keep going", "분발"), color: Colors.savingsPush, arrow: "👏" };
      case "GOOD":
        return { text: tr("Good", "굿"), color: Colors.savingsGood, arrow: "👍" };
      case "BEST":
        return { text: tr("Great", "최고"), color: Colors.savingsBest, arrow: "🎉" };
    }
  };

  const periodLabel = useMemo(() => {
    const periodType = getPlanPeriodType(plan);
    const key = getPeriodLabelKey(periodType);
    return periodLabelText(key);
  }, [plan]);

  if (!isHydrated || !dashboard || !currency) {
    return (
      <ScreenLayout
        header={
          <ScreenHeader
            title={tr("Dashboard", "대시보드")}
            subtitle={tr("Loading…", "불러오는 중…")}
          />
        }
      >
        <LoadingCard label={tr("Preparing dashboard…", "대시보드를 준비 중이에요…")} />
      </ScreenLayout>
    );
  }

  const hc = currency as Currency;

  const { totals, range, budgetStatusRows, savingsProgressRows } = dashboard;

  // Cashflow SSOT (operational main)
  const cfOp = dashboard?.cashflow?.operational;
  const opIncome = cfOp?.incomeMinor ?? totals?.incomeMinor ?? 0;
  const opExpense = cfOp?.expenseMinor ?? totals?.spentMinor ?? 0;
  const opNet = cfOp?.netMinor ?? opIncome - opExpense;

  const cfSp = dashboard?.cashflow?.spendable;
  const spSaving = cfSp?.savingMinor ?? totals?.savingMinor ?? 0;
  const spNet = cfSp?.netMinor ?? opIncome - opExpense - spSaving;

  const totalBudgetLimitMinor = (budgetStatusRows ?? []).reduce(
    (sum, row) => sum + (Number.isFinite(row.limitMinor) ? row.limitMinor : 0),
    0
  );

  // Use `totals.spentMinor` as authoritative spending within the period.
  const totalBudgetSpentMinor = totals?.spentMinor ?? 0;
  const totalBudgetRemainingMinor =
    totalBudgetLimitMinor - totalBudgetSpentMinor;

  const budgetSummary = {
    spentMinor: totalBudgetSpentMinor,
    limitMinor: totalBudgetLimitMinor,
    remainingMinor: totalBudgetRemainingMinor,
  };

  const hasIncome = opIncome > 0;

  const spendRate = hasIncome ? opExpense / opIncome : 0;

  const cashflowRemainingRatio = hasIncome ? (opNet ?? 0) / opIncome : 0;
  const cashflowRemainingPct = pctFromRatio(cashflowRemainingRatio);

  const cashflowHealth = {
    spendRate,
    remainingRatio: cashflowRemainingRatio,
    key: cashflowHealthKeyFromRemainingRatio(cashflowRemainingRatio),
  };

  const budgetSpentRatio =
    totalBudgetLimitMinor > 0
      ? totalBudgetSpentMinor / totalBudgetLimitMinor
      : 0;

  const budgetRemainingRatio =
    totalBudgetLimitMinor > 0
      ? totalBudgetRemainingMinor / totalBudgetLimitMinor
      : 0;

  const budgetRemainingPct = pctFromRatio(budgetRemainingRatio);

  const budgetHealth = {
    key: budgetHealthKeyFromRatio(budgetSpentRatio, totalBudgetLimitMinor),
  };

  const cashflowStatus = hasIncome
    ? (() => {
        const s = cashflowHealthDescriptor(cashflowHealth.key);
        return { label: `${s.arrow} ${s.text}`, color: s.color };
      })()
    : undefined;

  const budgetStatus = (() => {
    const s = budgetHealthDescriptor(budgetHealth.key);
    return { label: `${s.arrow} ${s.text}`, color: s.color };
  })();

  const periodText = `${range.periodStartLocal} → ${range.periodEndLocal}`;

  const perCategoryBudgets = (budgetStatusRows ?? [])
    .filter((r) => Number.isFinite(r.limitMinor) && r.limitMinor > 0)
    .map((r) => {
      const limitMinor = Math.trunc(Number(r.limitMinor) || 0);
      const spentMinor = Math.trunc(Number(r.spentMinor) || 0);
      const remainingMinor = Math.trunc(Number(r.remainingMinor) || 0);
      const spentRatio = limitMinor > 0 ? spentMinor / limitMinor : 0;
      const remainingRatio = limitMinor > 0 ? remainingMinor / limitMinor : 0;

      const key = budgetHealthKeyFromRatio(spentRatio, limitMinor);
      const d = budgetHealthDescriptor(key);

      const categoryKey = String(
        (r as any).categoryKey ?? (r as any).category ?? ""
      );
      const title = categoryLabelText(categoryKey, language);

      return {
        title,
        spentMinor,
        limitMinor,
        remainingMinor,
        spentRatio,
        pct: pctFromRatio(remainingRatio),
        status: { label: `${d.arrow} ${d.text}`, color: d.color },
      };
    });

  // Unassigned SAVING amount in this period:
  // Server does not emit a null-goal row, so derive from totals.savingMinor.
  const trackedSavedMinor = (savingsProgressRows ?? []).reduce(
    (sum, r) => sum + Math.trunc(Number(r.savedMinor) || 0),
    0
  );

  const totalSavingMinor = Math.trunc(
    Number((totals as any)?.savingMinor) || 0
  );

  // Derived unassigned = all savings - tracked goal savings
  const unassignedSavedMinor = Math.max(
    0,
    totalSavingMinor - trackedSavedMinor
  );

  const perSavingsGoals = (savingsProgressRows ?? [])
    .filter((r) => Number.isFinite(r.targetMinor) && r.targetMinor > 0)
    .map((r) => {
      const targetMinor = Math.trunc(Number(r.targetMinor) || 0);
      const savedMinor = Math.trunc(Number(r.savedMinor) || 0);
      const remainingMinor = targetMinor - savedMinor;
      const ratio = targetMinor > 0 ? savedMinor / targetMinor : 0;

      const pct = Math.round(clamp01(ratio) * 100);

      const key = savingsHealthKeyFromRatio(ratio);
      const d = savingsHealthDescriptor(key);

      return {
        key: String(r.goalId || r.name),
        title: String(r.name || tr("Savings", "저축")),
        savedMinor,
        targetMinor,
        remainingMinor,
        ratio,
        pct: pctFromRatio(ratio),
        status: { label: `${d.arrow} ${d.text}`, color: d.color },
      };
    });

  // Only show Unassigned when it exists in this plan period.
  if (unassignedSavedMinor > 0) {
    perSavingsGoals.push({
      key: "__unassigned__",
      title: tr("Unassigned", "미지정"),
      savedMinor: unassignedSavedMinor,
      // Display as saved/saved to avoid implying a target exists.
      targetMinor: unassignedSavedMinor,
      remainingMinor: 0,
      ratio: 1,
      pct: 100,
      status: { label: "—", color: Colors.statusMuted },
    });
  }

  const totalSavings = (savingsProgressRows ?? [])
    .filter((r) => Number.isFinite(r.targetMinor) && r.targetMinor > 0)
    .reduce(
      (acc, r) => {
        const targetMinor = Math.trunc(Number(r.targetMinor) || 0);
        const savedMinor = Math.trunc(Number(r.savedMinor) || 0);
        acc.targetMinor += targetMinor;
        acc.savedMinor += savedMinor;
        return acc;
      },
      { targetMinor: 0, savedMinor: 0 }
    );

  const totalSavingsRemainingMinor =
    totalSavings.targetMinor - totalSavings.savedMinor;

  const totalSavingsRatio =
    totalSavings.targetMinor > 0
      ? totalSavings.savedMinor / totalSavings.targetMinor
      : 0;

  const totalSavingsPct = pctFromRatio(totalSavingsRatio);

  const totalSavingsStatus = (() => {
    const s = savingsHealthDescriptor(
      savingsHealthKeyFromRatio(totalSavingsRatio)
    );
    return { label: `${s.arrow} ${s.text}`, color: s.color };
  })();

  return (
    <ScreenLayout
      header={
        <ScreenHeader
          title={tr("Dashboard", "대시보드")}
          subtitle={tr(
            `${periodLabel} at a glance`,
            `${periodLabel} 한눈에 보기`
          )}
        />
      }
    >
      {/* Period */}
      <Text style={CardSpacing.section}>{tr("Period", "기간")}</Text>
      <View style={styles.grid1}>
        <MetricCard
          title={tr("Current period", "현재 기간")}
          value={periodLabel}
          sub={periodText}
        />
      </View>

      {/* Cashflow */}
      <View style={styles.sectionRow}>
        <Text style={CardSpacing.section}>{tr("Cashflow", "현금 흐름")}</Text>
        <Pressable
          onPress={() => setIsCashflowDetailsOpen((v) => !v)}
          style={styles.detailsBtn}
        >
          <Text style={styles.detailsBtnText}>
            {isCashflowDetailsOpen ? tr("Hide", "닫기") : tr("Details", "상세")}
          </Text>
        </Pressable>
      </View>
      <View style={styles.grid2}>
        <MetricCard
          title={tr("Cashflow", "현금 흐름")}
          value={tr(
            `${formatMoney(opExpense, hc)} / ${formatMoney(opIncome, hc)}`,
            `${formatMoney(opExpense, hc)} / ${formatMoney(opIncome, hc)}`
          )}
          status={cashflowStatus}
          progress={
            cashflowStatus
              ? { ratio: cashflowHealth.spendRate, color: cashflowStatus.color }
              : undefined
          }
          sub={
            <>
              <Text style={styles.metricSub}>
                {tr(
                  `Remaining: ${formatMoney(opNet, hc)} · `,
                  `남음: ${formatMoney(opNet, hc)} · `
                )}
              </Text>
              {hasIncome && cashflowStatus ? (
                <Text
                  style={[styles.metricSub, { color: cashflowStatus.color }]}
                >
                  {`${cashflowRemainingPct}%`}
                </Text>
              ) : (
                <Text
                  style={[
                    styles.metricSub,
                    { color: Colors.statusMuted },
                  ]}
                >
                  —
                </Text>
              )}
            </>
          }
        />
      </View>

      {isCashflowDetailsOpen ? (
        <>
          <View style={styles.detailsBox}>
            <Text style={styles.detailsBoxTitle}>
              {tr("Cashflow details", "현금 흐름 상세")}
            </Text>
            <View style={styles.grid2}>
              <MetricCard
                title={tr("Cashflow (Spendable)", "현금 흐름 (사용 가능)")}
                value={formatMoney(spNet, hc)}
                sub={tr(
                  `Income: ${formatMoney(
                    opIncome,
                    hc
                  )} · Expense: ${formatMoney(
                    opExpense,
                    hc
                  )} · Savings: ${formatMoney(spSaving, hc)}`,
                  `수입: ${formatMoney(opIncome, hc)} · 지출: ${formatMoney(
                    opExpense,
                    hc
                  )} · 저축: ${formatMoney(spSaving, hc)}`
                )}
                variant="detail"
              />

              <ScreenCard style={[styles.metricCard, styles.metricCardDetail]}>
                <View style={styles.metricTopRow}>
                  <Text style={[styles.metricTitle, styles.metricTitleDetail]}>
                    {tr("Savings by goal", "목표별 저축")}
                  </Text>
                </View>

                <View style={styles.sectionDivider} />

                <View style={styles.savingsByGoalList}>
                  {(savingsProgressRows ?? []).map((r) => (
                    <View key={r.goalId} style={styles.savingsByGoalRow}>
                      <Text style={styles.savingsByGoalName} numberOfLines={1}>
                        {String(r.name || tr("Savings", "저축"))}
                      </Text>
                      <Text style={styles.savingsByGoalAmount}>
                        {formatMoney(Math.trunc(Number(r.savedMinor) || 0), hc)}
                      </Text>
                    </View>
                  ))}

                  {unassignedSavedMinor > 0 ? (
                    <View style={styles.savingsByGoalRow}>
                      <Text
                        style={[
                          styles.savingsByGoalName,
                          styles.unassignedLabel,
                        ]}
                        numberOfLines={1}
                      >
                        {tr("(auto) Unassigned", "(자동) 미지정")}
                      </Text>
                      <Text style={styles.savingsByGoalAmount}>
                        {formatMoney(unassignedSavedMinor, hc)}
                      </Text>
                    </View>
                  ) : null}

                  {(!savingsProgressRows?.length ||
                    (savingsProgressRows ?? []).every(
                      (r) => Math.trunc(Number(r.savedMinor) || 0) === 0
                    )) &&
                  unassignedSavedMinor <= 0 ? (
                    <Text style={styles.savingsByGoalEmpty}>—</Text>
                  ) : null}
                </View>
              </ScreenCard>
            </View>
          </View>
        </>
      ) : null}

      {/* Budget */}
      <View style={styles.sectionRow}>
        <Text style={CardSpacing.section}>{tr("Budget", "예산")}</Text>
        <Pressable
          onPress={() => setIsBudgetDetailsOpen((v) => !v)}
          style={[
            styles.detailsBtn,
            !perCategoryBudgets.length && styles.detailsBtnDisabled,
          ]}
          disabled={!perCategoryBudgets.length}
        >
          <Text
            style={[
              styles.detailsBtnText,
              !perCategoryBudgets.length && styles.detailsBtnTextDisabled,
            ]}
          >
            {isBudgetDetailsOpen ? tr("Hide", "닫기") : tr("Details", "상세")}
          </Text>
        </Pressable>
      </View>
      <View style={styles.grid2}>
        <MetricCard
          title={tr("Total budget", "전체 예산")}
          value={tr(
            `${formatMoney(budgetSummary.spentMinor, hc)} / ${formatMoney(
              budgetSummary.limitMinor,
              hc
            )}`,
            `${formatMoney(budgetSummary.spentMinor, hc)} / ${formatMoney(
              budgetSummary.limitMinor,
              hc
            )}`
          )}
          status={budgetStatus}
          progress={{
            ratio: budgetSpentRatio,
            color: budgetStatus.color,
          }}
          sub={
            <>
              <Text style={styles.metricSub}>
                {tr(
                  `Remaining: ${formatMoney(
                    budgetSummary.remainingMinor,
                    hc
                  )} · `,
                  `남음: ${formatMoney(budgetSummary.remainingMinor, hc)} · `
                )}
              </Text>
              <Text style={[styles.metricSub, { color: budgetStatus.color }]}>
                {`${budgetRemainingPct}%`}
              </Text>
            </>
          }
        />
      </View>

      {perCategoryBudgets.length && isBudgetDetailsOpen ? (
        <>
          <View style={styles.detailsBox}>
            <Text style={styles.detailsBoxTitle}>
              {tr("Budget details", "예산 상세")}
            </Text>
            <View style={styles.grid2}>
              {perCategoryBudgets.map((b) => (
                <MetricCard
                  key={b.title}
                  title={b.title}
                  value={tr(
                    `${formatMoney(b.spentMinor, hc)} / ${formatMoney(
                      b.limitMinor,
                      hc
                    )}`,
                    `${formatMoney(b.spentMinor, hc)} / ${formatMoney(
                      b.limitMinor,
                      hc
                    )}`
                  )}
                  status={b.status}
                  progress={{ ratio: b.spentRatio, color: b.status.color }}
                  sub={
                    <>
                      <Text style={styles.metricSub}>
                        {tr(
                          `Remaining: ${formatMoney(b.remainingMinor, hc)} · `,
                          `남음: ${formatMoney(b.remainingMinor, hc)} · `
                        )}
                      </Text>
                      <Text
                        style={[styles.metricSub, { color: b.status.color }]}
                      >
                        {`${b.pct}%`}
                      </Text>
                    </>
                  }
                  variant="detail"
                />
              ))}
            </View>
          </View>
        </>
      ) : null}

      {/* Savings */}
      <View style={styles.sectionRow}>
        <Text style={CardSpacing.section}>{tr("Savings", "저축")}</Text>
        <Pressable
          onPress={() => setIsSavingsDetailsOpen((v) => !v)}
          style={[
            styles.detailsBtn,
            !perSavingsGoals.length && styles.detailsBtnDisabled,
          ]}
          disabled={!perSavingsGoals.length}
        >
          <Text
            style={[
              styles.detailsBtnText,
              !perSavingsGoals.length && styles.detailsBtnTextDisabled,
            ]}
          >
            {isSavingsDetailsOpen ? tr("Hide", "닫기") : tr("Details", "상세")}
          </Text>
        </Pressable>
      </View>

      <View style={styles.grid2}>
        {totalSavings.targetMinor > 0 ? (
          <MetricCard
            title={tr("Total savings", "전체 저축")}
            value={tr(
              `${formatMoney(totalSavings.savedMinor, hc)} / ${formatMoney(
                totalSavings.targetMinor,
                hc
              )}`,
              `${formatMoney(totalSavings.savedMinor, hc)} / ${formatMoney(
                totalSavings.targetMinor,
                hc
              )}`
            )}
            status={totalSavingsStatus}
            progress={{
              ratio: totalSavingsRatio,
              color: totalSavingsStatus.color,
            }}
            sub={
              <>
                <Text style={styles.metricSub}>
                  {tr(
                    `Remaining: ${formatMoney(
                      totalSavingsRemainingMinor,
                      hc
                    )} · `,
                    `남음: ${formatMoney(totalSavingsRemainingMinor, hc)} · `
                  )}
                </Text>
                <Text
                  style={[
                    styles.metricSub,
                    { color: totalSavingsStatus.color },
                  ]}
                >
                  {`${totalSavingsPct}%`}
                </Text>
              </>
            }
          />
        ) : (
          <MetricCard
            title={tr("Total savings", "전체 저축")}
            value={tr("No savings goals yet", "저축 목표가 아직 없어요")}
            sub={tr(
              "Create savings goals in Plan to track progress here.",
              "Plan에서 저축 목표를 만들면 여기서 진행률을 볼 수 있어요."
            )}
          />
        )}
      </View>

      {perSavingsGoals.length && isSavingsDetailsOpen ? (
        <>
          <View style={styles.detailsBox}>
            <Text style={styles.detailsBoxTitle}>
              {tr("Savings details", "저축 상세")}
            </Text>
            <View style={styles.grid2}>
              {perSavingsGoals.map((g) => (
                <MetricCard
                  key={g.key}
                  title={g.title}
                  value={tr(
                    `${formatMoney(g.savedMinor, hc)} / ${formatMoney(
                      g.targetMinor,
                      hc
                    )}`,
                    `${formatMoney(g.savedMinor, hc)} / ${formatMoney(
                      g.targetMinor,
                      hc
                    )}`
                  )}
                  status={g.status}
                  progress={{ ratio: g.ratio, color: g.status.color }}
                  sub={
                    <>
                      <Text style={styles.metricSub}>
                        {tr(
                          `Remaining: ${formatMoney(g.remainingMinor, hc)} · `,
                          `남음: ${formatMoney(g.remainingMinor, hc)} · `
                        )}
                      </Text>
                      <Text
                        style={[styles.metricSub, { color: g.status.color }]}
                      >
                        {`${g.pct}%`}
                      </Text>
                    </>
                  }
                  variant="detail"
                />
              ))}
            </View>
          </View>
        </>
      ) : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  grid1: { gap: Spacing.xl },
  grid2: { gap: Spacing.xl },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailsBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.overlay04,
  },
  detailsBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.extrabold,
    color: Colors.ink,
    opacity: Opacity.subtle,
  },
  detailsBtnDisabled: { opacity: 0.4 },
  detailsBtnTextDisabled: { opacity: Opacity.muted },

  // Sub-text used inside MetricCard's sub prop
  metricSub: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    opacity: Opacity.muted,
    fontWeight: FontWeight.medium,
  },

  // Savings-by-goal detail card (custom layout, not using MetricCard)
  metricCard: {
    width: "100%",
    minHeight: 104,
    justifyContent: "space-between",
  },
  metricCardDetail: { minHeight: 92 },
  metricTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  metricTitle: {
    fontSize: FontSize.base,
    opacity: Opacity.subtle,
    fontWeight: FontWeight.semibold,
  },
  metricTitleDetail: {
    fontSize: FontSize.sm,
    opacity: 0.68,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: Colors.overlay06,
    marginBottom: Spacing.lg,
  },
  savingsByGoalList: { gap: Spacing.lg },
  savingsByGoalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.lg,
  },
  savingsByGoalName: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.ink,
    opacity: 0.72,
  },
  savingsByGoalAmount: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.black,
    color: Colors.ink,
    opacity: 0.85,
  },
  savingsByGoalEmpty: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.statusMuted,
    opacity: 0.8,
  },
  unassignedLabel: {
    opacity: Opacity.muted,
    color: Colors.statusMuted,
    fontWeight: FontWeight.semibold,
  },

  detailsBox: {
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.sm,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.overlay08,
    backgroundColor: Colors.overlay02,
  },
  detailsBoxTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.black,
    color: Colors.ink,
    opacity: Opacity.subtle,
    marginBottom: Spacing.lg,
  },
});
