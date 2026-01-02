import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import {
  getMonthlyPeriodStartUTC,
  getNextMonthlyPeriodStartUTC,
  getPreviousMonthlyPeriodStartUTC,
} from "@/lib/period";
import { z } from "zod";

const transactionSchema = z.object({
  type: z.enum(["EXPENSE", "INCOME", "SAVING"]),
  amountMinor: z.number().int().nonnegative(),
  currency: z.enum(["USD", "KRW"]).optional().default("USD"),
  fxUsdKrw: z.number().optional().nullable(),
  category: z.string().min(1),
  occurredAtISO: z.string().datetime(),
  note: z.string().optional().nullable(),
});

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
    // Optional calendar filters: range=THIS_MONTH | LAST_MONTH | ALL (default ALL)
    const range = (
      request.nextUrl.searchParams.get("range") || "ALL"
    ).toUpperCase();

    // Load user timezone for calendar boundaries
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { timeZone: true },
    });
    const timeZone = dbUser?.timeZone || "America/New_York";

    // Optional summary: includeSummary=1
    const includeSummary =
      request.nextUrl.searchParams.get("includeSummary") === "1";

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

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { occurredAt: "desc" },
    });

    let summary:
      | {
          incomeMinor: number;
          expenseMinor: number;
          savingMinor: number;
          cashflowMinor: number;
          spendToIncomeRatio: number | null;
          counts: { income: number; expense: number; saving: number };
        }
      | undefined;

    if (includeSummary) {
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
      transactions,
      filter: {
        range,
        timeZone,
        periodStartUTC: periodStartUTC ? periodStartUTC.toISOString() : null,
        periodEndUTC: periodEndUTC ? periodEndUTC.toISOString() : null,
      },
      count: transactions.length,
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

    const data = transactionSchema.parse(body);
    const { occurredAtISO, ...txData } = data;

    // Parse occurredAt once
    const occurredAt = new Date(occurredAtISO);

    const transaction = await prisma.transaction.create({
      data: {
        ...txData,
        currency: data.currency,
        userId,
        occurredAt,
      },
    });

    return NextResponse.json({ transaction }, { status: 201 });
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
