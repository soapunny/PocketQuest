import { z } from "zod";
function parseAtToDate(atRaw: string | null | undefined): Date {
  const raw = (atRaw || "").trim();
  if (!raw) return new Date();

  // Support YYYY-MM
  const ym = /^\d{4}-\d{2}$/.test(raw);
  if (ym) return new Date(`${raw}-01T00:00:00.000Z`);

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMonthlyPeriodStartUTC } from "@/lib/period";

export async function GET(request: NextRequest) {
  const userId = (request.nextUrl.searchParams.get("userId") || "").trim();

  if (!userId) {
    return NextResponse.json(
      // DEV ONLY: userId is passed explicitly.
      // In production, this should come from auth/session.
      { error: "userId is required (dev only)" },
      { status: 400 }
    );
  }

  // Optional: fetch a specific month
  const atRaw = (request.nextUrl.searchParams.get("at") || "").trim();
  const atDate = parseAtToDate(atRaw);

  // 1) 유저 timezone 조회
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, timeZone: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const timeZone = user.timeZone || "America/New_York";

  // 2) 월 시작 계산(UTC 저장값)
  const periodStart = getMonthlyPeriodStartUTC(timeZone, atDate);

  // Optional: list recent months ending at `at` (or now)
  const monthsRaw = (request.nextUrl.searchParams.get("months") || "").trim();
  const months = monthsRaw
    ? Math.max(1, Math.min(24, Number.parseInt(monthsRaw, 10) || 0))
    : 0;

  if (months > 0) {
    // Build month slots (periodStart UTC) by reusing the boundary calculator
    const starts: Date[] = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(atDate);
      d.setMonth(d.getMonth() - i);
      starts.push(getMonthlyPeriodStartUTC(timeZone, d));
    }

    // Fetch existing plans for those starts
    const existing = await prisma.plan.findMany({
      where: {
        userId,
        periodType: "MONTHLY",
        periodStart: { in: starts },
      },
      include: { budgetGoals: true, savingsGoals: true },
      orderBy: { periodStart: "desc" },
    });

    const byStart = new Map(
      existing.map((p) => [p.periodStart.toISOString(), p] as const)
    );

    const items = starts
      .map((s) => {
        const key = s.toISOString();
        return {
          periodStartUTC: key,
          plan: byStart.get(key) ?? null,
        };
      })
      // Keep newest first
      .sort((a, b) => (a.periodStartUTC < b.periodStartUTC ? 1 : -1));

    return NextResponse.json({
      periodType: "MONTHLY",
      timeZone,
      months,
      anchorPeriodStartUTC: periodStart.toISOString(),
      items,
      ...(process.env.NODE_ENV === "development"
        ? {
            debug: {
              at: atRaw || null,
              starts: starts.map((s) => s.toISOString()),
            },
          }
        : {}),
    });
  }

  // 3) Plan 조회 (생성하지 않음)
  const plan = await prisma.plan.findUnique({
    where: {
      userId_periodType_periodStart: {
        userId,
        periodType: "MONTHLY",
        periodStart,
      },
    },
    include: {
      budgetGoals: true,
      savingsGoals: true,
    },
  });

  if (!plan) {
    return NextResponse.json(
      {
        error: "Plan not found",
        periodType: "MONTHLY",
        periodStartUTC: periodStart.toISOString(),
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    plan,
    ...(process.env.NODE_ENV === "development"
      ? {
          debug: {
            timeZone,
            periodStartUTC: periodStart.toISOString(),
            at: atRaw || null,
          },
        }
      : {}),
  });
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => ({}));

  const userId =
    typeof body === "object" &&
    body !== null &&
    "userId" in body &&
    typeof (body as any).userId === "string"
      ? (body as any).userId.trim()
      : "";

  if (!userId) {
    return NextResponse.json(
      // DEV ONLY: userId is passed explicitly.
      // In production, this should come from auth/session.
      { error: "userId is required (dev only)" },
      { status: 400 }
    );
  }

  // Optional: same formats as GET (?at=YYYY-MM or ISO)
  const atQuery = (request.nextUrl.searchParams.get("at") || "").trim();
  const atRaw =
    atQuery ||
    (typeof (body as any)?.at === "string" ? (body as any).at.trim() : "");
  const atDate = parseAtToDate(atRaw);

  // 1) 유저 timezone 조회
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, timeZone: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const timeZone = user.timeZone || "America/New_York";

  // 2) 월 시작 계산(UTC 저장값)
  const periodStart = getMonthlyPeriodStartUTC(timeZone, atDate);

  // 3) (userId, periodType, periodStart) 유니크키로 upsert
  const plan = await prisma.plan.upsert({
    where: {
      userId_periodType_periodStart: {
        userId,
        periodType: "MONTHLY",
        periodStart,
      },
    },
    update: {},
    create: {
      userId,
      periodType: "MONTHLY",
      periodStart,
      // 나중에 settings에서 가져오게 바꿔도 됨
      currency: "USD",
      language: "en",
      totalBudgetLimitMinor: 0,
    },
    include: {
      budgetGoals: true,
      savingsGoals: true,
    },
  });

  return NextResponse.json({
    plan,
    ...(process.env.NODE_ENV === "development"
      ? {
          debug: {
            timeZone,
            periodStartUTC: periodStart.toISOString(),
            at: atRaw || null,
          },
        }
      : {}),
  });
}

