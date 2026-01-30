import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import {
  getMonthlyPeriodStartUTC,
  getNextMonthlyPeriodStartUTC,
  getPreviousMonthlyPeriodStartUTC,
  getYearPeriodStartUTC,
  getNextYearPeriodStartUTC,
} from "@/lib/plan/periodRules";
import { DEFAULT_TIME_ZONE } from "@/lib/plan/defaults";
import { toZonedTime } from "date-fns-tz";
import { format } from "date-fns";
import { z } from "zod";
import {
  transactionCreateSchema,
  rangeSchema,
  TransactionsSummary,
  Currency,
  TxType,
  TransactionDTO,
} from "../../../../../../packages/shared/src/transactions/types";
import {
  EXPENSE_CATEGORY_KEYS,
  INCOME_CATEGORY_KEYS,
  SAVING_CATEGORY_KEY,
  expenseCategoryKeySchema,
  incomeCategoryKeySchema,
} from "@/lib/categories";

// Use shared transactionCreateSchema (basic shape). Server performs additional
// category/savingsGoal validation beyond this shared shape.

async function resolveUserPlanIdForGoals(
  userId: string
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activePlanId: true },
  });
  if (user?.activePlanId) return user.activePlanId;

  const latestPlan = await prisma.plan.findFirst({
    where: { userId },
    orderBy: { periodStart: "desc" },
    select: { id: true },
  });

  return latestPlan?.id ?? null;
}

async function assertSavingsGoalOwnership(params: {
  userId: string;
  savingsGoalId: string;
}): Promise<{ id: string; name: string }> {
  const planId = await resolveUserPlanIdForGoals(params.userId);
  if (!planId) {
    const e = new Error("Plan not found");
    (e as any).code = "PLAN_NOT_FOUND";
    throw e;
  }

  const goal = await prisma.savingsGoal.findFirst({
    where: { id: params.savingsGoalId, planId },
    select: { id: true, name: true },
  });

  if (!goal) {
    const e = new Error("Invalid savingsGoalId for this user/plan");
    (e as any).code = "SAVINGS_GOAL_FORBIDDEN";
    throw e;
  }

  return goal;
}

type TransactionRow = {
  id: string;
  userId: string;
  type: TxType;
  amountMinor: number;
  currency: Currency;
  fxUsdKrw: number | null;
  category: string;
  savingsGoalId: string | null;
  occurredAt: Date;
  note: string | null;
  savingsGoal?: { name: string } | null;
};

function toTransactionDTO(t: TransactionRow, timeZone: string): TransactionDTO {
  const zoned = toZonedTime(t.occurredAt, timeZone);
  const occurredAtLocalISO = format(zoned, "yyyy-MM-dd'T'HH:mm:ss");

  const savingsGoalName = t.savingsGoal?.name ?? null;

  return {
    id: t.id,
    userId: t.userId,
    type: t.type,
    amountMinor: t.amountMinor,
    currency: t.currency,
    fxUsdKrw: t.fxUsdKrw ?? null,
    category: t.category,
    savingsGoalId: t.savingsGoalId ?? null,
    occurredAt: t.occurredAt.toISOString(), // DTO 표준을 occurredAt로 쓰면 (클라 normalize가 처리 가능)
    occurredAtLocalISO,
    note: t.note ?? null,
    savingsGoalName,
  };
}

function getDevUserId(request: NextRequest, body?: unknown): string | null {
  if (process.env.NODE_ENV === "production") return null;

  const headerId = request.headers.get("x-dev-user-id");
  if (headerId && headerId.trim()) return headerId.trim();

  const urlId = request.nextUrl.searchParams.get("userId");
  if (urlId && urlId.trim()) return urlId.trim();

  if (body && typeof body === "object" && body !== null && "userId" in body) {
    const v = (body as any).userId;
    if (typeof v === "string" && v.trim()) return v.trim();
  }

  const envId = process.env.DEV_USER_ID;
  if (envId && envId.trim()) return envId.trim();

  return null;
}

