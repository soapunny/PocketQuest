import { prisma } from "@/lib/prisma";
import { CurrencyCode, PeriodType, TxType } from "@prisma/client";
import { normalizeTimeZone } from "@/lib/plan/periodUtils";
import {
  buildPeriodStartListUTC,
  ensurePeriodEnd,
} from "@/lib/plan/periodRules";
import { ensureDefaultActivePlan } from "@/lib/plan/planCreateFactory";
import { formatInTimeZone } from "date-fns-tz";

type BootstrapArgs = {
  userId: string;
  months?: string; // querystring
  at?: string; // YYYY-MM
  now: Date;
};

function fmtLocalDate(d: Date, timeZone: string): string {
  // Calendar date in the user's timezone
  return formatInTimeZone(d, timeZone, "yyyy-MM-dd");
}

function fmtLocalDateTime(d: Date, timeZone: string): string {
  // Display-friendly local date-time (minutes precision)
  return formatInTimeZone(d, timeZone, "yyyy-MM-dd HH:mm");
}

function fmtLocalMonth(d: Date, timeZone: string): string {
  // Month label in the user's timezone (for dashboard month navigation)
  return formatInTimeZone(d, timeZone, "yyyy-MM");
}

function withPlanUtcFields(plan: any, fallbackTimeZone: string) {
  // Policy A: prefer plan.timeZone (snapshot). Fall back for legacy rows.
  const timeZone =
    typeof plan?.timeZone === "string" && plan.timeZone.trim()
      ? plan.timeZone.trim()
      : fallbackTimeZone;

  const start =
    plan?.periodStart instanceof Date ? (plan.periodStart as Date) : null;
  const end = plan?.periodEnd instanceof Date ? (plan.periodEnd as Date) : null;
  const anchor =
    plan?.periodAnchor instanceof Date ? (plan.periodAnchor as Date) : null;

  const periodStartUTC = start ? start.toISOString() : null;
  const periodEndUTC = end ? end.toISOString() : null;
  const periodAnchorUTC = anchor ? anchor.toISOString() : null;

  // Client-friendly local display fields (derived from UTC instants)
  const periodStartLocal = start ? fmtLocalDate(start, timeZone) : null;
  const periodEndLocal = end ? fmtLocalDate(end, timeZone) : null;
  const periodAnchorLocal = anchor ? fmtLocalDate(anchor, timeZone) : null;

  return {
    ...plan,
    timeZone,
    periodStartUTC,
    periodEndUTC,
    periodAnchorUTC,
    periodStartLocal,
    periodEndLocal,
    periodAnchorLocal,
  };
}

function parseMonthsOrDefault(months?: string, fallback = 3): number {
  const n = months ? Number(months) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(12, Math.max(1, Math.trunc(n)));
}

function canonicalizeCategory(raw: string): string {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s) return "uncategorized";
  // Remove whitespace and special chars, keep alnum only (canonical key)
  const cleaned = s.replace(/[^a-z0-9]/g, "");
  return cleaned || "uncategorized";
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

