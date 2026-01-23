import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getMonthlyPeriodStartUTC,
  getNextMonthlyPeriodStartUTC,
} from "@/lib/plan/periodRules";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // dev only: userId query param
  const userId = (searchParams.get("userId") ?? "").trim();

  if (!userId) {
    return NextResponse.json(
      { error: "userId is required (dev only). Use ?userId=..." },
      { status: 400 },
    );
  }

  // (지금은 MONTHLY만 처리)
  const periodType = "MONTHLY" as const;

  // 1) 유저 timezone 조회
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, timeZone: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const timeZone = user.timeZone || "America/New_York";

  // 2) 이번 달 periodStart(UTC) 계산
  const periodStart = getMonthlyPeriodStartUTC(timeZone);
  const periodEnd = getNextMonthlyPeriodStartUTC(timeZone);

  // 3) 없으면 생성 / 있으면 반환 (get-or-create)
  const plan = await prisma.plan.upsert({
    where: {
      userId_periodType_periodStart: {
        userId,
        periodType,
        periodStart,
      },
    },
    update: {},
    create: {
      userId,
      periodType,
      periodStart,
      currency: "USD", // 나중에 User 설정으로 교체
      language: "en", // 나중에 User 설정으로 교체
      totalBudgetLimitMinor: 0,
    },
    include: {
      budgetGoals: true,
      savingsGoals: true,
    },
  });

  // 4) Monthly summary (within [periodStart, periodEnd))
  // NOTE: We assume Transaction has fields: userId, type (INCOME|EXPENSE|SAVING), amountMinor (Int), occurredAt (DateTime)
  // If your Transaction model uses different field names, adjust here.
  const [incomeAgg, expenseAgg, savingAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        userId,
        type: "INCOME",
        occurredAt: { gte: periodStart, lt: periodEnd },
      },
      _sum: { amountMinor: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: {
        userId,
        type: "EXPENSE",
        occurredAt: { gte: periodStart, lt: periodEnd },
      },
      _sum: { amountMinor: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: {
        userId,
        type: "SAVING",
        occurredAt: { gte: periodStart, lt: periodEnd },
      },
      _sum: { amountMinor: true },
      _count: true,
    }),
  ]);

  const incomeMinor = incomeAgg._sum.amountMinor ?? 0;
  const expenseMinor = expenseAgg._sum.amountMinor ?? 0;
  const savingMinor = savingAgg._sum.amountMinor ?? 0;

  // Cashflow (simple): income - expense - saving
  const cashflowMinor = incomeMinor - expenseMinor - savingMinor;

  // Spend-to-income ratio (0..N). If income is 0, return null.
  const spendToIncomeRatio =
    incomeMinor > 0 ? expenseMinor / incomeMinor : null;

  return NextResponse.json({
    plan,
    summary: {
      periodStartUTC: periodStart.toISOString(),
      periodEndUTC: periodEnd.toISOString(),
      incomeMinor,
      expenseMinor,
      savingMinor,
      cashflowMinor,
      spendToIncomeRatio,
      counts: {
        income: incomeAgg._count,
        expense: expenseAgg._count,
        saving: savingAgg._count,
      },
    },
    debug: {
      timeZone,
    },
  });
}
