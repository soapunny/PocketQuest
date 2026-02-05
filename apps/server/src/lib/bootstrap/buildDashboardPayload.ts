// apps/server/src/lib/bootstrap/buildDashboardPayload.ts

import { prisma } from "@/lib/prisma";
import { CurrencyCode, TxType } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";

import type { DashboardPayloadDTO } from "@pq/shared/bootstrap";

function fmtLocalDate(d: Date, timeZone: string): string {
  return formatInTimeZone(d, timeZone, "yyyy-MM-dd");
}

function fmtLocalDateTime(d: Date, timeZone: string): string {
  return formatInTimeZone(d, timeZone, "yyyy-MM-dd HH:mm");
}

function canonicalizeCategory(raw: string): string {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s) return "other";
  // Remove whitespace and special chars, keep alnum only (canonical key)
  const cleaned = s.replace(/[^a-z0-9]/g, "");
  return cleaned || "other";
}

function convertTxMinorToHome(params: {
  amountMinor: number;
  currency: CurrencyCode;
  homeCurrency: CurrencyCode;
  fxUsdKrw: number | null;
}): { ok: true; amountMinor: number } | { ok: false; warning: string } {
  const { amountMinor, currency, homeCurrency, fxUsdKrw } = params;

  const amt = Number.isFinite(amountMinor) ? Math.trunc(amountMinor) : 0;
  if (amt === 0) return { ok: true, amountMinor: 0 };

  if (currency === homeCurrency) return { ok: true, amountMinor: amt };

  const fx = typeof fxUsdKrw === "number" ? fxUsdKrw : NaN;
  if (!Number.isFinite(fx) || fx <= 0) {
    return {
      ok: false,
      warning: `missing_fx_excluded:${currency}->${homeCurrency}`,
    };
  }

  // Supported pair: USD <-> KRW, fxUsdKrw means 1 USD (major) = fx KRW (major)
  if (currency === CurrencyCode.USD && homeCurrency === CurrencyCode.KRW) {
    // cents -> won: (cents / 100) * fx
    return { ok: true, amountMinor: Math.round((amt / 100) * fx) };
  }

  if (currency === CurrencyCode.KRW && homeCurrency === CurrencyCode.USD) {
    // won -> cents: (won / fx) * 100
    return { ok: true, amountMinor: Math.round((amt / fx) * 100) };
  }

  return {
    ok: false,
    warning: `unsupported_currency_pair_excluded:${currency}->${homeCurrency}`,
  };
}