async function buildDashboardPayload(params: {
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
}) {
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

  // Savings by canonical goal-name key
  const savedByGoalKey = new Map<string, number>();

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
      spentByCategoryMap.set(catKey, (spentByCategoryMap.get(catKey) ?? 0) + amtHome);
    } else if (t.type === TxType.SAVING) {
      savedByGoalKey.set(catKey, (savedByGoalKey.get(catKey) ?? 0) + amtHome);
    }
  }

  const netMinor = incomeMinor - spentMinor;

  const spentByCategory = Array.from(spentByCategoryMap.entries())
    .map(([categoryKey, spentMinor]) => ({ categoryKey, spentMinor }))
    .sort((a, b) => b.spentMinor - a.spentMinor);

  // Budget status rows (assumes limits are in homeCurrency minor units)
  if (activePlan.currency !== homeCurrency) {
    warnings.push(`plan_currency_mismatch:${activePlan.currency}->${homeCurrency}`);
  }

  const budgetStatusRows = (activePlan.budgetGoals ?? [])
    .map((g) => {
      const categoryKey = canonicalizeCategory(g.category ?? "");
      const limitMinor = Number.isFinite(g.limitMinor) ? Math.trunc(g.limitMinor) : 0;
      const spentMinor = spentByCategoryMap.get(categoryKey) ?? 0;
      const remainingMinor = limitMinor - spentMinor;
      return { categoryKey, limitMinor, spentMinor, remainingMinor };
    })
    .filter((r) => r.limitMinor > 0);

  // Savings progress rows (assumes targets are in homeCurrency minor units)
  const savingsProgressRows = (activePlan.savingsGoals ?? [])
    .map((g) => {
      const goalId = String(g.id);
      const name = String(g.name ?? "");
      const targetMinor = Number.isFinite(g.targetMinor) ? Math.trunc(g.targetMinor) : 0;
      const key = canonicalizeCategory(name);
      const savedMinor = savedByGoalKey.get(key) ?? 0;
      const progressRatio = targetMinor > 0 ? savedMinor / targetMinor : 0;
      return { goalId, name, targetMinor, savedMinor, progressRatio };
    })
    .filter((r) => r.targetMinor > 0);

  // Recent transactions (take 10) - must be in active range, canonical category, homeCurrency amount
  const recentTransactions = [];
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
      netMinor,
    },
    spentByCategory,
    budgetStatusRows,
    savingsProgressRows,
    recentTransactions,
    meta: {
      warnings,
    },
  };
}

