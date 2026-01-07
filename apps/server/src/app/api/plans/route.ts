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

function isoToUTCDate(iso: unknown): Date {
  // Interpret YYYY-MM-DD as UTC midnight
  const s = String(iso || "");
  const [y, m, d] = s.split("-").map((n) => Number(n));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0));
}

export async function GET(request: NextRequest) {
  const authed = getAuthUser(request);
  const devUserId = !authed ? getDevUserId(request) : null;
  const userId = authed?.userId ?? devUserId;

  if (!userId) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        hint: "DEV: set DEV_USER_ID or pass x-dev-user-id / ?userId",
      },
      { status: 401 }
    );
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

    // 1) caller가 periodType + periodStartISO를 주면 해당 플랜 정확히 조회 (기존 유지)
    if (periodType && periodStartISO) {
      const plan = await prisma.plan.findUnique({
        where: {
          userId_periodType_periodStart: {
            userId,
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

    // 2) 기본 동작: User.activePlanId(=activePlan) 반환 (새 구조의 핵심)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { activePlanId: true },
    });

    if (user?.activePlanId) {
      const activePlan = await prisma.plan.findUnique({
        where: { id: user.activePlanId },
        include,
      });

      if (activePlan) {
        return NextResponse.json(activePlan);
      }
      // activePlanId가 있는데 plan이 없으면(데이터 꼬임) 아래 fallback으로 복구
    }

    // 3) fallback: activePlanId가 아직 없거나 데이터가 꼬였으면 최신 플랜 반환 (기존과 동일)
    const plan = await prisma.plan.findFirst({
      where: { userId },
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
  const authed = getAuthUser(request);

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

  const devUserId = !authed ? getDevUserId(request, body) : null;
  const userId = authed?.userId ?? devUserId;

  if (!userId) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        hint: "DEV: set DEV_USER_ID or pass x-dev-user-id / ?userId / body.userId",
      },
      { status: 401 }
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
          userId,
          periodType: data.periodType,
          periodStart,
        },
      },
      create: {
        userId,
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
