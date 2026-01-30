import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";

import ScreenLayout from "../components/layout/ScreenLayout";
import ScreenHeader from "../components/layout/ScreenHeader";
import ScreenCard from "../components/layout/ScreenCard";
import { CardSpacing } from "../components/Typography";

import type { Currency } from "../../../../../packages/shared/src/money/types";

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

function cashflowHealthKeyFromSpendRate(spendRate: number): CashflowHealthKey {
  const r = clamp01(spendRate);
  if (r <= 0.2) return "HEALTHY";
  if (r <= 0.4) return "OK";
  if (r <= 0.7) return "CAUTION";
  return "RISK";
}

function budgetHealthKeyFromRatio(
  ratio: number,
  limitMinor: number,
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

  type StatusDescriptor = { text: string; color: string; arrow: string };

  const cashflowHealthDescriptor = (
    key: CashflowHealthKey,
  ): StatusDescriptor => {
    switch (key) {
      case "HEALTHY":
        return {
          text: tr("Good", "좋음"),
          color: styles.statusGood.color,
          arrow: "👍",
        };
      case "OK":
        return {
          text: tr("Okay", "보통"),
          color: styles.statusOk.color,
          arrow: "👌",
        };
      case "CAUTION":
        return {
          text: tr("Caution", "주의"),
          color: styles.statusCaution.color,
          arrow: "❗",
        };
      case "RISK":
        return {
          text: tr("Risk", "위험"),
          color: styles.statusRisk.color,
          arrow: "⚠️",
        };
    }
  };

  const budgetHealthDescriptor = (key: BudgetHealthKey): StatusDescriptor => {
    switch (key) {
      case "GOOD":
        return {
          text: tr("Good", "좋음"),
          color: styles.statusGood.color,
          arrow: "👍",
        };
      case "CAUTION":
        return {
          text: tr("Caution", "주의"),
          color: styles.statusCaution.color,
          arrow: "❗",
        };
      case "OVER":
        return {
          text: tr("Over", "초과"),
          color: styles.statusRisk.color,
          arrow: "🚨",
        };
    }
  };

  const savingsHealthDescriptor = (key: SavingsHealthKey): StatusDescriptor => {
    switch (key) {
      case "PUSH":
        return {
          text: tr("Keep going", "분발"),
          color: styles.savingsPush.color,
          arrow: "👏",
        };
      case "GOOD":
        return {
          text: tr("Good", "굿"),
          color: styles.savingsGood.color,
          arrow: "👍",
        };
      case "BEST":
        return {
          text: tr("Great", "최고"),
          color: styles.savingsBest.color,
          arrow: "🎉",
        };
    }
  };

  const StatusChip = ({ label, color }: { label: string; color: string }) => {
    return (
      <View style={styles.statusChip}>
        <Text style={[styles.statusChipText, { color }]}>{label}</Text>
      </View>
    );
  };

  const MetricCard = ({
    title,
    value,
    sub,
    status,
    progress,
  }: {
    title: string;
    value: string;
    sub?: React.ReactNode;
    status?: { label: string; color: string };
    progress?: { ratio: number; color: string };
  }) => {
    return (
      <ScreenCard style={styles.metricCard}>
        <View style={styles.metricTopRow}>
          <Text style={styles.metricTitle}>{title}</Text>
          {status ? (
            <StatusChip label={status.label} color={status.color} />
          ) : null}
        </View>
        {progress ? (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(clamp01(progress.ratio) * 100)}%`,
                  backgroundColor: progress.color,
                },
              ]}
            />
          </View>
        ) : null}
        <Text style={styles.metricValue}>{value}</Text>
        {sub ? (
          typeof sub === "string" ? (
            <Text style={styles.metricSub}>{sub}</Text>
          ) : (
            <View style={styles.metricSubRow}>{sub}</View>
          )
        ) : null}
      </ScreenCard>
    );
  };

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
        <ScreenCard>
          <Text style={CardSpacing.description}>
            {tr("Preparing dashboard…", "대시보드를 준비 중이에요…")}
          </Text>
        </ScreenCard>
      </ScreenLayout>
    );
  }

  const hc = currency as Currency;

  const periodLabel = useMemo(() => {
    const periodType = getPlanPeriodType(plan);
    const key = getPeriodLabelKey(periodType);
    return periodLabelText(key);
  }, [plan]);

  // Server payload (SSOT) for dashboard contains: { range, totals, budgetStatusRows, ... }
  // Derive the UI-friendly summaries here to avoid coupling mobile to a changing DTO.
  const { totals, range } = dashboard as unknown as {
    totals: {
      incomeMinor: number;
      spentMinor: number;
      netMinor: number;
    };
    range: {
      periodStartLocal: string;
      periodEndLocal: string;
    };
    budgetStatusRows?: Array<{
      category?: string | null;
      limitMinor: number;
      spentMinor: number;
      remainingMinor: number;
    }>;
    savingsProgressRows?: Array<{
      goalId: string;
      name: string;
      targetMinor: number;
      savedMinor: number;
      progressRatio: number;
    }>;
  };

  const budgetStatusRows = (dashboard as any).budgetStatusRows as
    | Array<{
        category?: string | null;
        limitMinor: number;
        spentMinor: number;
        remainingMinor: number;
      }>
    | undefined;

  const savingsProgressRows = (dashboard as any).savingsProgressRows as
    | Array<{
        goalId: string;
        name: string;
        targetMinor: number;
        savedMinor: number;
        progressRatio: number;
      }>
    | undefined;

  const totalBudgetLimitMinor = (budgetStatusRows ?? []).reduce(
    (sum, row) => sum + (Number.isFinite(row.limitMinor) ? row.limitMinor : 0),
    0,
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

  const spendRate =
    totals?.incomeMinor && totals.incomeMinor > 0
      ? totalBudgetSpentMinor / totals.incomeMinor
      : 0;

  const cashflowRemainingRatio =
    totals?.incomeMinor && totals.incomeMinor > 0
      ? (totals.netMinor ?? 0) / totals.incomeMinor
      : 0;
  const cashflowRemainingPct = pctFromRatio(cashflowRemainingRatio);

  const cashflowHealth = {
    spendRate,
    key: cashflowHealthKeyFromSpendRate(spendRate),
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

  const cashflowStatus = (() => {
    const s = cashflowHealthDescriptor(cashflowHealth.key);
    return { label: `${s.arrow} ${s.text}`, color: s.color };
  })();

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

      const categoryKey = String(r.category ?? "");
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

  return (
    <ScreenLayout
      header={
        <ScreenHeader
          title={tr("Dashboard", "대시보드")}
          subtitle={tr(
            `${periodLabel} at a glance`,
            `${periodLabel} 한눈에 보기`,
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
      <Text style={CardSpacing.section}>{tr("Cashflow", "현금 흐름")}</Text>
      <View style={styles.grid2}>
        <MetricCard
          title={tr("Cashflow", "현금 흐름")}
          value={tr(
            `${formatMoney(totals.spentMinor, hc)} / ${formatMoney(
              totals.incomeMinor,
              hc,
            )}`,
            `${formatMoney(totals.spentMinor, hc)} / ${formatMoney(
              totals.incomeMinor,
              hc,
            )}`,
          )}
          status={cashflowStatus}
          progress={{
            ratio: cashflowHealth.spendRate,
            color: cashflowStatus.color,
          }}
          sub={
            <>
              <Text style={styles.metricSub}>
                {tr(
                  `Remaining: ${formatMoney(totals.netMinor, hc)} · `,
                  `남음: ${formatMoney(totals.netMinor, hc)} · `,
                )}
              </Text>
              <Text style={[styles.metricSub, { color: cashflowStatus.color }]}>
                {`${cashflowRemainingPct}%`}
              </Text>
            </>
          }
        />
      </View>

      {/* Budget */}
      <Text style={CardSpacing.section}>{tr("Budget", "예산")}</Text>
      <View style={styles.grid2}>
        <MetricCard
          title={tr("Total budget", "전체 예산")}
          value={tr(
            `${formatMoney(budgetSummary.spentMinor, hc)} / ${formatMoney(
              budgetSummary.limitMinor,
              hc,
            )}`,
            `${formatMoney(budgetSummary.spentMinor, hc)} / ${formatMoney(
              budgetSummary.limitMinor,
              hc,
            )}`,
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
                    hc,
                  )} · `,
                  `남음: ${formatMoney(budgetSummary.remainingMinor, hc)} · `,
                )}
              </Text>
              <Text style={[styles.metricSub, { color: budgetStatus.color }]}>
                {`${budgetRemainingPct}%`}
              </Text>
            </>
          }
        />
      </View>

      {perCategoryBudgets.length ? (
        <>
          <Text style={CardSpacing.section}>
            {tr("Budgets by category", "카테고리별 예산")}
          </Text>
          <View style={styles.grid2}>
            {perCategoryBudgets.map((b) => (
              <MetricCard
                key={b.title}
                title={b.title}
                value={tr(
                  `${formatMoney(b.spentMinor, hc)} / ${formatMoney(
                    b.limitMinor,
                    hc,
                  )}`,
                  `${formatMoney(b.spentMinor, hc)} / ${formatMoney(
                    b.limitMinor,
                    hc,
                  )}`,
                )}
                status={b.status}
                progress={{ ratio: b.spentRatio, color: b.status.color }}
                sub={
                  <>
                    <Text style={styles.metricSub}>
                      {tr(
                        `Remaining: ${formatMoney(b.remainingMinor, hc)} · `,
                        `남음: ${formatMoney(b.remainingMinor, hc)} · `,
                      )}
                    </Text>
                    <Text style={[styles.metricSub, { color: b.status.color }]}>
                      {`${b.pct}%`}
                    </Text>
                  </>
                }
              />
            ))}
          </View>
        </>
      ) : null}

      {perSavingsGoals.length ? (
        <>
          <Text style={CardSpacing.section}>{tr("Savings", "저축")}</Text>
          <View style={styles.grid2}>
            {perSavingsGoals.map((g) => (
              <MetricCard
                key={g.key}
                title={g.title}
                value={tr(
                  `${formatMoney(g.savedMinor, hc)} / ${formatMoney(
                    g.targetMinor,
                    hc,
                  )}`,
                  `${formatMoney(g.savedMinor, hc)} / ${formatMoney(
                    g.targetMinor,
                    hc,
                  )}`,
                )}
                status={g.status}
                progress={{ ratio: g.ratio, color: g.status.color }}
                sub={
                  <>
                    <Text style={styles.metricSub}>
                      {tr(
                        `Remaining: ${formatMoney(g.remainingMinor, hc)} · `,
                        `남음: ${formatMoney(g.remainingMinor, hc)} · `,
                      )}
                    </Text>
                    <Text style={[styles.metricSub, { color: g.status.color }]}>
                      {`${g.pct}%`}
                    </Text>
                  </>
                }
              />
            ))}
          </View>
        </>
      ) : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  // Grid wrappers
  grid1: {
    gap: 12,
  },
  grid2: {
    gap: 12,
  },

  // Card layout
  metricCard: {
    width: "100%",
    minHeight: 104,
    justifyContent: "space-between",
  },
  metricTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.06)",
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  metricTitle: {
    fontSize: 13,
    opacity: 0.75,
    fontWeight: "600",
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.2,
    marginTop: 2,
  },
  metricSub: {
    marginTop: 6,
    fontSize: 12,
    opacity: 0.7,
    fontWeight: "500",
  },
  metricSubRow: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },

  // Status
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: "800",
  },

  // Semantic colors (match existing calm app tone)
  statusGood: {
    color: "#16A34A", // green
  },
  statusOk: {
    color: "#2563EB", // blue
  },
  statusCaution: {
    color: "#F59E0B", // amber
  },
  statusRisk: {
    color: "#DC2626", // red
  },
  statusMuted: {
    color: "#6B7280", // gray
  },

  // Savings-specific colors (slightly different vibe from Budget/Cashflow)
  savingsPush: {
    color: "#D97706", // warm orange
  },
  savingsGood: {
    color: "#059669", // teal/green
  },
  savingsBest: {
    color: "#7C3AED", // purple
  },
});