export async function buildBootstrapPayload(args: BootstrapArgs) {
  const navCount = parseMonthsOrDefault(args.months, 3);

  // 1) user prefs
  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: {
      id: true,
      timeZone: true,
      activePlanId: true,
      currency: true,
      language: true,
    },
  });

  if (!user) {
    return {
      error: "User not found",
    };
  }

  const userTimeZone = normalizeTimeZone(user.timeZone);
  const currency = user.currency ? String(user.currency) : null;
  const language = user.language ? String(user.language) : null;

  // 2) active plan 확보/복구
  const include = { budgetGoals: true, savingsGoals: true } as const;

  let activePlan = null as any;

  if (user.activePlanId) {
    activePlan = await prisma.plan.findUnique({
      where: { id: user.activePlanId },
      include,
    });
  }

  if (!activePlan) {
    // fallback: 최신 플랜
    const latest = await prisma.plan.findFirst({
      where: { userId: args.userId },
      orderBy: { periodStart: "desc" },
      include,
    });

    if (!latest) {
      // no plans -> auto-create default
      const created = await ensureDefaultActivePlan(
        args.userId,
        userTimeZone,
        args.now,
      );
      activePlan = await prisma.plan.findUnique({
        where: { id: created.id },
        include,
      });
    } else {
      activePlan = latest;
      // activePlanId 복구
      await prisma.user.update({
        where: { id: args.userId },
        data: { activePlanId: latest.id },
      });
    }
  }

  // Use the active plan's timezone for plan-related local labels (Policy A).
  const planTimeZone = normalizeTimeZone(
    typeof activePlan?.timeZone === "string" && activePlan.timeZone.trim()
      ? activePlan.timeZone.trim()
      : userTimeZone,
  );

  // 3) monthly list (dashboard에서 월 이동/히스토리 UI용)
  const startsUTC = buildPeriodStartListUTC({
    periodType: PeriodType.MONTHLY,
    timeZone: planTimeZone,
    startUTC: activePlan.periodStart,
    count: navCount,
    at: args.at,
    now: args.now,
  });

  const monthlyPlans = await prisma.plan.findMany({
    where: {
      userId: args.userId,
      periodType: PeriodType.MONTHLY,
      periodStart: { in: startsUTC },
    },
    orderBy: { periodStart: "desc" },
    include,
  });

  const byStart = new Map<number, any>();
  for (const p of monthlyPlans) {
    if (p?.periodStart instanceof Date) byStart.set(p.periodStart.getTime(), p);
  }

  const monthlyItems = startsUTC
    .slice()
    .sort((a, b) => b.getTime() - a.getTime())
    .map((start) => {
      const plan = byStart.get(start.getTime()) ?? null;
      return {
        periodStartUTC: start.toISOString(),
        periodStartLocal: fmtLocalDate(start, planTimeZone),
        monthLocal: fmtLocalMonth(start, planTimeZone),
        plan: plan ? withPlanUtcFields(plan, userTimeZone) : null,
      };
    });

  // 3.5) period navigation (WEEKLY/BIWEEKLY/MONTHLY) - preferred for new clients
  const activePeriodType = activePlan.periodType as PeriodType;

  const navStartsUTC = buildPeriodStartListUTC({
    periodType: activePeriodType,
    timeZone: planTimeZone,
    startUTC: activePlan.periodStart,
    count: navCount,
    at: args.at,
    now: args.now,
  });

  const navPlans = await prisma.plan.findMany({
    where: {
      userId: args.userId,
      periodType: activePeriodType,
      periodStart: { in: navStartsUTC },
    },
    orderBy: { periodStart: "desc" },
    include,
  });

  const navByStart = new Map<number, any>();
  for (const p of navPlans) {
    if (p?.periodStart instanceof Date)
      navByStart.set(p.periodStart.getTime(), p);
  }

  const periodNavItems = navStartsUTC
    .slice()
    .sort((a, b) => b.getTime() - a.getTime())
    .map((start) => {
      const plan = navByStart.get(start.getTime()) ?? null;
      return {
        periodStartUTC: start.toISOString(),
        periodStartLocal: fmtLocalDate(start, planTimeZone),
        labelLocal:
          activePeriodType === PeriodType.MONTHLY
            ? fmtLocalMonth(start, planTimeZone)
            : fmtLocalDate(start, planTimeZone),
        plan: plan ? withPlanUtcFields(plan, userTimeZone) : null,
      };
    });

  // 4) transactions summary (dashboard preview)
  // Defensive: legacy plans may have null periodEnd; compute it via shared rules.
  const activePlanPeriodEnd = ensurePeriodEnd(
    activePlan.periodStart,
    activePlan.periodEnd ?? null,
    activePeriodType,
    planTimeZone,
  );

  // Unify periodEnd truth across bootstrap: activePlan DTO and dashboard range.
  const activePlanForDTO = {
    ...activePlan,
    periodEnd: activePlanPeriodEnd,
  };

  const dashboard = await buildDashboardPayload({
    userId: args.userId,
    timeZone: planTimeZone,
    homeCurrency: user.currency ?? CurrencyCode.USD,
    activePlan: {
      id: activePlanForDTO.id,
      periodStart: activePlanForDTO.periodStart,
      periodEnd: activePlanForDTO.periodEnd,
      budgetGoals: (activePlanForDTO.budgetGoals ?? []).map((g: any) => ({
        id: String(g.id),
        category: String(g.category ?? ""),
        limitMinor: Number(g.limitMinor ?? 0),
      })),
      savingsGoals: (activePlanForDTO.savingsGoals ?? []).map((g: any) => ({
        id: String(g.id),
        name: String(g.name ?? ""),
        targetMinor: Number(g.targetMinor ?? 0),
      })),
      currency: activePlanForDTO.currency,
    },
  });

  return {
    user: {
      id: user.id,
      timeZone: userTimeZone,
      currency,
      language,
      activePlanId: activePlan.id,
    },
    activePlan: withPlanUtcFields(activePlanForDTO, userTimeZone),
    monthly: {
      months: navCount,
      at: args.at ?? null,
      items: monthlyItems,
    },
    periodNav: {
      periodType: activePlan.periodType,
      count: navCount,
      items: periodNavItems,
    },
    dashboard,
    meta: {
      generatedAtUTC: args.now.toISOString(),
    },
  };
}
