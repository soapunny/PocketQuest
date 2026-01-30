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

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

type CashflowHealthKey = "HEALTHY" | "OK" | "CAUTION" | "RISK";

type BudgetHealthKey = "SAFE" | "WATCH" | "TIGHT" | "OVER" | "NA";

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
  if (!Number.isFinite(limitMinor) || limitMinor <= 0) return "NA";
  const r = clamp01(ratio);
  if (r <= 0.7) return "SAFE";
  if (r <= 0.9) return "WATCH";
  if (r <= 1.0) return "TIGHT";
  return "OVER";
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
          arrow: "↓",
        };
      case "OK":
        return {
          text: tr("Okay", "보통"),
          color: styles.statusOk.color,
          arrow: "→",
        };
      case "CAUTION":
        return {
          text: tr("Caution", "주의"),
          color: styles.statusCaution.color,
          arrow: "↑",
        };
      case "RISK":
        return {
          text: tr("Risk", "위험"),
          color: styles.statusRisk.color,
          arrow: "↑",
        };
    }
  };

  const budgetHealthDescriptor = (key: BudgetHealthKey): StatusDescriptor => {
    switch (key) {
      case "SAFE":
        return {
          text: tr("Good", "좋음"),
          color: styles.statusGood.color,
          arrow: "↓",
        };
      case "WATCH":
        return {
          text: tr("Caution", "주의"),
          color: styles.statusCaution.color,
          arrow: "↑",
        };
      case "TIGHT":
        return {
          text: tr("Risk", "위험"),
          color: styles.statusRisk.color,
          arrow: "↑",
        };
      case "OVER":
        return {
          text: tr("Over", "위험"),
          color: styles.statusRisk.color,
          arrow: "↑",
        };
      case "NA":
        return {
          text: tr("—", "—"),
          color: styles.statusMuted.color,
          arrow: "",
        };
    }
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
      limitMinor: number;
      spentMinor: number;
      remainingMinor: number;
    }>;
  };

  const budgetStatusRows = (dashboard as any).budgetStatusRows as
    | Array<{
        limitMinor: number;
        spentMinor: number;
        remainingMinor: number;
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

  const cashflowHealth = {
    spendRate,
    key: cashflowHealthKeyFromSpendRate(spendRate),
  };

  const budgetRatio =
    totalBudgetLimitMinor > 0
      ? totalBudgetSpentMinor / totalBudgetLimitMinor
      : 0;

  const budgetHealth = {
    key: budgetHealthKeyFromRatio(budgetRatio, totalBudgetLimitMinor),
  };

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
      <ScreenCard>
        <Text style={CardSpacing.description}>
          {range.periodStartLocal} → {range.periodEndLocal}
        </Text>
      </ScreenCard>

      {/* Cashflow Summary */}
      <Text style={CardSpacing.section}>{tr("Cashflow", "현금 흐름")}</Text>
      <ScreenCard>
        <View style={{ gap: 8 }}>
          <Text style={CardSpacing.description}>
            {tr("Income", "수입")}: {formatMoney(totals.incomeMinor, hc)}
          </Text>
          <Text style={CardSpacing.description}>
            {tr("Spending", "지출")}: {formatMoney(totals.spentMinor, hc)}
          </Text>
          <Text style={[CardSpacing.description, { fontWeight: "700" }]}>
            {tr("Net", "순액")}: {formatMoney(totals.netMinor, hc)}
          </Text>
        </View>
      </ScreenCard>

      {/* Cashflow Health */}
      <Text style={CardSpacing.section}>
        {tr("Cashflow Health", "현금 흐름 상태")}
      </Text>
      <ScreenCard>
        <Text style={CardSpacing.description}>
          {tr("Spent", "지출")}: {formatMoney(totals.spentMinor, hc)} /{" "}
          {formatMoney(totals.incomeMinor, hc)}
        </Text>
        <Text style={CardSpacing.description}>
          {tr("Spend rate", "지출 비율")}:{" "}
          {Math.round(cashflowHealth.spendRate * 100)}%
        </Text>
        <Text style={[CardSpacing.description, { fontWeight: "700" }]}>
          {tr("Status", "상태")}:{" "}
          {(() => {
            const s = cashflowHealthDescriptor(cashflowHealth.key);
            return (
              <Text style={[styles.statusBase, { color: s.color }]}>
                {s.arrow} {s.text}
              </Text>
            );
          })()}
        </Text>
      </ScreenCard>

      {/* Budget Summary */}
      <Text style={CardSpacing.section}>{tr("Budget", "예산")}</Text>
      <ScreenCard>
        <View style={{ gap: 8 }}>
          <Text style={CardSpacing.description}>
            {tr("Spent", "사용")}: {formatMoney(budgetSummary.spentMinor, hc)}
          </Text>
          <Text style={CardSpacing.description}>
            {tr("Budget", "총 예산")}:{" "}
            {formatMoney(budgetSummary.limitMinor, hc)}
          </Text>
          <Text style={[CardSpacing.description, { fontWeight: "700" }]}>
            {tr("Remaining", "남음")}:{" "}
            {formatMoney(budgetSummary.remainingMinor, hc)}
          </Text>
        </View>
      </ScreenCard>

      {/* Budget Health */}
      <Text style={CardSpacing.section}>{tr("Total Budget", "전체 예산")}</Text>
      <ScreenCard>
        <Text style={CardSpacing.description}>
          {tr("Spent", "사용")}: {formatMoney(budgetSummary.spentMinor, hc)} /{" "}
          {formatMoney(budgetSummary.limitMinor, hc)}
        </Text>
        <Text style={[CardSpacing.description, { fontWeight: "700" }]}>
          {tr("Status", "상태")}:{" "}
          {(() => {
            const s = budgetHealthDescriptor(budgetHealth.key);
            return (
              <Text style={[styles.statusBase, { color: s.color }]}>
                {s.arrow} {s.text}
              </Text>
            );
          })()}
        </Text>
      </ScreenCard>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  statusBase: {
    fontWeight: "700",
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
});
