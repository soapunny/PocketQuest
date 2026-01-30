// apps/src/app/api/plans/[id]/actions/switch-currency/route.ts
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { CurrencyCode, PeriodType } from "@prisma/client";

import { getAuthUser } from "@/lib/auth";
import { ensureActivePlan } from "@/lib/plan/activePlan";
import { buildPeriodForNowUTC } from "@/lib/plan/periodFactory";
import { convertPlanMinorPayload } from "@/lib/plan/goalsPolicy";

import {
  serverPlanDTOSchema,
  switchCurrencyRequestSchema,
  type GoalsMode,
  type SwitchMode,
} from "../../../../../../../../../packages/shared/src/plans/types";
import type {
  ServerPlanDTO,
  SwitchCurrencyRequestDTO,
} from "../../../../../../../../../packages/shared/src/plans/types";
import { ZodError } from "zod";

export const runtime = "nodejs";

function jsonError(status: number, error: string, hint?: string) {
  return NextResponse.json({ error, ...(hint ? { hint } : {}) }, { status });
}

function toPrismaCurrency(c: string | undefined): CurrencyCode | undefined {
  if (c === "USD") return CurrencyCode.USD;
  if (c === "KRW") return CurrencyCode.KRW;
  return undefined;
}

function toPrismaPeriodType(p: string | undefined): PeriodType | undefined {
  if (p === "WEEKLY") return PeriodType.WEEKLY;
  if (p === "BIWEEKLY") return PeriodType.BIWEEKLY;
  if (p === "MONTHLY") return PeriodType.MONTHLY;
  return undefined;
}

function toServerPlanDTO(plan: any, timeZone: string): ServerPlanDTO {
  const budgetGoals = Array.isArray(plan?.budgetGoals)
    ? plan.budgetGoals.map((g: any) => ({
        id: g.id,
        category: String(g.category ?? "")
          .trim()
          .toLowerCase(), // ⭐ canonical key
        limitMinor: g.limitMinor ?? null,
      }))
    : null;

  const savingsGoals = Array.isArray(plan?.savingsGoals)
    ? plan.savingsGoals.map((s: any) => ({
        id: s.id,
        name: s.name,
        targetMinor: s.targetMinor ?? null,
      }))
    : null;

  const payload: ServerPlanDTO = {
    id: String(plan.id),
    periodType: plan?.periodType,
    periodStartUTC:
      plan?.periodStart instanceof Date
        ? plan.periodStart.toISOString()
        : undefined,
    periodEndUTC:
      plan?.periodEnd instanceof Date
        ? plan.periodEnd.toISOString()
        : undefined,
    periodAnchorUTC:
      plan?.periodAnchor instanceof Date
        ? plan.periodAnchor.toISOString()
        : undefined,
    timeZone,
    totalBudgetLimitMinor:
      typeof plan?.totalBudgetLimitMinor === "number"
        ? plan.totalBudgetLimitMinor
        : (plan?.totalBudgetLimitMinor ?? null),
    currency: plan?.currency,
    homeCurrency: plan?.currency,
    displayCurrency: plan?.currency,
    budgetGoals,
    savingsGoals,
  };

  return serverPlanDTOSchema.parse(payload);
}

export async function POST(req: Request) {
  try {
    const auth = getAuthUser(req as any);
    if (!auth?.userId) {
      return jsonError(401, "Unauthorized");
    }

    const rawBody = (await req.json().catch(() => ({}))) as unknown;
    let body: SwitchCurrencyRequestDTO;
    try {
      body = switchCurrencyRequestSchema.parse(rawBody);
    } catch (err: unknown) {
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "Bad Request", details: err.flatten() },
          { status: 400 },
        );
      }
      return jsonError(400, "Bad Request", "Invalid request body");
    }

    const switchMode: SwitchMode = body.switchMode ?? "PERIOD_AND_CURRENCY";
    const goalsMode: GoalsMode = body.goalsMode ?? "COPY_AS_IS";

    // Active plan (with goals)
    const activePlan = await ensureActivePlan(prisma, auth.userId);

    // Timezone source of truth: request -> user -> UTC
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { timeZone: true },
    });

    const timeZone = body.timeZone || user?.timeZone || "UTC";

    const requestedPeriodType = toPrismaPeriodType(body.periodType);
    const requestedCurrency = toPrismaCurrency(body.currency);

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

    const result = await prisma.$transaction(async (tx) => {
      const plan = await tx.plan.upsert({
        where: {
          userId_periodType_periodStart: {
            userId: auth.userId,
            periodType: targetPeriodType,
            periodStart: periodStartUTC,
          },
        },
        create: {
          userId: auth.userId,
          periodType: targetPeriodType,
          periodAnchor: periodAnchorUTC,
          periodStart: periodStartUTC,
          periodEnd: periodEndUTC,
          currency: targetCurrency,
          totalBudgetLimitMinor: Number(activePlan.totalBudgetLimitMinor ?? 0),
        },
        update: {
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

      await tx.user.update({
        where: { id: auth.userId },
        data: { activePlanId: plan.id },
      });

      return tx.plan.findUnique({
        where: { id: plan.id },
        include: { budgetGoals: true, savingsGoals: true },
      });
    });

    if (!result) {
      return jsonError(
        500,
        "Internal Server Error",
        "Plan not found after upsert",
      );
    }

    const payload = toServerPlanDTO(result, timeZone);
    return NextResponse.json({ plan: payload });
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: "Bad Request", details: e.flatten() },
        { status: 400 },
      );
    }

    const msg =
      e && typeof e === "object" && "message" in e
        ? String((e as any).message)
        : "Unknown error";
    console.error("[PLAN_SWITCH_CURRENCY_ERROR]", e);
    return jsonError(500, "Internal Server Error", msg);
  }
}