// GET /api/transactions - Get all transactions for user
export async function GET(request: NextRequest) {
  const user = getAuthUser(request);
  const devUserId = !user ? getDevUserId(request) : null;
  const userId = user?.userId ?? devUserId;

  if (!userId) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        hint:
          process.env.NODE_ENV !== "production"
            ? "DEV: pass x-dev-user-id header or ?userId=..."
            : undefined,
      },
      { status: 401 }
    );
  }

  try {
    // Optional calendar filters: range=THIS_MONTH | LAST_MONTH | THIS_YEAR | ALL (default ALL)
    const rawRange = request.nextUrl.searchParams.get("range") || "ALL";
    const normalizedRange = rawRange.toUpperCase();
    const parsedRange = rangeSchema.safeParse(normalizedRange);
    if (!parsedRange.success) {
      return NextResponse.json(
        { error: "Invalid range", details: parsedRange.error.errors },
        { status: 400 }
      );
    }
    const range = parsedRange.data;

    // Optional summary: includeSummary=1
    const includeSummary =
      request.nextUrl.searchParams.get("includeSummary") === "1";

    // Load user timezone for calendar boundaries
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { timeZone: true },
    });
    const timeZone = dbUser?.timeZone || DEFAULT_TIME_ZONE;

    // Capture computed bounds for UI/debugging
    let periodStartUTC: Date | undefined;
    let periodEndUTC: Date | undefined;

    let occurredAtFilter: { gte?: Date; lt?: Date } | undefined;

    if (range === "THIS_MONTH") {
      const start = getMonthlyPeriodStartUTC(timeZone);
      const end = getNextMonthlyPeriodStartUTC(timeZone);
      occurredAtFilter = { gte: start, lt: end };
      periodStartUTC = start;
      periodEndUTC = end;
    } else if (range === "LAST_MONTH") {
      const thisStart = getMonthlyPeriodStartUTC(timeZone);
      const prevStart = getPreviousMonthlyPeriodStartUTC(timeZone);
      occurredAtFilter = { gte: prevStart, lt: thisStart };
      periodStartUTC = prevStart;
      periodEndUTC = thisStart;
    } else if (range === "THIS_YEAR") {
      const yearStart = getYearPeriodStartUTC(timeZone);
      const nextYearStart = getNextYearPeriodStartUTC(timeZone);
      occurredAtFilter = { gte: yearStart, lt: nextYearStart };
      periodStartUTC = yearStart;
      periodEndUTC = nextYearStart;
    } else {
      // ALL -> no date filter
      occurredAtFilter = undefined;
      periodStartUTC = undefined;
      periodEndUTC = undefined;
    }

    const where = {
      userId,
      ...(occurredAtFilter ? { occurredAt: occurredAtFilter } : {}),
    } as const;

    const transactions = (await prisma.transaction.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      select: {
        id: true,
        userId: true,
        type: true,
        amountMinor: true,
        currency: true,
        fxUsdKrw: true,
        category: true,
        savingsGoalId: true,
        occurredAt: true,
        note: true,
        savingsGoal: { select: { name: true } },
      },
    })) as TransactionRow[];

    // Add occurredAtLocalISO to reduce client parsing burden.
    const transactionsDTO = transactions.map((t) =>
      toTransactionDTO(t, timeZone)
    );

    let summary: TransactionsSummary | undefined;

    if (includeSummary) {
      // NOTE: summary amounts (amountMinor) are reported in the transaction currency.
      const [incomeAgg, expenseAgg, savingAgg] = await Promise.all([
        prisma.transaction.aggregate({
          where: { ...where, type: "INCOME" },
          _sum: { amountMinor: true },
          _count: true,
        }),
        prisma.transaction.aggregate({
          where: { ...where, type: "EXPENSE" },
          _sum: { amountMinor: true },
          _count: true,
        }),
        prisma.transaction.aggregate({
          where: { ...where, type: "SAVING" },
          _sum: { amountMinor: true },
          _count: true,
        }),
      ]);

      const incomeMinor = incomeAgg._sum.amountMinor ?? 0;
      const expenseMinor = expenseAgg._sum.amountMinor ?? 0;
      const savingMinor = savingAgg._sum.amountMinor ?? 0;
      const cashflowMinor = incomeMinor - expenseMinor - savingMinor;
      const spendToIncomeRatio =
        incomeMinor > 0 ? expenseMinor / incomeMinor : null;

      summary = {
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
      };
    }

    return NextResponse.json({
      transactions: transactionsDTO,
      filter: {
        range,
        timeZone,
        periodStartUTC: periodStartUTC ? periodStartUTC.toISOString() : null,
        periodEndUTC: periodEndUTC ? periodEndUTC.toISOString() : null,
      },
      count: transactionsDTO.length,
      summary: summary ?? null,
    });
  } catch (error) {
    console.error("Get transactions error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/transactions - Create new transaction
export async function POST(request: NextRequest) {
  const user = getAuthUser(request);

  try {
    const body: unknown = await request.json();

    const devUserId = !user ? getDevUserId(request, body) : null;
    const userId = user?.userId ?? devUserId;

    if (!userId) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          hint:
            process.env.NODE_ENV !== "production"
              ? "DEV: pass x-dev-user-id header or include userId in body"
              : undefined,
        },
        { status: 401 }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { timeZone: true },
    });
    const timeZone = dbUser?.timeZone || DEFAULT_TIME_ZONE;

    const data = transactionCreateSchema.parse(body);
    // normalize inputs
    let category = String(data.category ?? "").trim();
    let savingsGoalId = data.savingsGoalId?.trim();

    // SAVING rules
    if (data.type === "SAVING") {
      if (!savingsGoalId) {
        return NextResponse.json(
          { error: "savingsGoalId is required for SAVING" },
          { status: 400 }
        );
      }

      try {
        await assertSavingsGoalOwnership({ userId, savingsGoalId });
      } catch (err: any) {
        if (err?.code === "PLAN_NOT_FOUND") {
          return NextResponse.json(
            { error: "Plan not found" },
            { status: 404 }
          );
        }
        if (err?.code === "SAVINGS_GOAL_FORBIDDEN") {
          return NextResponse.json(
            { error: "savingsGoalId does not belong to you" },
            { status: 403 }
          );
        }
        throw err;
      }

      // Override category regardless of client input (canonical saving key)
      category = SAVING_CATEGORY_KEY;
    } else {
      // non-saving: ignore any provided savingsGoalId and validate canonical category key
      savingsGoalId = undefined;

      if (data.type === "EXPENSE") {
        const ok = expenseCategoryKeySchema.safeParse(category);
        if (!ok.success) {
          return NextResponse.json(
            {
              error: "Invalid expense category",
              allowed: EXPENSE_CATEGORY_KEYS,
            },
            { status: 400 }
          );
        }
        category = ok.data;
      }

      if (data.type === "INCOME") {
        const ok = incomeCategoryKeySchema.safeParse(category);
        if (!ok.success) {
          return NextResponse.json(
            { error: "Invalid income category", allowed: INCOME_CATEGORY_KEYS },
            { status: 400 }
          );
        }
        category = ok.data;
      }
    }

    const occurredAt = new Date(data.occurredAtISO);

    const createData: any = {
      userId,
      type: data.type,
      amountMinor: data.amountMinor,
      currency: data.currency ?? "USD",
      fxUsdKrw: data.fxUsdKrw ?? undefined,
      category,
      // Nullable in Prisma schema: set for SAVING, otherwise clear to null
      savingsGoalId: data.type === "SAVING" ? savingsGoalId : null,
      occurredAt,
      note: data.note ?? undefined,
    };

    const created = (await prisma.transaction.create({
      data: createData,
      select: {
        id: true,
        userId: true,
        type: true,
        amountMinor: true,
        currency: true,
        fxUsdKrw: true,
        category: true,
        savingsGoalId: true,
        occurredAt: true,
        note: true,
        savingsGoal: { select: { name: true } },
      },
    })) as TransactionRow;

    return NextResponse.json(
      { transaction: toTransactionDTO(created, timeZone) },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Create transaction error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