export async function buildDashboardPayload(params: {
  userId: string;
  timeZone: string;
  homeCurrency: CurrencyCode;
  activePlan: {
    id: string;
    periodStart: Date;
    periodEnd: Date; // exclusive end (nextPeriodStart)
    budgetGoals: Array<{ id: string; category: string; limitMinor: number }>;
    savingsGoals: Array<{ id: string; name: string; targetMinor: number }>;
    currency: CurrencyCode;
  };
}): Promise<DashboardPayloadDTO> {
  const { userId, activePlan, timeZone, homeCurrency } = params;

  const rangeWhere = {
    userId,
    occurredAt: {
      gte: activePlan.periodStart,
      lt: activePlan.periodEnd,
    },
  } as const;

  const warnings: string[] = [];

  const txs = await prisma.transaction.findMany({
    where: rangeWhere,
    orderBy: { occurredAt: "desc" },
    select: {
      id: true,
      type: true,
      amountMinor: true,
      currency: true,
      fxUsdKrw: true,
      category: true,
      savingsGoalId: true,
      savingsGoal: { select: { name: true } },
      occurredAt: true,
      note: true,
    },
  });

  // Totals (homeCurrency)
  let incomeMinor = 0;
  let spentMinor = 0;
  let savingMinor = 0;

  // Expense by canonical category
  const spentByCategoryMap = new Map<string, number>();

  // Savings by goal id (SSOT). Keep a legacy fallback keyed by canonicalized goal name.
  const savedByGoalId = new Map<string, number>();
  const savedByLegacyGoalKey = new Map<string, number>();

  for (const t of txs) {
    const conv = convertTxMinorToHome({
      amountMinor: t.amountMinor,
      currency: t.currency,
      homeCurrency,
      fxUsdKrw: t.fxUsdKrw ?? null,
    });

    if (!conv.ok) {
      warnings.push(conv.warning);
      continue;
    }

    const amtHome = conv.amountMinor;

    if (t.type === TxType.INCOME) incomeMinor += amtHome;
    else if (t.type === TxType.EXPENSE) spentMinor += amtHome;
    else if (t.type === TxType.SAVING) savingMinor += amtHome;

    const catKey = canonicalizeCategory(t.category ?? "");

    if (t.type === TxType.EXPENSE) {
      spentByCategoryMap.set(
        catKey,
        (spentByCategoryMap.get(catKey) ?? 0) + amtHome
      );
    } else if (t.type === TxType.SAVING) {
      const goalId =
        typeof (t as any).savingsGoalId === "string"
          ? String((t as any).savingsGoalId)
          : "";
      if (goalId) {
        savedByGoalId.set(goalId, (savedByGoalId.get(goalId) ?? 0) + amtHome);
      } else {
        // Legacy: fall back to goal name if present (older rows may not have savingsGoalId)
        const legacyName = String((t as any).savingsGoal?.name ?? "");
        const legacyKey = canonicalizeCategory(legacyName);
        if (legacyKey) {
          savedByLegacyGoalKey.set(
            legacyKey,
            (savedByLegacyGoalKey.get(legacyKey) ?? 0) + amtHome
          );
        }
      }
    }
  }

  const operationalNetMinor = incomeMinor - spentMinor;
  const spendableNetMinor = incomeMinor - spentMinor - savingMinor;

  const cashflow = {
    operational: {
      incomeMinor,
      expenseMinor: spentMinor,
      netMinor: operationalNetMinor,
    },
    spendable: {
      incomeMinor,
      expenseMinor: spentMinor,
      savingMinor,
      netMinor: spendableNetMinor,
    },
  } as const;

  const spentByCategory = Array.from(spentByCategoryMap.entries())
    .map(([categoryKey, spentMinor]) => ({
      categoryKey,
      spentMinor,
    }))
    .sort((a, b) => b.spentMinor - a.spentMinor);

  // Budget status rows (assumes limits are in homeCurrency minor units)
  if (activePlan.currency !== homeCurrency) {
    warnings.push(
      `plan_currency_mismatch:${activePlan.currency}->${homeCurrency}`
    );
  }

  const budgetStatusRows = (activePlan.budgetGoals ?? [])
    .map((g) => {
      const categoryKey = canonicalizeCategory(g.category ?? "");
      const limitMinor = Number.isFinite(g.limitMinor)
        ? Math.trunc(g.limitMinor)
        : 0;
      const spentMinor = spentByCategoryMap.get(categoryKey) ?? 0;
      const remainingMinor = limitMinor - spentMinor;
      return {
        categoryKey,
        limitMinor,
        spentMinor,
        remainingMinor,
      };
    })
    .filter((r) => r.limitMinor > 0);

  // Savings progress rows (assumes targets are in homeCurrency minor units)
  const savingsProgressRows = (activePlan.savingsGoals ?? [])
    .map((g) => {
      const goalId = String(g.id);
      const name = String(g.name ?? "");
      const targetMinor = Number.isFinite(g.targetMinor)
        ? Math.trunc(g.targetMinor)
        : 0;
      const key = canonicalizeCategory(name);
      const savedMinor =
        savedByGoalId.get(goalId) ?? savedByLegacyGoalKey.get(key) ?? 0;
      const progressRatio = targetMinor > 0 ? savedMinor / targetMinor : 0;
      return { goalId, name, targetMinor, savedMinor, progressRatio };
    })
    .filter((r) => r.targetMinor > 0 || r.savedMinor > 0);

  // Recent transactions (take 10) - must be in active range, canonical category, homeCurrency amount
  const recentTransactions: DashboardPayloadDTO["recentTransactions"] = [];
  for (const t of txs) {
    if (recentTransactions.length >= 10) break;

    const conv = convertTxMinorToHome({
      amountMinor: t.amountMinor,
      currency: t.currency,
      homeCurrency,
      fxUsdKrw: t.fxUsdKrw ?? null,
    });

    if (!conv.ok) {
      warnings.push(conv.warning);
      continue;
    }

    recentTransactions.push({
      id: t.id,
      type: t.type,
      amountMinor: conv.amountMinor,
      categoryKey: canonicalizeCategory(t.category ?? ""),
      savingsGoalId: (t as any).savingsGoalId ?? null,
      occurredAtUTC: t.occurredAt.toISOString(),
      occurredAtLocal: fmtLocalDateTime(t.occurredAt, timeZone),
      note: t.note ?? null,
    });
  }

  return {
    range: {
      periodStartUTC: activePlan.periodStart.toISOString(),
      periodEndUTC: activePlan.periodEnd.toISOString(),
      periodStartLocal: fmtLocalDate(activePlan.periodStart, timeZone),
      periodEndLocal: fmtLocalDate(activePlan.periodEnd, timeZone),
    },
    totals: {
      incomeMinor,
      spentMinor,
      savingMinor,
      netMinor: operationalNetMinor,
    },
    cashflow,
    spentByCategory,
    budgetStatusRows,
    savingsProgressRows,
    recentTransactions,
    meta: {
      warnings,
    },
  };
}