const patchMonthlyPlanSchema = z.object({
  // DEV ONLY: userId is passed explicitly.
  // In production, this should come from auth/session.
  userId: z.string().min(1),

  // Optional: same formats as GET (?at=YYYY-MM or ISO)
  at: z.string().optional(),

  // Update fields
  totalBudgetLimitMinor: z.number().int().nonnegative().optional(),

  // Replace sets when provided
  budgetGoals: z
    .array(
      z
        .object({
          category: z.string().min(1),
          limitMinor: z.number().int().nonnegative().optional(),
          limitCents: z.number().int().nonnegative().optional(),
        })
        .refine(
          (g) =>
            typeof g.limitMinor === "number" ||
            typeof g.limitCents === "number",
          {
            message:
              "budgetGoals[].limitMinor or budgetGoals[].limitCents is required",
          }
        )
    )
    .optional(),

  savingsGoals: z
    .array(
      z
        .object({
          name: z.string().min(1),
          targetMinor: z.number().int().nonnegative().optional(),
          targetCents: z.number().int().nonnegative().optional(),
        })
        .refine(
          (g) =>
            typeof g.targetMinor === "number" ||
            typeof g.targetCents === "number",
          {
            message:
              "savingsGoals[].targetMinor or savingsGoals[].targetCents is required",
          }
        )
    )
    .optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = patchMonthlyPlanSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { userId } = parsed.data;

    // Determine month anchor: prefer query ?at=..., then body.at, else now
    const atQuery = (request.nextUrl.searchParams.get("at") || "").trim();
    const atRaw = atQuery || (parsed.data.at || "").trim();
    const atDate = parseAtToDate(atRaw);

    // 1) 유저 timezone 조회
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, timeZone: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const timeZone = user.timeZone || "America/New_York";

    // 2) 월 시작 계산(UTC 저장값)
    const periodStart = getMonthlyPeriodStartUTC(timeZone, atDate);

    // 3) Plan upsert + (optional) replace goals
    const result = await prisma.$transaction(async (tx) => {
      const plan = await tx.plan.upsert({
        where: {
          userId_periodType_periodStart: {
            userId,
            periodType: "MONTHLY",
            periodStart,
          },
        },
        update: {
          ...(typeof parsed.data.totalBudgetLimitMinor === "number"
            ? { totalBudgetLimitMinor: parsed.data.totalBudgetLimitMinor }
            : {}),
        },
        create: {
          userId,
          periodType: "MONTHLY",
          periodStart,
          // Defaults (can later come from settings)
          currency: "USD",
          language: "en",
          totalBudgetLimitMinor: parsed.data.totalBudgetLimitMinor ?? 0,
        },
        select: { id: true },
      });

      // Replace BudgetGoals if provided
      if (parsed.data.budgetGoals) {
        await tx.budgetGoal.deleteMany({ where: { planId: plan.id } });
        const goals = parsed.data.budgetGoals
          .map((g) => ({
            planId: plan.id,
            category: g.category.trim(),
            limitMinor: g.limitMinor ?? g.limitCents ?? 0,
          }))
          .filter((g) => g.category.length > 0);

        if (goals.length > 0) {
          await tx.budgetGoal.createMany({ data: goals });
        }
      }

      // Replace SavingsGoals if provided
      if (parsed.data.savingsGoals) {
        await tx.savingsGoal.deleteMany({ where: { planId: plan.id } });
        const goals = parsed.data.savingsGoals
          .map((g) => ({
            planId: plan.id,
            name: g.name.trim(),
            targetMinor: g.targetMinor ?? g.targetCents ?? 0,
          }))
          .filter((g) => g.name.length > 0);

        if (goals.length > 0) {
          await tx.savingsGoal.createMany({ data: goals });
        }
      }

      // Return full plan with relations
      return tx.plan.findUnique({
        where: { id: plan.id },
        include: { budgetGoals: true, savingsGoals: true },
      });
    });

    return NextResponse.json({
      plan: result,
      ...(process.env.NODE_ENV === "development"
        ? {
            debug: {
              timeZone,
              periodStartUTC: periodStart.toISOString(),
              at: atRaw || null,
            },
          }
        : {}),
    });
  } catch (error) {
    console.error("PATCH /api/plans/monthly error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
