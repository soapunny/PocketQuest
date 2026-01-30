// apps/server/src/app/api/plans/actions/rollover/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcNextPeriodEnd, ensurePeriodEnd } from "@/lib/plan/periodRules";
import { getAuthUser } from "@/lib/auth";
import { serverPlanDTOSchema } from "../../../../../../../../packages/shared/src/plans/types";
import type { ServerPlanDTO } from "../../../../../../../../packages/shared/src/plans/types";
import { ZodError } from "zod";

function getDevUserId(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const envId = process.env.DEV_USER_ID;
  return envId && envId.trim() ? envId.trim() : null;
}

function toServerPlanDTO(plan: any, timeZone: string): ServerPlanDTO {
  const dto: ServerPlanDTO = {
    id: String(plan.id),
    language: plan?.language ?? null,
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
    budgetGoals: Array.isArray(plan?.budgetGoals)
      ? plan.budgetGoals.map((g: any) => ({
          id: g.id ?? null,
          category: String(g.category ?? "Other"),
          limitMinor: typeof g.limitMinor === "number" ? g.limitMinor : null,
        }))
      : null,
    savingsGoals: Array.isArray(plan?.savingsGoals)
      ? plan.savingsGoals.map((g: any) => ({
          id: g.id ?? null,
          name: String(g.name ?? "Other"),
          targetMinor: typeof g.targetMinor === "number" ? g.targetMinor : null,
        }))
      : null,
  };
  return serverPlanDTOSchema.parse(dto);
}

export async function POST(request: NextRequest) {
  try {
    const authed = getAuthUser(request);
    const userId = authed?.userId ?? getDevUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { activePlan: true },
    });

    if (!user || !user.activePlan) {
      return NextResponse.json(
        { rolled: false, plan: null, error: "No active plan found" },
        { status: 404 },
      );
    }

    const now = new Date();
    const current = user.activePlan;
    const periodType = current.periodType;

    // ✅ 레거시 plan 방어 포함: periodEnd가 null이어도 계산해서 진행
    const currentEnd = ensurePeriodEnd(
      current.periodStart,
      current.periodEnd,
      periodType,
      user.timeZone,
    );

    // 아직 기간 안 끝났으면 종료
    if (currentEnd > now) {
      return NextResponse.json(
        {
          rolled: false,
          reason: "Plan is still active",
          plan: null,
        },
        { status: 409 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // 원본 goals (새 플랜 생성 시에만 복사)
      const budgetGoals = await tx.budgetGoal.findMany({
        where: { planId: current.id },
      });
      const savingsGoals = await tx.savingsGoal.findMany({
        where: { planId: current.id },
      });

      // ✅ 다음 플랜 시작점은 "현재 플랜의 end" (없으면 계산한 end)
      let nextStart: Date = currentEnd;

      let createdCount = 0;
      let lastPlanId: string | null = null;

      // 안전장치: 무한루프 방지 (최대 36기간)
      for (let i = 0; i < 36; i++) {
        const nextEnd = calcNextPeriodEnd(nextStart, periodType, user.timeZone);

        const key = {
          userId: user.id,
          periodType: current.periodType,
          periodStart: nextStart,
        };

        // ✅ 핵심: 이미 존재하면 create하지 않고 가져온다
        let plan = await tx.plan.findUnique({
          where: { userId_periodType_periodStart: key },
        });

        let created = false;

        if (!plan) {
          try {
            plan = await tx.plan.create({
              data: {
                userId: user.id,
                periodType: current.periodType,
                periodAnchor: nextStart,
                periodStart: nextStart,
                periodEnd: nextEnd,
                currency: current.currency,
                language: current.language,
                totalBudgetLimitMinor: current.totalBudgetLimitMinor,
              },
            });

            created = true;
            createdCount += 1;
          } catch (e: any) {
            // If another request created it first, refetch and continue.
            if (e?.code === "P2002") {
              plan = await tx.plan.findUnique({
                where: { userId_periodType_periodStart: key },
              });
              created = false;
            }
            if (!plan) throw e;
          }
        }

        // ✅ 생성된 경우에만 goals 복사
        if (created && plan) {
          if (budgetGoals.length) {
            await tx.budgetGoal.createMany({
              data: budgetGoals.map((g) => ({
                planId: plan.id,
                category: g.category,
                limitMinor: g.limitMinor,
              })),
            });
          }

          if (savingsGoals.length) {
            await tx.savingsGoal.createMany({
              data: savingsGoals.map((g) => ({
                planId: plan.id,
                name: g.name,
                targetMinor: g.targetMinor,
              })),
            });
          }
        }

        lastPlanId = plan.id;

        // 다음 루프 준비: 다음 플랜 start는 방금 플랜의 end
        const planEnd = plan.periodEnd ?? nextEnd;
        nextStart = planEnd;

        // ✅ 실제 planEnd 기준으로 now 포함 여부 판단
        if (planEnd > now) break;
      }

      if (!lastPlanId) {
        return { createdCount: 0, activePlan: null as any };
      }

      await tx.user.update({
        where: { id: user.id },
        data: { activePlanId: lastPlanId },
      });

      const activePlan = await tx.plan.findUnique({
        where: { id: lastPlanId },
        include: { budgetGoals: true, savingsGoals: true },
      });

      return { createdCount, activePlan };
    });

    const timeZone = user.timeZone || "UTC";
    const planDto = result.activePlan
      ? toServerPlanDTO(result.activePlan, timeZone)
      : null;

    return NextResponse.json({
      rolled: true,
      createdCount: result.createdCount,
      plan: planDto,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      // Server-side contract bug: DTO shape is not matching SSOT
      return NextResponse.json(
        { error: "Invalid server plan DTO", details: error.flatten() },
        { status: 500 },
      );
    }

    console.error("[PLAN_ROLLOVER_ERROR]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
