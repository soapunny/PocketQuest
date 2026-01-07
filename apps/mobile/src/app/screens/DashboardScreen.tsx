import React, { useMemo, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { usePlan } from "../lib/planStore";
import { useFocusEffect } from "@react-navigation/native";
import { fetchTransactions, TransactionDTO } from "../lib/transactionsApi";

import ScreenLayout from "../components/layout/ScreenLayout";
import ScreenHeader from "../components/layout/ScreenHeader";
import ScreenCard from "../components/layout/ScreenCard";

import { getPlanPeriodRange, isISOInRange } from "../lib/planProgress";
import type { Currency } from "../lib/currency";
import { convertMinor, formatMoney } from "../lib/currency";
import { CardSpacing } from "../components/Typography";

function isIncomeTx(tx: any) {
  const t = String(tx?.type || "").toUpperCase();
  if (
    t === "INCOME" ||
    t === "EARNING" ||
    t === "EARNINGS" ||
    t === "PAYCHECK"
  ) {
    return true;
  }

  // Fallback: if it's explicitly not an EXPENSE or SAVING, and amount looks positive, treat as income.
  if (t && t !== "EXPENSE" && t !== "SAVING" && t !== "SAVINGS") {
    return Number(tx?.amountMinor ?? tx?.amountMinor ?? 0) > 0;
  }

  return false;
}

function ratioStatus(ratio: number) {
  if (!Number.isFinite(ratio)) {
    return { key: "NONE" as const, icon: "→", color: "#666", label: "N/A" };
  }
  if (ratio > 1)
    return { key: "OVER" as const, icon: "↑", color: "#c00", label: "Over" };
  if (ratio >= 0.8)
    return {
      key: "WARNING" as const,
      icon: "→",
      color: "#c90",
      label: "Caution",
    };
  return { key: "SAFE" as const, icon: "↓", color: "#0a7", label: "Healthy" };
}

function summaryTone(key: "SAFE" | "WARNING" | "OVER" | "DONE" | "NONE") {
  if (key === "OVER")
    return { borderColor: "#f2c2c2", backgroundColor: "#fff6f6" };
  if (key === "WARNING")
    return { borderColor: "#f1dfb8", backgroundColor: "#fffaf0" };
  if (key === "DONE")
    return { borderColor: "#bfead3", backgroundColor: "#f7fffb" };
  if (key === "SAFE")
    return { borderColor: "#bfead3", backgroundColor: "#f7fffb" };
  return { borderColor: "#eee", backgroundColor: "white" };
}

function absMinor(n: any) {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.abs(v);
}

function txToHomeMinor(tx: any, homeCurrency: Currency): number {
  const currency: Currency = tx?.currency === "KRW" ? "KRW" : "USD";

  // Prefer new field; fallback to legacy amountMinor
  const rawAmount =
    typeof tx?.amountMinor === "number"
      ? tx.amountMinor
      : typeof tx?.amountMinor === "number"
      ? tx.amountMinor
      : 0;

  if (!Number.isFinite(rawAmount) || rawAmount === 0) return 0;

  const sign = rawAmount < 0 ? -1 : 1;
  const amountAbs = absMinor(rawAmount);

  if (currency === homeCurrency) return sign * amountAbs;

  const fx = typeof tx?.fxUsdKrw === "number" ? tx.fxUsdKrw : NaN;
  // If FX is missing, treat as 0 so we don't lie in totals.
  if (!Number.isFinite(fx) || fx <= 0) return 0;

  const convertedAbs = absMinor(
    convertMinor(amountAbs, currency, homeCurrency, fx)
  );
  return sign * convertedAbs;
}

function txToHomeAbsMinor(tx: any, homeCurrency: Currency): number {
  return absMinor(txToHomeMinor(tx, homeCurrency));
}

function moneyHome(amountHomeMinor: number, homeCurrency: Currency) {
  return formatMoney(amountHomeMinor, homeCurrency);
}

export default function DashboardScreen() {
  const { plan, homeCurrency, displayCurrency, language } = usePlan();
  const isKo = language === "ko";

  const tr = (en: string, ko: string) => (isKo ? ko : en);

  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 서버에서 트랜잭션을 가져와 대시보드에 반영.
  // 화면이 포커스될 때마다 최신 DB 상태를 기준으로 다시 불러옵니다.
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      (async () => {
        try {
          setIsLoading(true);
          // 대시보드는 기간 요약용이라, 서버 summary가 필요 없으면 includeSummary: false 로 호출합니다.
          const { transactions } = await fetchTransactions({
            range: "ALL",
            includeSummary: false,
          });

          if (isActive) {
            setTransactions(transactions);
          }
        } catch (error) {
          console.error(
            "[DashboardScreen] failed to load transactions from server",
            error
          );
        } finally {
          if (isActive) {
            setIsLoading(false);
          }
        }
      })();

      return () => {
        isActive = false;
      };
    }, [])
  );

  const { startISO, endISO, type } = useMemo(
    () => getPlanPeriodRange(plan as any),
    [plan]
  );

  const periodLabel =
    type === "MONTHLY"
      ? tr("This month", "이번 달")
      : type === "BIWEEKLY"
      ? tr("This 2 weeks", "이번 2주")
      : tr("This week", "이번 주");

  const periodTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // 우선순위:
      // 1) occurredAtISO (서버에서 명시적으로 내려주는 발생 시각)
      // 2) occurredAt (Date 또는 ISO 문자열)
      // 3) dateISO (구버전 필드)
      // 4) createdAtISO / createdAt (없을 때만 최후의 수단)
      const raw =
        (t as any).occurredAtISO ??
        (t as any).occurredAt ??
        (t as any).dateISO ??
        (t as any).createdAtISO ??
        (t as any).createdAt ??
        "";

      if (!raw) return false;

      const iso =
        typeof raw === "string" ? raw : new Date(raw as any).toISOString();

      if (!iso) return false;

      return isISOInRange(iso, startISO, endISO);
    });
  }, [transactions, startISO, endISO]);

  // Helper to get category limit from plan (interpreted as homeCurrency minor units)
  const getCategoryLimitHomeMinor = (category: string): number => {
    const goals: any = (plan as any).budgetGoals;
    if (!goals) return 0;

    // Array form: [{ category: string, limitMinor: number }]
    if (Array.isArray(goals)) {
      const found = goals.find((g) => String(g.category) === category);
      return found?.limitMinor ?? 0;
    }

    // Object/map form: { [category]: number } or { [category]: { limitMinor } }
    const v = (goals as any)[category];
    if (typeof v === "number") return v;
    if (v && typeof v.limitMinor === "number") return v.limitMinor;

    return 0;
  };

  const totalSpentHomeMinor = useMemo(() => {
    let sum = 0;
    for (const tx of periodTransactions) {
      if ((tx as any).type !== "EXPENSE") continue;
      sum += txToHomeAbsMinor(tx, homeCurrency);
    }
    return sum;
  }, [periodTransactions, homeCurrency]);

  const totalIncomeHomeMinor = useMemo(() => {
    let sum = 0;
    for (const tx of periodTransactions) {
      if (!isIncomeTx(tx)) continue;
      sum += txToHomeAbsMinor(tx, homeCurrency);
    }
    return sum;
  }, [periodTransactions, homeCurrency]);

  const spentByCategoryHomeMinor = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of periodTransactions) {
      if ((tx as any).type !== "EXPENSE") continue;
      const key = String((tx as any).category || "Other");
      map.set(key, (map.get(key) || 0) + txToHomeAbsMinor(tx, homeCurrency));
    }
    return map;
  }, [periodTransactions, homeCurrency]);

  const budgetStatusRows = useMemo(() => {
    const goals: any = (plan as any).budgetGoals;

    const categories: string[] = Array.isArray(goals)
      ? goals
          .map((g: any) => String(g.category || ""))
          .filter((c: string) => !!c)
      : goals && typeof goals === "object"
      ? Object.keys(goals)
      : [];

    const rows: Array<{
      category: string;
      spentHomeMinor: number;
      limitHomeMinor: number;
      ratio: number;
      status: "SAFE" | "WARNING" | "OVER";
    }> = [];

    for (const category of categories) {
      const limitHomeMinor = getCategoryLimitHomeMinor(category);
      if (!limitHomeMinor || limitHomeMinor <= 0) continue;

      const spentHomeMinor = spentByCategoryHomeMinor.get(category) ?? 0;
      const ratio = spentHomeMinor / limitHomeMinor;
      const status: "SAFE" | "WARNING" | "OVER" =
        ratio > 1 ? "OVER" : ratio >= 0.8 ? "WARNING" : "SAFE";

      rows.push({ category, spentHomeMinor, limitHomeMinor, ratio, status });
    }

    const rank = (s: "SAFE" | "WARNING" | "OVER") =>
      s === "OVER" ? 2 : s === "WARNING" ? 1 : 0;

    rows.sort((a, b) => {
      const r = rank(b.status) - rank(a.status);
      if (r !== 0) return r;
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      return b.spentHomeMinor - a.spentHomeMinor;
    });

    return rows;
  }, [spentByCategoryHomeMinor, plan]);

  const savedByGoalHomeMinor = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of periodTransactions) {
      if ((tx as any).type !== "SAVING") continue;
      const goalName = String((tx as any).category || "Other");
      map.set(
        goalName,
        (map.get(goalName) || 0) + txToHomeAbsMinor(tx, homeCurrency)
      );
    }
    return map;
  }, [periodTransactions, homeCurrency]);

  const totalSavedHomeMinor = useMemo(() => {
    let sum = 0;
    for (const v of savedByGoalHomeMinor.values()) sum += v;
    return sum;
  }, [savedByGoalHomeMinor]);

  const totalSavingsTargetHomeMinor = useMemo(() => {
    let sum = 0;
    for (const g of (plan as any).savingsGoals ?? []) {
      const target = Number((g as any).targetMinor ?? 0);
      if (Number.isFinite(target) && target > 0) sum += target;
    }
    return sum;
  }, [plan]);

  const savingsProgressRows = useMemo(() => {
    const rows: Array<{
      name: string;
      savedHomeMinor: number;
      targetHomeMinor: number;
      ratio: number;
    }> = [];

    for (const g of (plan as any).savingsGoals ?? []) {
      const name = String(
        (g as any).name ?? (g as any).title ?? (g as any).goalName ?? "Goal"
      );
      const targetHomeMinor = Number((g as any).targetMinor ?? 0);
      if (!Number.isFinite(targetHomeMinor) || targetHomeMinor <= 0) continue;

      const savedHomeMinor = savedByGoalHomeMinor.get(name) ?? 0;
      const ratio = targetHomeMinor > 0 ? savedHomeMinor / targetHomeMinor : 0;
      rows.push({ name, savedHomeMinor, targetHomeMinor, ratio });
    }

    rows.sort((a, b) => {
      if (a.ratio !== b.ratio) return a.ratio - b.ratio;
      return b.targetHomeMinor - a.targetHomeMinor;
    });

    return rows;
  }, [plan, savedByGoalHomeMinor]);

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
            displayCurrency !== homeCurrency
              ? tr(
                  `Base totals shown in ${homeCurrency}.`,
                  `기준 합계 통화: ${homeCurrency}.`
                )
              : undefined
          }
        />
      }
    >
      <Text style={CardSpacing.section}>{tr("Cashflow", "현금 흐름")}</Text>
      <View style={styles.summaryRow}>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryLabel}>{tr("Income", "수입")}</Text>
          <Text style={styles.summaryValue}>
            {totalIncomeHomeMinor > 0
              ? moneyHome(totalIncomeHomeMinor, homeCurrency)
              : "—"}
          </Text>
        </View>

        {(() => {
          const r =
            totalIncomeHomeMinor > 0
              ? totalSpentHomeMinor / totalIncomeHomeMinor
              : NaN;
          const s = ratioStatus(r);
          const tone = summaryTone(
            s.key === "SAFE" || s.key === "WARNING" || s.key === "OVER"
              ? s.key
              : "NONE"
          );
          return (
            <View style={[styles.summaryPill, tone]}>
              <Text style={styles.summaryLabel}>{tr("Spending", "지출")}</Text>
              <Text style={styles.summaryValue}>
                {moneyHome(totalSpentHomeMinor, homeCurrency)}
              </Text>
            </View>
          );
        })()}

        <View
          style={[
            styles.summaryPill,
            totalIncomeHomeMinor > 0
              ? totalIncomeHomeMinor - totalSpentHomeMinor < 0
                ? summaryTone("OVER")
                : summaryTone("SAFE")
              : summaryTone("NONE"),
          ]}
        >
          <Text style={styles.summaryLabel}>{tr("Net", "순액")}</Text>
          <Text
            style={[
              styles.summaryValue,
              {
                color:
                  totalIncomeHomeMinor - totalSpentHomeMinor >= 0
                    ? "#111"
                    : "#c00",
              },
            ]}
          >
            {totalIncomeHomeMinor > 0
              ? moneyHome(
                  totalIncomeHomeMinor - totalSpentHomeMinor,
                  homeCurrency
                )
              : "—"}
          </Text>
        </View>
      </View>

      {/* Cashflow Health Card */}
      <ScreenCard>
        <View style={styles.cardHeader}>
          <Text style={CardSpacing.cardTitle}>
            {tr("Cashflow Health", "현금흐름 건강")}
          </Text>
          {totalIncomeHomeMinor > 0 ? (
            (() => {
              const r = totalSpentHomeMinor / totalIncomeHomeMinor;
              const s = ratioStatus(r);
              return (
                <Text
                  style={[
                    styles.pill,
                    { color: s.color, borderColor: s.color },
                  ]}
                >
                  {s.icon}{" "}
                  {s.key === "SAFE"
                    ? tr("Healthy", "건강")
                    : s.key === "WARNING"
                    ? tr("Caution", "주의")
                    : tr("Over", "초과")}
                </Text>
              );
            })()
          ) : (
            <Text style={[styles.pill, { color: "#666", borderColor: "#ddd" }]}>
              {tr("No income", "수입 없음")}
            </Text>
          )}
        </View>

        {totalIncomeHomeMinor > 0 ? (
          (() => {
            const ratioRaw = totalSpentHomeMinor / totalIncomeHomeMinor;
            const ratioClamped = Math.min(1, Math.max(0, ratioRaw));
            const pctLabel = Math.round(ratioRaw * 100);
            const net = totalIncomeHomeMinor - totalSpentHomeMinor;

            const status =
              ratioRaw > 1 ? "OVER" : ratioRaw > 0.8 ? "WARNING" : "SAFE";
            const color =
              status === "OVER"
                ? "#c00"
                : status === "WARNING"
                ? "#c90"
                : "#0a7";

            return (
              <>
                <View style={styles.rowBetween}>
                  <Text style={styles.kpiLabel}>{tr("Spent", "지출")}</Text>
                  <Text style={styles.kpiValue}>
                    <Text style={styles.kpiValuePrimary}>
                      {moneyHome(totalSpentHomeMinor, homeCurrency)}
                    </Text>
                    <Text style={styles.kpiValueDivider}> / </Text>
                    <Text style={styles.kpiValueSecondary}>
                      {moneyHome(totalIncomeHomeMinor, homeCurrency)}
                    </Text>
                  </Text>
                </View>

                <View style={styles.rowBetween}>
                  <Text style={styles.kpiLabel}>
                    {tr("Spend rate (of income)", "지출 비율(수입 대비)")}
                  </Text>
                  <Text style={[styles.kpiValue, { color }]}>{pctLabel}%</Text>
                </View>

                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.round(ratioClamped * 100)}%`,
                        backgroundColor: color,
                      },
                    ]}
                  />
                </View>

                <View style={styles.rowBetween}>
                  <Text style={styles.kpiLabel}>{tr("Net", "순액")}</Text>
                  <Text
                    style={[
                      styles.kpiValue,
                      { color: net >= 0 ? "#111" : "#c00" },
                    ]}
                  >
                    {moneyHome(net, homeCurrency)}
                  </Text>
                </View>

                <Text style={CardSpacing.description}>
                  {tr(
                    `Shows your spending as a share of income for ${periodLabel.toLowerCase()}.`,
                    `${periodLabel} 동안 수입 대비 지출 비율을 보여줘요.`
                  )}
                </Text>
              </>
            );
          })()
        ) : (
          <Text style={CardSpacing.description}>
            {tr(
              `Add Income transactions (paycheck, gift, bonus, etc.) to see spending vs income for ${periodLabel.toLowerCase()}.`,
              `${periodLabel} 동안 수입 대비 지출을 보려면 수입 거래(월급/선물/보너스 등)를 추가하세요.`
            )}
          </Text>
        )}
      </ScreenCard>

      <Text style={CardSpacing.section}>{tr("Budget", "예산")}</Text>
      <View style={styles.summaryRow}>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryLabel}>{tr("Spent", "지출")}</Text>
          <Text style={styles.summaryValue}>
            {moneyHome(totalSpentHomeMinor, homeCurrency)}
          </Text>
        </View>

        {(() => {
          const totalBudget = Number((plan as any).totalBudgetlimitMinor ?? 0);
          const r = totalBudget > 0 ? totalSpentHomeMinor / totalBudget : NaN;
          const s = ratioStatus(r);
          const tone = summaryTone(
            s.key === "SAFE" || s.key === "WARNING" || s.key === "OVER"
              ? s.key
              : "NONE"
          );

          return (
            <View style={[styles.summaryPill, tone]}>
              <Text style={styles.summaryLabel}>{tr("Budget", "예산")}</Text>
              <Text style={styles.summaryValue}>
                {totalBudget > 0 ? moneyHome(totalBudget, homeCurrency) : "—"}
              </Text>
            </View>
          );
        })()}

        <View
          style={[
            styles.summaryPill,
            Number((plan as any).totalBudgetLimitMinor ?? 0) > 0
              ? Number((plan as any).totalBudgetLimitMinor) -
                  totalSpentHomeMinor <
                0
                ? summaryTone("OVER")
                : summaryTone("SAFE")
              : summaryTone("NONE"),
          ]}
        >
          <Text style={styles.summaryLabel}>
            {tr("Remaining", "남은 예산")}
          </Text>
          <Text
            style={[
              styles.summaryValue,
              {
                color:
                  Number((plan as any).totalBudgetLimitMinor ?? 0) > 0 &&
                  Number((plan as any).totalBudgetLimitMinor) -
                    totalSpentHomeMinor <
                    0
                    ? "#c00"
                    : "#111",
              },
            ]}
          >
            {Number((plan as any).totalBudgetLimitMinor ?? 0) > 0
              ? moneyHome(
                  Number((plan as any).totalBudgetLimitMinor) -
                    totalSpentHomeMinor,
                  homeCurrency
                )
              : "—"}
          </Text>
        </View>
      </View>

      {/* Total Budget Card */}
      <ScreenCard>
        <View style={styles.cardHeader}>
          <Text style={CardSpacing.cardTitle}>
            {tr("Total Budget", "총 예산")}
          </Text>
          {Number((plan as any).totalBudgetLimitMinor ?? 0) > 0 ? (
            (() => {
              const totalBudget = Number((plan as any).totalBudgetLimitMinor);
              const r = totalSpentHomeMinor / totalBudget;
              const s = ratioStatus(r);
              const label =
                s.key === "SAFE"
                  ? tr("Safe", "안전")
                  : s.key === "WARNING"
                  ? tr("Warning", "주의")
                  : tr("Over", "초과");
              return (
                <Text
                  style={[
                    styles.pill,
                    { color: s.color, borderColor: s.color },
                  ]}
                >
                  {s.icon} {label}
                </Text>
              );
            })()
          ) : (
            <Text style={[styles.pill, { color: "#666", borderColor: "#ddd" }]}>
              {tr("Not set", "미설정")}
            </Text>
          )}
        </View>

        {Number((plan as any).totalBudgetLimitMinor ?? 0) > 0 ? (
          (() => {
            const totalBudget = Number((plan as any).totalBudgetLimitMinor);
            const ratio = totalSpentHomeMinor / totalBudget;
            const clamped = Math.min(1, Math.max(0, ratio));
            const remaining = totalBudget - totalSpentHomeMinor;

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
                  <Text style={styles.kpiLabel}>{tr("Spent", "지출")}</Text>
                  <Text style={styles.kpiValue}>
                    <Text style={styles.kpiValuePrimary}>
                      {moneyHome(totalSpentHomeMinor, homeCurrency)}
                    </Text>
                    <Text style={styles.kpiValueDivider}> / </Text>
                    <Text style={styles.kpiValueSecondary}>
                      {moneyHome(totalBudget, homeCurrency)}
                    </Text>
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
                  <Text style={styles.kpiLabel}>
                    {tr("Remaining", "남은 예산")}
                  </Text>
                  <Text
                    style={[
                      styles.kpiValue,
                      { color: remaining >= 0 ? "#111" : "#c00" },
                    ]}
                  >
                    {moneyHome(remaining, homeCurrency)}
                  </Text>
                </View>

                <Text style={CardSpacing.description}>
                  {tr(
                    "Auto total is the sum of your category limits.",
                    "총 예산은 카테고리별 한도의 합으로 자동 계산돼요."
                  )}
                </Text>
              </>
            );
          })()
        ) : (
          <Text style={CardSpacing.description}>
            {tr(
              "Set category limits in Plan to generate your total budget automatically.",
              "플랜에서 카테고리 예산을 설정하면 총 예산이 자동으로 계산돼요."
            )}
          </Text>
        )}
      </ScreenCard>

      <View style={{ height: 12 }} />

      {/* Budget Alerts Card */}
      <ScreenCard>
        <View style={styles.cardHeader}>
          <Text style={CardSpacing.cardTitle}>
            {tr("Budget Status", "예산 상태")}
          </Text>
          <Text style={[styles.pill, { color: "#111", borderColor: "#ddd" }]}>
            {periodLabel}
          </Text>
        </View>

        {budgetStatusRows.length === 0 ? (
          <Text style={CardSpacing.description}>
            {tr(
              "No categories are near or over their limits. Nice work.",
              "설정한 예산 한도에 가까운/초과한 카테고리가 없어요. 잘하고 있어요!"
            )}
          </Text>
        ) : (
          <View style={{ gap: 12 }}>
            {budgetStatusRows.map((row) => {
              const pctLabel = Math.round(row.ratio * 100);
              const pctBar = Math.round(
                Math.min(1, Math.max(0, row.ratio)) * 100
              );
              const color =
                row.status === "OVER"
                  ? "#c00"
                  : row.status === "WARNING"
                  ? "#c90"
                  : "#0a7";

              return (
                <View key={row.category}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.kpiLabel}>{row.category}</Text>
                    <Text style={[styles.pill, { color, borderColor: color }]}>
                      {row.status === "OVER"
                        ? `↑ ${tr("Over", "초과")}`
                        : row.status === "WARNING"
                        ? `→ ${tr("Warning", "주의")}`
                        : `↓ ${tr("Safe", "안전")}`}
                    </Text>
                  </View>

                  <View style={styles.rowBetween}>
                    <Text style={CardSpacing.description}>
                      <Text style={styles.kpiValuePrimary}>
                        {moneyHome(row.spentHomeMinor, homeCurrency)}
                      </Text>
                      <Text style={styles.kpiValueDivider}> / </Text>
                      <Text style={styles.kpiValueSecondary}>
                        {moneyHome(row.limitHomeMinor, homeCurrency)}
                      </Text>
                    </Text>
                    <Text
                      style={[
                        CardSpacing.description,
                        { fontWeight: "800", color },
                      ]}
                    >
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

            <Text style={CardSpacing.description}>
              {tr(
                `Shows all budget categories you planned for this period. "Caution" starts at 80%.`,
                `이번 기간에 계획한 모든 예산 카테고리를 보여줘요. "주의"는 80%부터 시작해요.`
              )}
            </Text>
          </View>
        )}
      </ScreenCard>

      <Text style={CardSpacing.section}>{tr("Savings", "저축")}</Text>
      <View style={styles.summaryRow}>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryLabel}>{tr("Saved", "저축")}</Text>
          <Text style={styles.summaryValue}>
            {moneyHome(totalSavedHomeMinor, homeCurrency)}
          </Text>
        </View>

        <View
          style={[
            styles.summaryPill,
            totalSavingsTargetHomeMinor > 0
              ? summaryTone("SAFE")
              : summaryTone("NONE"),
          ]}
        >
          <Text style={styles.summaryLabel}>{tr("Target", "목표")}</Text>
          <Text style={styles.summaryValue}>
            {totalSavingsTargetHomeMinor > 0
              ? moneyHome(totalSavingsTargetHomeMinor, homeCurrency)
              : "—"}
          </Text>
        </View>

        <View
          style={[
            styles.summaryPill,
            totalSavingsTargetHomeMinor > 0 &&
            totalSavingsTargetHomeMinor - totalSavedHomeMinor <= 0
              ? summaryTone("DONE")
              : summaryTone("NONE"),
          ]}
        >
          <Text style={styles.summaryLabel}>{tr("To go", "남은 금액")}</Text>
          <Text
            style={[
              styles.summaryValue,
              {
                color:
                  totalSavingsTargetHomeMinor > 0 &&
                  totalSavingsTargetHomeMinor - totalSavedHomeMinor <= 0
                    ? "#0a7"
                    : "#111",
              },
            ]}
          >
            {(() => {
              if (totalSavingsTargetHomeMinor <= 0) return "—";

              const remaining =
                totalSavingsTargetHomeMinor - totalSavedHomeMinor;
              if (remaining > 0) return moneyHome(remaining, homeCurrency);

              const ahead = Math.abs(remaining);
              return ahead > 0
                ? isKo
                  ? `달성 (+${moneyHome(ahead, homeCurrency)})`
                  : `Achieved (+${moneyHome(ahead, homeCurrency)})`
                : tr("Achieved", "달성");
            })()}
          </Text>
        </View>
      </View>

      {/* Total Savings Card */}
      <ScreenCard style={styles.cardSavings}>
        <View style={styles.cardHeader}>
          <Text style={CardSpacing.cardTitle}>
            {tr("Savings Progress", "저축 진행")}
          </Text>
          {totalSavingsTargetHomeMinor > 0 ? (
            (() => {
              const ratio = totalSavedHomeMinor / totalSavingsTargetHomeMinor;
              const done = ratio >= 1;
              const icon = done ? "↓" : "→";
              const label = done
                ? tr("Achieved", "달성")
                : tr("In progress", "진행 중");
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
                  {icon} {label}
                </Text>
              );
            })()
          ) : (
            <Text style={[styles.pill, { color: "#666", borderColor: "#ddd" }]}>
              {tr("Not set", "미설정")}
            </Text>
          )}
        </View>

        {totalSavingsTargetHomeMinor > 0 ? (
          (() => {
            const ratio = totalSavedHomeMinor / totalSavingsTargetHomeMinor;
            const clamped = Math.min(1, Math.max(0, ratio));
            const pct = Math.round(clamped * 100);
            const done = ratio >= 1;
            const color = done ? "#0a7" : "#111";

            return (
              <>
                <View style={styles.rowBetween}>
                  <Text style={styles.kpiLabel}>{tr("Saved", "저축")}</Text>
                  <Text style={styles.kpiValue}>
                    <Text style={styles.kpiValuePrimary}>
                      {moneyHome(totalSavedHomeMinor, homeCurrency)}
                    </Text>
                    <Text style={styles.kpiValueDivider}> / </Text>
                    <Text style={styles.kpiValueSecondary}>
                      {moneyHome(totalSavingsTargetHomeMinor, homeCurrency)}
                    </Text>
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

                <Text style={CardSpacing.description}>
                  {tr(
                    "Total target is the sum of your savings goal targets.",
                    "총 목표는 저축 목표들의 합이에요."
                  )}
                </Text>

                {savingsProgressRows.length === 0 ? (
                  <Text style={CardSpacing.description}>
                    {tr(
                      "No savings goals with targets yet.",
                      "아직 목표 금액이 있는 저축 목표가 없어요."
                    )}
                  </Text>
                ) : (
                  <View style={{ gap: 10, marginTop: 10 }}>
                    <Text style={CardSpacing.sectionTitle}>
                      {tr("By goal", "목표별")}
                    </Text>
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
                              {done ? tr("Achieved", "달성") : `${pctLabel}%`}
                            </Text>
                          </View>

                          <View style={styles.rowBetween}>
                            <Text style={CardSpacing.description}>
                              <Text style={styles.kpiValuePrimary}>
                                {moneyHome(r.savedHomeMinor, homeCurrency)}
                              </Text>
                              <Text style={styles.kpiValueDivider}> / </Text>
                              <Text style={styles.kpiValueSecondary}>
                                {moneyHome(r.targetHomeMinor, homeCurrency)}
                              </Text>
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
          <Text style={CardSpacing.description}>
            {tr(
              "Set savings targets in Plan to track your savings progress for this period.",
              "플랜에서 저축 목표를 설정하면 이번 기간 저축 진행률을 추적할 수 있어요."
            )}
          </Text>
        )}
      </ScreenCard>

      <View style={{ height: 18 }} />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  cardSavings: {
    borderColor: "#d7f5e6",
    backgroundColor: "#f7fffb",
  },
  page: {
    flex: 1,
    backgroundColor: "#f7f7f7",
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
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
  summaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  summaryPill: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#eee",
  },
  summaryLabel: {
    color: "#666",
    fontWeight: "800",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  summaryValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "900",
    color: "#111",
  },
  kpiValuePrimary: {
    color: "#111",
    fontWeight: "900",
  },
  kpiValueSecondary: {
    color: "#666",
    fontWeight: "800",
  },
  kpiValueDivider: {
    color: "#999",
    fontWeight: "900",
  },
});
