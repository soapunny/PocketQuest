import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { PeriodType, CurrencyCode } from "@prisma/client";

import { ensureActivePlan } from "@/lib/plan/activePlan";
import { buildPeriodForNowUTC } from "@/lib/plan/periodFactory";
import {
  convertPlanMinorPayload,
  type GoalsMode,
} from "@/lib/plan/goalsPolicy";

export const runtime = "nodejs";

type SwitchMode = "PERIOD_ONLY" | "CURRENCY_ONLY" | "PERIOD_AND_CURRENCY";

function jsonError(status: number, error: string, hint?: string) {
  return NextResponse.json({ error, ...(hint ? { hint } : {}) }, { status });
}

function parseCurrency(v: unknown): CurrencyCode | null {
  if (v === CurrencyCode.USD || v === CurrencyCode.KRW)
    return v as CurrencyCode;
  if (v === "USD") return CurrencyCode.USD;
  if (v === "KRW") return CurrencyCode.KRW;
  return null;
}

function parsePeriodType(v: unknown): PeriodType | null {
  if (
    v === PeriodType.WEEKLY ||
    v === PeriodType.BIWEEKLY ||
    v === PeriodType.MONTHLY
  )
    return v as PeriodType;
  if (v === "WEEKLY") return PeriodType.WEEKLY;
  if (v === "BIWEEKLY") return PeriodType.BIWEEKLY;
  if (v === "MONTHLY") return PeriodType.MONTHLY;
  return null;
}

function parseGoalsMode(v: unknown): GoalsMode {
  if (v === "CONVERT_USING_FX" || v === "RESET_EMPTY" || v === "COPY_AS_IS")
    return v;
  return "COPY_AS_IS";
}

function parseSwitchMode(v: unknown): SwitchMode {
  if (
    v === "PERIOD_ONLY" ||
    v === "CURRENCY_ONLY" ||
    v === "PERIOD_AND_CURRENCY"
  )
    return v;
  return "PERIOD_AND_CURRENCY";
}

function requireString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    // DEV auth pattern used elsewhere in this repo:
    const devUserId = req.headers.get("x-dev-user-id");
    const userId = requireString(devUserId) ?? requireString(body.userId);

    if (!userId) {
      return jsonError(
        401,
        "Unauthorized",
        "DEV: pass x-dev-user-id header or include userId in body",
      );
    }

    const requestedPeriodType = parsePeriodType(body.periodType);
    const requestedCurrency = parseCurrency(body.currency);
    const switchMode = parseSwitchMode(body.switchMode);
    const goalsMode = parseGoalsMode(body.goalsMode);

    // Active plan (with goals)
    const activePlan = await ensureActivePlan(prisma, userId);

    // Timezone source of truth: request -> user -> UTC
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timeZone: true },
    });

    const timeZone =
      (typeof body.timeZone === "string" && body.timeZone.trim()) ||
      user?.timeZone ||
      "UTC";

    // Decide targets
    const targetPeriodType: PeriodType =
      switchMode === "CURRENCY_ONLY"
        ? (activePlan.periodType as PeriodType)
        : (requestedPeriodType ?? (activePlan.periodType as PeriodType));

    const targetCurrency: CurrencyCode =
      switchMode === "PERIOD_ONLY"
        ? (activePlan.currency as CurrencyCode)
        : (requestedCurrency ?? (activePlan.currency as CurrencyCode));

    const nowUTC = new Date();

    const period = buildPeriodForNowUTC({
      nowUTC,
      periodType: targetPeriodType,
      timeZone,
      periodAnchorUTC: activePlan.periodAnchor,
    });

    const { periodStartUTC, periodEndUTC, periodAnchorUTC } = period;

    // Create (or reuse) the plan for this exact periodStart.
    // Note: this relies on your schema having a unique constraint like:
    // @@unique([userId, periodType, periodStart])
    const result = await prisma.$transaction(async (tx) => {
      const plan = await tx.plan.upsert({
        where: {
          userId_periodType_periodStart: {
            userId,
            periodType: targetPeriodType,
            periodStart: periodStartUTC,
          },
        },
        create: {
          userId,
          periodType: targetPeriodType,
          periodAnchor: periodAnchorUTC,
          periodStart: periodStartUTC,
          periodEnd: periodEndUTC,
          currency: targetCurrency,
          totalBudgetLimitMinor: Number(activePlan.totalBudgetLimitMinor ?? 0),
        },
        update: {
          // Keep periodStart stable, allow anchor/end/currency to reflect current settings.
          currency: targetCurrency,
          periodAnchor: periodAnchorUTC,
          periodEnd: periodEndUTC,
        },
      });

      // Goals handling policy
      if (goalsMode !== "RESET_EMPTY") {
        const fromCurrency = activePlan.currency;
        const toCurrency = targetCurrency;
        const fx = typeof body.fxUsdKrw === "number" ? body.fxUsdKrw : null;

        const converted = convertPlanMinorPayload({
          fromCurrency,
          toCurrency,
          fxUsdKrw: fx,
          goalsMode,
          activePlan,
        });

        const { totalBudgetLimitMinor, budgetGoals, savingsGoals } = converted;

        await tx.plan.update({
          where: { id: plan.id },
          data: { totalBudgetLimitMinor },
        });

        for (const g of budgetGoals) {
          await tx.budgetGoal.upsert({
            where: {
              planId_category: { planId: plan.id, category: g.category },
            },
            create: {
              planId: plan.id,
              category: g.category,
              limitMinor: g.limitMinor,
            },
            update: { limitMinor: g.limitMinor },
          });
        }

        for (const s of savingsGoals) {
          await tx.savingsGoal.upsert({
            where: { planId_name: { planId: plan.id, name: s.name } },
            create: {
              planId: plan.id,
              name: s.name,
              targetMinor: s.targetMinor,
            },
            update: { targetMinor: s.targetMinor },
          });
        }
      }

      // Set active plan
      await tx.user.update({
        where: { id: userId },
        data: { activePlanId: plan.id },
      });

      return tx.plan.findUnique({
        where: { id: plan.id },
        include: { budgetGoals: true, savingsGoals: true },
      });
    });

    return NextResponse.json({ plan: result });
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : "Unknown error";
    return jsonError(400, "Bad Request", msg);
  }
}
