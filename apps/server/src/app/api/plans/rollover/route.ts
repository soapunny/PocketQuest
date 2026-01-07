import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
        { status: 400 }
      );
    }

    // ✅ FIX: await 오타 수정
    const user = await prisma.user.findUnique({
      where: { id: devUserId },
      include: { activePlan: true },
    });

    if (!user || !user.activePlan) {
      return NextResponse.json(
        { error: "No active plan found for user", userId: devUserId },
        { status: 404 }
      );
    }

    const now = new Date();
    const current = user.activePlan;

    // periodEnd가 없으면 rollover 기준이 애매하니 방어
    if (!current.periodEnd) {
      return NextResponse.json(
        { error: "Active plan has no periodEnd", activePlanId: current.id },
        { status: 400 }
      );
    }

    // 아직 기간 안 끝났으면 종료
    if (current.periodEnd > now) {
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

      const currentPeriodEnd = current.periodEnd;
      const currentEnd =
        current.periodEnd ??
        calculateNextPeriodEnd(current.periodStart, current.periodType);

      let nextStart: Date = currentPeriodEnd!; // 다음 플랜은 현재 플랜 종료 시점부터 시작
      let createdCount = 0;
      let lastPlanId: string | null = null;

      // 안전장치: 무한루프 방지 (최대 36기간)
      for (let i = 0; i < 36; i++) {
        const nextEnd = calculateNextPeriodEnd(nextStart, current.periodType);

        const key = {
          userId: user.id,
          periodType: current.periodType,
          periodStart: nextStart,
        };

        // ✅ 핵심: 이미 존재하면 create하지 않고 가져온다
        let plan = await tx.plan.findUnique({
          where: { userId_periodType_periodStart: key },
        });

        if (!plan) {
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

          createdCount += 1;

          // ✅ 생성된 경우에만 goals 복사
          if (budgetGoals.length) {
            await tx.budgetGoal.createMany({
              data: budgetGoals.map((g) => ({
                planId: plan!.id,
                category: g.category,
                limitMinor: g.limitMinor,
              })),
            });
          }

          if (savingsGoals.length) {
            await tx.savingsGoal.createMany({
              data: savingsGoals.map((g) => ({
                planId: plan!.id,
                name: g.name,
                targetMinor: g.targetMinor,
              })),
            });
          }
        }

        lastPlanId = plan.id;

        // 다음 루프 준비: 다음 플랜 start는 방금 플랜의 end
        // (periodEnd가 null일 가능성 낮지만 방어)
        nextStart = plan.periodEnd ?? nextEnd;

        // ✅ 방금 만든/가져온 플랜이 now를 "포함"하면 stop
        // (즉, periodEnd > now 이면 이 플랜이 현재 활성 플랜)
        if (nextEnd > now) break;
      }

      if (!lastPlanId) {
        // 이론상 여기 오기 어려움(루프 첫 사이클에서 lastPlanId 세팅됨)
        return { createdCount: 0, activePlan: null as any };
      }

      // ✅ activePlan 갱신
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
      { status: 500 }
    );
  }
}

function calculateNextPeriodEnd(periodStart: Date, periodType: string): Date {
  const startMs = periodStart.getTime();

  switch (periodType) {
    case "WEEKLY":
      return new Date(startMs + 7 * 24 * 60 * 60 * 1000);
    case "BIWEEKLY":
      return new Date(startMs + 14 * 24 * 60 * 60 * 1000);
    case "MONTHLY":
    default: {
      const d = new Date(periodStart);
      const day = d.getDate();
      d.setMonth(d.getMonth() + 1);

      // 1/31 -> 2월 보정 등
      if (d.getDate() !== day) {
        d.setDate(0);
      }
      return d;
    }
  }
}
