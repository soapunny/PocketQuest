import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { getWeeklyPeriodStartUTC, calcNextPeriodEnd } from "@/lib/period";
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
  periodStartISO: z.string().min(1).optional(),
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

    // 1) caller가 periodType + periodStartISO를 주면 해당 플랜 정확히 조회
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

    // 2) 기본 동작: User.activePlanId(=activePlan) 반환
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
      // activePlanId가 가리키는 plan이 없으면 아래 fallback으로 복구
    }

    // 3) fallback: 최신 플랜 반환
    const plan = await prisma.plan.findFirst({
      where: { userId },
      orderBy: { periodStart: "desc" },
      include,
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // ✅ 복구: 최신 플랜을 activePlanId로 세팅
    await prisma.user.update({
      where: { id: userId },
      data: { activePlanId: plan.id },
    });

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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timeZone: true, id: true, activePlanId: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const timeZone = user.timeZone ?? "America/New_York";
    const data = parsed.data;

    // ✅ non-weekly는 periodStartISO가 필수
    if (data.periodType !== "WEEKLY" && !data.periodStartISO) {
      return NextResponse.json(
        { error: "periodStartISO is required for non-weekly plans" },
        { status: 400 }
      );
    }

    // ✅ biweekly는 periodAnchorISO가 필수 (2주 단위 기준점)
    if (data.periodType === "BIWEEKLY" && !data.periodAnchorISO) {
      return NextResponse.json(
        { error: "periodAnchorISO is required for biweekly plans" },
        { status: 400 }
      );
    }

    let periodStart: Date;

    if (data.periodType === "WEEKLY") {
      // ✅ Weekly는 서버가 월요일 기준으로 계산 (유저 타임존 기준)
      periodStart = getWeeklyPeriodStartUTC(timeZone);
    } else {
      periodStart = isoToUTCDate(data.periodStartISO!);
    }

    const periodEnd = calcNextPeriodEnd(periodStart, data.periodType, timeZone);

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
        periodEnd,
        periodAnchor,
        ...(currency ? { currency: currency as any } : {}),
        ...(language ? { language: language as any } : {}),
        totalBudgetLimitMinor: data.totalBudgetLimitMinor ?? 0,
      },
      update: {
        periodEnd, // ✅ periodEnd는 항상 최신 규칙으로 채우기(특히 null 복구)
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

    // ✅ activePlanId 복구/초기화:
    // - 유저에 activePlanId가 비어있으면 방금 upsert한 plan을 active로 지정
    // - 또는 activePlanId가 가리키는 plan이 삭제/꼬임이면 복구

    let shouldSetActive = false;

    if (!user.activePlanId) {
      shouldSetActive = true;
    } else {
      // activePlanId가 가리키는 plan이 실제로 존재하는지 확인 (데이터 꼬임 복구)
      const activeExists = await prisma.plan.findUnique({
        where: { id: user.activePlanId },
        select: { id: true },
      });
      if (!activeExists) shouldSetActive = true;
    }

    if (shouldSetActive) {
      await prisma.user.update({
        where: { id: userId },
        data: { activePlanId: plan.id },
      });
    }

    return NextResponse.json(plan);
  } catch (error) {
    console.error("Update plan error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
