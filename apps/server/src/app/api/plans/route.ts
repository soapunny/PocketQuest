import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { z } from "zod";

const periodTypeSchema = z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]);

const currencySchema = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .refine((v) => v.length > 0, { message: "currency is required" });

// Shared schema for creating/updating a plan
const patchPlanSchema = z.object({
  periodType: periodTypeSchema,
  // client uses periodAnchorISO (YYYY-MM-DD) for BIWEEKLY; db field is periodAnchor
  periodAnchorISO: z.string().min(1).optional(),
  // client uses periodStartISO (YYYY-MM-DD)
  periodStartISO: z.string().min(1),
  // DB uses a single `currency` field (CurrencyCode). We still accept legacy client fields.
  currency: currencySchema.optional(),
  homeCurrency: z.string().min(1).optional(),
  displayCurrency: z.string().min(1).optional(),
  advancedCurrencyMode: z.boolean().optional(),
  language: z.string().min(1).optional(),
  totalBudgetLimitMinor: z.number().int().nonnegative().optional(),
});

const getPlanQuerySchema = z.object({
  periodType: periodTypeSchema.optional(),
  periodStartISO: z.string().min(1).optional(),
});

function isoToUTCDate(iso: unknown): Date {
  // Interpret YYYY-MM-DD as UTC midnight
  const s = String(iso || "");
  const [y, m, d] = s.split("-").map((n) => Number(n));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0));
}

export async function GET(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsedQuery = getPlanQuerySchema.safeParse({
    periodType: url.searchParams.get("periodType") ?? undefined,
    periodStartISO: url.searchParams.get("periodStartISO") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsedQuery.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const { periodType, periodStartISO } = parsedQuery.data;

    const include = { budgetGoals: true, savingsGoals: true } as const;

    // If caller provides both, fetch that exact plan.
    if (periodType && periodStartISO) {
      const plan = await prisma.plan.findUnique({
        where: {
          userId_periodType_periodStart: {
            userId: user.userId,
            periodType,
            periodStart: isoToUTCDate(periodStartISO),
          },
        },
        include,
      });

      if (!plan) {
        return NextResponse.json({ error: "Plan not found" }, { status: 404 });
      }

      return NextResponse.json(plan);
    }

    // Otherwise, return the most recent plan for this user.
    const plan = await prisma.plan.findFirst({
      where: { userId: user.userId },
      orderBy: { periodStart: "desc" },
      include,
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    return NextResponse.json(plan);
  } catch (error) {
    console.error("Get plan error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const data = parsed.data;

    const periodStart = isoToUTCDate(data.periodStartISO);
    const periodAnchor = data.periodAnchorISO
      ? isoToUTCDate(data.periodAnchorISO)
      : undefined;

    const currency =
      typeof (data.currency ?? data.homeCurrency ?? data.displayCurrency) ===
      "string"
        ? String(data.currency ?? data.homeCurrency ?? data.displayCurrency)
            .trim()
            .toUpperCase()
        : undefined;

    const language =
      typeof data.language === "string" ? data.language : undefined;

    const plan = await prisma.plan.upsert({
      where: {
        userId_periodType_periodStart: {
          userId: user.userId,
          periodType: data.periodType,
          periodStart,
        },
      },
      create: {
        userId: user.userId,
        periodType: data.periodType,
        periodStart,
        periodAnchor,
        ...(currency ? { currency: currency as any } : {}),
        ...(language ? { language: language as any } : {}),
        totalBudgetLimitMinor: data.totalBudgetLimitMinor ?? 0,
      },
      update: {
        periodAnchor,
        ...(currency ? { currency: currency as any } : {}),
        ...(language ? { language: language as any } : {}),
        totalBudgetLimitMinor: data.totalBudgetLimitMinor,
      },
      include: {
        budgetGoals: true,
        savingsGoals: true,
      },
    });

    return NextResponse.json(plan);
  } catch (error) {
    console.error("Update plan error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
