import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { usePlanStore } from "../store/planStore";
import { useDashboardStore } from "../store/dashboardStore";
import { useUserPrefsStore } from "../store/userPrefsStore";

import ScreenLayout from "../components/layout/ScreenLayout";
import ScreenHeader from "../components/layout/ScreenHeader";
import ScreenCard from "../components/layout/ScreenCard";
import { CardSpacing } from "../components/Typography";

import { getPeriodLabelKey } from "../domain/plan/period/index";
import { periodLabelText } from "../domain/plan/period/periodLabels";
import { categoryLabelText, getCategoryMeta } from "../domain/categories";
import type { Currency } from "../../../../../packages/shared/src/transactions/types";
import { formatMoney } from "../domain/money/format";

function getPlanPeriodType(plan: unknown): "WEEKLY" | "BIWEEKLY" | "MONTHLY" {
  if (!plan || typeof plan !== "object") return "MONTHLY";
  const v = (plan as { periodType?: unknown }).periodType;
  if (v === "WEEKLY" || v === "BIWEEKLY" || v === "MONTHLY") return v;
  return "MONTHLY";
}

export default function DashboardScreen() {
  const { plan } = usePlanStore();
  const { dashboard, isHydrated } = useDashboardStore();
  const { language, currency } = useUserPrefsStore((s) => ({
    language: s.language,
    currency: s.currency,
  }));
  const homeCurrency = currency ?? null;

  if (!isHydrated || !dashboard || !homeCurrency) {
    const isKo = language === "ko";
    const tr = (en: string, ko: string) => (isKo ? ko : en);

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
            {tr(
              "Preparing dashboard from bootstrap…",
              "부트스트랩에서 대시보드를 준비 중…"
            )}
          </Text>
        </ScreenCard>
      </ScreenLayout>
    );
  }

  const hc = homeCurrency as Currency;

  const isKo = language === "ko";
  const tr = (en: string, ko: string) => (isKo ? ko : en);

  const periodLabel = useMemo(() => {
    const periodType = getPlanPeriodType(plan);
    const key = getPeriodLabelKey(periodType);
    return periodLabelText(key);
  }, [plan ? (plan as { periodType?: unknown }).periodType : undefined]);

  const spentByCategorySorted = useMemo(() => {
    const list = dashboard.spentByCategory ?? [];
    return [...list].sort((a, b) => {
      const ao = getCategoryMeta(a.categoryKey).order;
      const bo = getCategoryMeta(b.categoryKey).order;
      if (ao !== bo) return ao - bo;
      // Stable tie-breaker: label (localized) then key
      const al = categoryLabelText(a.categoryKey, language);
      const bl = categoryLabelText(b.categoryKey, language);
      const c = al.localeCompare(bl);
      return c !== 0
        ? c
        : String(a.categoryKey).localeCompare(String(b.categoryKey));
    });
  }, [dashboard.spentByCategory, language]);

  const budgetStatusRowsSorted = useMemo(() => {
    const list = dashboard.budgetStatusRows ?? [];
    return [...list].sort((a, b) => {
      const ao = getCategoryMeta(a.categoryKey).order;
      const bo = getCategoryMeta(b.categoryKey).order;
      if (ao !== bo) return ao - bo;

      const al = categoryLabelText(a.categoryKey, language);
      const bl = categoryLabelText(b.categoryKey, language);
      const c = al.localeCompare(bl);
      return c !== 0
        ? c
        : String(a.categoryKey).localeCompare(String(b.categoryKey));
    });
  }, [dashboard.budgetStatusRows, language]);

  const warnings = dashboard.meta?.warnings ?? [];

  return (
    <ScreenLayout
      header={
        <ScreenHeader
          title={tr("Dashboard", "대시보드")}
          subtitle={tr(
            `${periodLabel} at a glance`,
            `${periodLabel} 한눈에 보기`
          )}
          description={
            warnings.length
              ? tr(
                  "Some items were excluded due to missing FX.",
                  "환율(FX) 누락으로 일부 항목이 집계에서 제외됐어요."
                )
              : undefined
          }
        />
      }
    >
      <Text style={CardSpacing.section}>{tr("Period", "기간")}</Text>
      <ScreenCard>
        <Text style={CardSpacing.description}>
          {dashboard.range.periodStartLocal} → {dashboard.range.periodEndLocal}
        </Text>
      </ScreenCard>

      <Text style={CardSpacing.section}>{tr("Totals", "합계")}</Text>
      <ScreenCard>
        <Text style={CardSpacing.description}>
          {tr("Income", "수입")}:{" "}
          {formatMoney(dashboard.totals.incomeMinor, hc)}
        </Text>
        <Text style={CardSpacing.description}>
          {tr("Spent", "지출")}: {formatMoney(dashboard.totals.spentMinor, hc)}
        </Text>
        <Text style={CardSpacing.description}>
          {tr("Saving", "저축")}:{" "}
          {formatMoney(dashboard.totals.savingMinor, hc)}
        </Text>
        <Text style={CardSpacing.description}>
          {tr("Net", "순액")}: {formatMoney(dashboard.totals.netMinor, hc)}
        </Text>
      </ScreenCard>

      <Text style={CardSpacing.section}>
        {tr("Spent by category", "카테고리별 지출")}
      </Text>
      <ScreenCard>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ gap: 10, paddingVertical: 4 }}>
            {spentByCategorySorted.map((r) => (
              <View
                key={r.categoryKey}
                style={{ flexDirection: "row", gap: 10 }}
              >
                <Text
                  style={{ fontWeight: "800", color: "#111", minWidth: 140 }}
                >
                  {categoryLabelText(r.categoryKey, language)}
                </Text>
                <Text style={{ fontWeight: "900", color: "#111" }}>
                  {formatMoney(r.spentMinor, hc)}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </ScreenCard>

      <Text style={CardSpacing.section}>
        {tr("Budget status", "예산 상태")}
      </Text>
      <ScreenCard>
        {budgetStatusRowsSorted.length === 0 ? (
          <Text style={CardSpacing.description}>
            {tr(
              "No budget goals for this period.",
              "이번 기간에 예산 목표가 없어요."
            )}
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {budgetStatusRowsSorted.map((r) => (
              <View key={r.categoryKey} style={{ gap: 2 }}>
                <Text style={{ fontWeight: "900" }}>
                  {categoryLabelText(r.categoryKey, language)}
                </Text>
                <Text style={CardSpacing.description}>
                  {formatMoney(r.spentMinor, hc)} /{" "}
                  {formatMoney(r.limitMinor, hc)} ({tr("remaining", "남음")}:{" "}
                  {formatMoney(r.remainingMinor, hc)})
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScreenCard>

      <Text style={CardSpacing.section}>
        {tr("Savings progress", "저축 진행")}
      </Text>
      <ScreenCard>
        {dashboard.savingsProgressRows.length === 0 ? (
          <Text style={CardSpacing.description}>
            {tr(
              "No savings goals for this period.",
              "이번 기간에 저축 목표가 없어요."
            )}
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {dashboard.savingsProgressRows.map((r) => (
              <View key={r.goalId} style={{ gap: 2 }}>
                <Text style={{ fontWeight: "900" }}>{r.name}</Text>
                <Text style={CardSpacing.description}>
                  {formatMoney(r.savedMinor, hc)} /{" "}
                  {formatMoney(r.targetMinor, hc)} (
                  {Math.round(r.progressRatio * 100)}%)
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScreenCard>

      <Text style={CardSpacing.section}>{tr("Recent", "최근 거래")}</Text>
      <ScreenCard>
        <View style={{ gap: 10 }}>
          {dashboard.recentTransactions.map((t) => (
            <View key={t.id} style={{ gap: 2 }}>
              <Text style={{ fontWeight: "900" }}>
                {t.type} · {categoryLabelText(t.categoryKey, language)} ·{" "}
                {formatMoney(t.amountMinor, hc)}
              </Text>
              <Text style={CardSpacing.description}>
                {t.occurredAtLocal} ({t.occurredAtUTC})
              </Text>
              {t.note ? (
                <Text style={CardSpacing.description}>{t.note}</Text>
              ) : null}
            </View>
          ))}
        </View>
      </ScreenCard>
    </ScreenLayout>
  );
}
