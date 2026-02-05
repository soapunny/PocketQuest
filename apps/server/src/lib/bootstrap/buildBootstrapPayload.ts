// apps/server/src/lib/bootstrap/buildBootstrapPayload.ts

import { prisma } from "@/lib/prisma";
import { CurrencyCode, PeriodType } from "@prisma/client";
import { normalizeTimeZone } from "@/lib/plan/periodUtils";
import {
  buildPeriodStartListUTC,
  ensurePeriodEnd,
} from "@/lib/plan/periodRules";
import { ensureDefaultActivePlan } from "@/lib/plan/planCreateFactory";
import { formatInTimeZone } from "date-fns-tz";

import { buildDashboardPayload } from "@/lib/bootstrap/buildDashboardPayload";
import type { BootstrapResponseDTO } from "@pq/shared/bootstrap";

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

export async function buildBootstrapPayload(
  args: BootstrapArgs
): Promise<BootstrapResponseDTO | { error: string }> {
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
      cashflowCarryoverEnabled: true,
      cashflowCarryoverMode: true,
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
        args.now
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
      : userTimeZone
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
    planTimeZone
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
      cashflowCarryoverEnabled: !!(user as any).cashflowCarryoverEnabled,
      cashflowCarryoverMode: String(
        (user as any).cashflowCarryoverMode ?? "ROLLING"
      ) as any,
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
