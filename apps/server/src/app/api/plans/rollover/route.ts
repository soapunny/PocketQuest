import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcNextPeriodEnd, ensurePeriodEnd } from "@/lib/plan/periodRules";
import type { PeriodType } from "@prisma/client";

export async function POST() {
  console.log("[ROLL_OVER] called");
  console.log("[ROLL_OVER] DEV_USER_ID =", process.env.DEV_USER_ID);

  try {
    const devUserId =
      process.env.NODE_ENV !== "production"
        ? process.env.DEV_USER_ID
        : undefined;

    if (!devUserId) {
      return NextResponse.json(
        { error: "DEV_USER_ID is not set (dev only)" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: devUserId },
      include: { activePlan: true },
    });

    if (!user || !user.activePlan) {
      return NextResponse.json(
        { error: "No active plan found for user", userId: devUserId },
        { status: 404 },
      );
    }

    const now = new Date();
    const current = user.activePlan;
    const periodType = current.periodType as PeriodType;

    // ✅ 레거시 plan 방어 포함: periodEnd가 null이어도 계산해서 진행
    const currentEnd = ensurePeriodEnd(
      current.periodStart,
      current.periodEnd,
      periodType,
      user.timeZone,
    );

    // 아직 기간 안 끝났으면 종료
    if (currentEnd > now) {
      return NextResponse.json({
        rolled: false,
        reason: "Plan is still active",
        activePlanId: current.id,
      });
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

    return NextResponse.json({
      rolled: true,
      createdCount: result.createdCount,
      activePlan: result.activePlan,
    });
  } catch (error) {
    console.error("[PLAN_ROLLOVER_ERROR]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
