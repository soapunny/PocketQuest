// apps/server/src/app/api/plans/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import {
  getWeeklyPeriodStartUTC,
  getBiweeklyPeriodStartUTC,
  calcNextPeriodEnd,
  isoLocalDayToUTCDate,
  parseMonthlyAtOrNull,
  getMonthlyPeriodStartUTC,
  getMonthlyPeriodStartUTCForAt,
  buildPeriodStartListUTC,
} from "@/lib/plan/periodRules";
import { ensureDefaultActivePlan } from "@/lib/plan/planCreateFactory";
import { DEFAULT_WEEK_STARTS_ON } from "@/lib/plan/defaults";

import { normalizeTimeZone } from "@/lib/plan/periodUtils";
import { CurrencyCode, LanguageCode, PeriodType } from "@prisma/client";
import { z } from "zod";
// (removed date-fns-tz import)

function parseIsoDateOrNull(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const periodTypeSchema = z.nativeEnum(PeriodType);

const currencyCodeValues = Object.values(CurrencyCode) as string[];

const currencySchema = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .refine((v) => currencyCodeValues.includes(v), {
    message: "Invalid currency",
  })
  .transform((v) => v as CurrencyCode);

const languageCodeValues = Object.values(LanguageCode) as string[];

const languageSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => languageCodeValues.includes(v), {
    message: "Invalid language",
  })
  .transform((v) => v as LanguageCode);

// Shared schema for creating/updating a plan
const patchPlanSchema = z.object({
  periodType: periodTypeSchema,
  // client uses periodAnchorISO (YYYY-MM-DD) for BIWEEKLY; db field is periodAnchor
  periodAnchorISO: z.string().min(1).optional(),
  // alternative: client can send UTC instant ISO (e.g. 2026-01-19T05:00:00.000Z)
  periodAnchorUTC: z.string().min(1).optional(),
  // client uses periodStartISO (YYYY-MM-DD) as a local-day identifier (user timezone)
  periodStartISO: z.string().min(1).optional(),
  // alternative: client can send UTC instant ISO (e.g. 2026-01-19T05:00:00.000Z)
  periodStartUTC: z.string().min(1).optional(),
  // Monthly helper (ported from /plans/monthly): at = "YYYY-MM" (local month in user's timezone)
  at: z.string().min(1).optional(),
  // DB uses a single `currency` field (CurrencyCode). We still accept legacy client fields.
  currency: currencySchema.optional(),
  homeCurrency: currencySchema.optional(),
  displayCurrency: currencySchema.optional(),
  advancedCurrencyMode: z.boolean().optional(),
  language: languageSchema.optional(),
  totalBudgetLimitMinor: z.number().int().nonnegative().optional(),
  // If true, set this plan as the user's active plan (updates User.activePlanId)
  setActive: z.boolean().optional(),
  // If true, server will compute the current periodStart for the given periodType when periodStartISO is omitted
  useCurrentPeriod: z.boolean().optional(),
});

const getPlanQuerySchema = z.object({
  periodType: periodTypeSchema.optional(),
  periodStartISO: z.string().min(1).optional(),
  // Monthly list helpers (ported from /plans/monthly)
  // at: "YYYY-MM" (local month in user's timezone)
  at: z.string().min(1).optional(),
  // months: how many months to include, counting backwards from `at` (or current month if omitted)
  months: z.string().min(1).optional(),
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

function withPlanUtcFields(plan: any, fallbackTimeZone: string) {
  // Prefer plan.timeZone (Policy A). Fall back to caller-provided timezone for legacy rows.
  const timeZone =
    typeof plan?.timeZone === "string" && plan.timeZone.trim()
      ? plan.timeZone.trim()
      : fallbackTimeZone;

  // Prisma DateTime fields arrive as JS Date objects. Provide stable ISO strings for clients.
  const periodStartUTC =
    plan?.periodStart instanceof Date ? plan.periodStart.toISOString() : null;
  const periodEndUTC =
    plan?.periodEnd instanceof Date ? plan.periodEnd.toISOString() : null;
  const periodAnchorUTC =
    plan?.periodAnchor instanceof Date ? plan.periodAnchor.toISOString() : null;

  return {
    ...plan,
    // Server-source-of-truth fields (stable for clients)
    timeZone,
    periodStartUTC,
    periodEndUTC,
    periodAnchorUTC,
  };
}

// Get plan
// 1. 월별 조회, 2. 특정 기간 플랜 조회, 3. active된 플랜 조회
// 플랜 없으면 자동 생성
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
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const parsedQuery = getPlanQuerySchema.safeParse({
    periodType: url.searchParams.get("periodType") ?? undefined,
    periodStartISO: url.searchParams.get("periodStartISO") ?? undefined,
    at: url.searchParams.get("at") ?? undefined,
    months: url.searchParams.get("months") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsedQuery.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { periodType, periodStartISO, at, months } = parsedQuery.data;

    const include = { budgetGoals: true, savingsGoals: true } as const;

    // 0) Monthly list (ported from /plans/monthly GET)
    // GET /api/plans?periodType=MONTHLY&at=YYYY-MM&months=N
    if (periodType === PeriodType.MONTHLY && (at || months)) {
      const userTzRow = await prisma.user.findUnique({
        where: { id: userId },
        select: { timeZone: true },
      });
      const timeZone = normalizeTimeZone(userTzRow?.timeZone);
      const countRaw = typeof months === "string" ? Number(months) : NaN;
      const count = Number.isFinite(countRaw)
        ? Math.min(120, Math.max(1, Math.trunc(countRaw)))
        : 1;

      const now = new Date();
      const startsUTC = buildPeriodStartListUTC({
        periodType: PeriodType.MONTHLY,
        timeZone,
        startUTC: getMonthlyPeriodStartUTC(timeZone, now),
        count,
        at,
        now: now,
      });

      const plans = await prisma.plan.findMany({
        where: {
          userId,
          periodType: PeriodType.MONTHLY,
          periodStart: { in: startsUTC },
        },
        orderBy: { periodStart: "desc" },
        include,
      });

      const byStart = new Map<number, any>();
      for (const p of plans) {
        if (p?.periodStart instanceof Date) {
          byStart.set(p.periodStart.getTime(), p);
        }
      }

      // Legacy /plans/monthly GET behavior:
      // - Always return N items (N = months, default 1)
      // - Items are aligned to the requested month starts
      // - Missing months return plan: null
      const items = startsUTC
        .slice()
        .sort((a, b) => b.getTime() - a.getTime())
        .map((start) => {
          const plan = byStart.get(start.getTime()) ?? null;
          return {
            periodStartUTC: start.toISOString(),
            plan: plan ? withPlanUtcFields(plan, timeZone) : null,
          };
        });

      return NextResponse.json({
        timeZone,
        periodType: PeriodType.MONTHLY,
        at: typeof at === "string" ? at : null,
        months: typeof months === "string" ? months : null,
        items,
      });
    }

    // 1) caller가 periodType + periodStartISO를 주면 해당 플랜 정확히 조회
    if (periodType && periodStartISO) {
      // periodStartISO is a local-day identifier; convert using the user's timezone.
      const userTzRow = await prisma.user.findUnique({
        where: { id: userId },
        select: { timeZone: true },
      });
      const timeZone = normalizeTimeZone(userTzRow?.timeZone);

      const plan = await prisma.plan.findUnique({
        where: {
          userId_periodType_periodStart: {
            userId,
            periodType,
            periodStart: isoLocalDayToUTCDate(timeZone, periodStartISO),
          },
        },
        include,
      });

      if (!plan) {
        return NextResponse.json({ error: "Plan not found" }, { status: 404 });
      }

      return NextResponse.json(withPlanUtcFields(plan, timeZone));
    }

    // 2) 기본 동작: User.activePlanId(=activePlan) 반환
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { activePlanId: true, timeZone: true },
    });
    const timeZone = normalizeTimeZone(user?.timeZone);

    if (user?.activePlanId) {
      const activePlan = await prisma.plan.findUnique({
        where: { id: user.activePlanId },
        include,
      });

      if (activePlan) {
        return NextResponse.json(withPlanUtcFields(activePlan, timeZone));
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
      // ✅ Edge-case: no plans exist yet -> auto-create a default active plan
      const created = await ensureDefaultActivePlan(userId, timeZone);
      return NextResponse.json(withPlanUtcFields(created, timeZone));
    }

    // ✅ 복구: 최신 플랜을 activePlanId로 세팅
    await prisma.user.update({
      where: { id: userId },
      data: { activePlanId: plan.id },
    });

    return NextResponse.json(withPlanUtcFields(plan, timeZone));
  } catch (error) {
    console.error("Get plan error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Create plan
// WEEKLY, BIWEEKLY, MONTHLY 생성 가능
// PeriodStart/periodEnd, periodAnchor 계산
// ActivePlan 지정
export async function POST(request: NextRequest) {
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
      { status: 400 },
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
      { status: 401 },
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        timeZone: true,
        currency: true,
        language: true,
        id: true,
        activePlanId: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const timeZone = normalizeTimeZone(user.timeZone);
    const planTimeZone = timeZone; // Policy A: snapshot on the plan
    const data = parsed.data;
    const url = new URL(request.url);
    // Legacy /plans/monthly POST sometimes provided `at` via querystring.
    const monthlyAt =
      data.periodType === PeriodType.MONTHLY
        ? (data.at ?? url.searchParams.get("at") ?? undefined)
        : undefined;

    const setActive = data.setActive === true;
    const useCurrentPeriod = data.useCurrentPeriod === true;

    // ✅ biweekly는 anchor가 필수 (2주 단위 기준점)
    if (
      data.periodType === PeriodType.BIWEEKLY &&
      !data.periodAnchorISO &&
      !data.periodAnchorUTC
    ) {
      return NextResponse.json(
        {
          error:
            "periodAnchorISO or periodAnchorUTC is required for biweekly plans",
        },
        { status: 400 },
      );
    }

    // ✅ non-weekly는 기본적으로 periodStart가 필요하지만,
    // setActive+useCurrentPeriod 조합이면 서버가 현재 기간의 periodStart를 계산한다.
    if (
      data.periodType !== PeriodType.WEEKLY &&
      !data.periodStartISO &&
      !data.periodStartUTC &&
      !(setActive && useCurrentPeriod) &&
      !(data.periodType === PeriodType.MONTHLY && monthlyAt)
    ) {
      return NextResponse.json(
        {
          error:
            "periodStartISO or periodStartUTC is required for non-weekly plans (or provide at=YYYY-MM for monthly)",
        },
        { status: 400 },
      );
    }

    let periodStart: Date;

    if (data.periodType === PeriodType.WEEKLY) {
      // ✅ Weekly는 서버가 weekStartsOn 기준으로 계산 (유저 타임존 기준)
      periodStart = getWeeklyPeriodStartUTC(
        timeZone,
        new Date(),
        DEFAULT_WEEK_STARTS_ON,
      );
    } else if (setActive && useCurrentPeriod) {
      // ✅ 즉시 전환: 서버가 "현재 기간"의 periodStart를 계산
      if (data.periodType === PeriodType.MONTHLY) {
        periodStart = getMonthlyPeriodStartUTC(timeZone, new Date());
      } else {
        // BIWEEKLY (anchor 기반 2주 주기 시작점 계산)
        const parsedAnchorUTC = parseIsoDateOrNull(data.periodAnchorUTC);
        const anchorUTC = parsedAnchorUTC
          ? parsedAnchorUTC
          : isoLocalDayToUTCDate(timeZone, data.periodAnchorISO!);
        periodStart = getBiweeklyPeriodStartUTC(
          timeZone,
          anchorUTC,
          new Date(),
          DEFAULT_WEEK_STARTS_ON,
        );
      }
    } else {
      // Prefer explicit UTC instant when provided; otherwise interpret periodStartISO as a local-day identifier.
      const parsedStartUTC = parseIsoDateOrNull(data.periodStartUTC);
      if (parsedStartUTC) {
        periodStart = parsedStartUTC;
      } else if (data.periodType === PeriodType.MONTHLY && monthlyAt) {
        const parsedAt = parseMonthlyAtOrNull(monthlyAt);
        if (!parsedAt) {
          return NextResponse.json(
            { error: "Invalid at (expected YYYY-MM)" },
            { status: 400 },
          );
        }
        periodStart = getMonthlyPeriodStartUTCForAt(timeZone, parsedAt);
      } else {
        periodStart = isoLocalDayToUTCDate(timeZone, data.periodStartISO!);
      }
    }

    const periodEnd = calcNextPeriodEnd(periodStart, data.periodType, timeZone);

    const parsedAnchorUTC = parseIsoDateOrNull(data.periodAnchorUTC);
    const periodAnchor = parsedAnchorUTC
      ? parsedAnchorUTC
      : data.periodAnchorISO
        ? isoLocalDayToUTCDate(timeZone, data.periodAnchorISO)
        : undefined;

    const currency = (data.currency ??
      data.homeCurrency ??
      data.displayCurrency ??
      user.currency) as CurrencyCode | undefined;

    const language = (data.language ?? user.language) as
      | LanguageCode
      | undefined;

    const plan = await prisma.$transaction(async (tx) => {
      const upserted = await tx.plan.upsert({
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
          timeZone: planTimeZone,
          currency: currency ?? user.currency,
          language: language ?? user.language,
          totalBudgetLimitMinor: data.totalBudgetLimitMinor ?? 0,
        },
        update: {
          periodEnd,
          periodAnchor,
          timeZone: planTimeZone,
          currency: currency ?? user.currency,
          language: language ?? user.language,
          totalBudgetLimitMinor: data.totalBudgetLimitMinor,
        },
        include: {
          budgetGoals: true,
          savingsGoals: true,
        },
      });
      return upserted;
    });

    // Active handling
    if (setActive) {
      await prisma.user.update({
        where: { id: userId },
        data: { activePlanId: plan.id },
      });
    } else {
      let shouldSetActive = false;

      if (!user.activePlanId) {
        shouldSetActive = true;
      } else {
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
    }

    return NextResponse.json(withPlanUtcFields(plan, timeZone));
  } catch (error) {
    console.error("Create/get plan error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
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
      { status: 400 },
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
      { status: 401 },
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        timeZone: true,
        currency: true,
        language: true,
        id: true,
        activePlanId: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const timeZone = normalizeTimeZone(user.timeZone);
    const planTimeZone = timeZone; // Policy A: snapshot on the plan
    const data = parsed.data;

    const setActive = data.setActive === true;
    const useCurrentPeriod = data.useCurrentPeriod === true;

    // ✅ biweekly는 anchor가 필수 (2주 단위 기준점)
    if (
      data.periodType === PeriodType.BIWEEKLY &&
      !data.periodAnchorISO &&
      !data.periodAnchorUTC
    ) {
      return NextResponse.json(
        {
          error:
            "periodAnchorISO or periodAnchorUTC is required for biweekly plans",
        },
        { status: 400 },
      );
    }

    // ✅ non-weekly는 기본적으로 periodStart가 필요하지만,
    // setActive+useCurrentPeriod 조합이면 서버가 현재 기간의 periodStart를 계산한다.
    if (
      data.periodType !== PeriodType.WEEKLY &&
      !data.periodStartISO &&
      !data.periodStartUTC &&
      !(setActive && useCurrentPeriod)
    ) {
      return NextResponse.json(
        {
          error:
            "periodStartISO or periodStartUTC is required for non-weekly plans",
        },
        { status: 400 },
      );
    }

    let periodStart: Date;

    if (data.periodType === PeriodType.WEEKLY) {
      // ✅ Weekly는 서버가 weekStartsOn 기준으로 계산 (유저 타임존 기준)
      periodStart = getWeeklyPeriodStartUTC(
        timeZone,
        new Date(),
        DEFAULT_WEEK_STARTS_ON,
      );
    } else if (setActive && useCurrentPeriod) {
      // ✅ 즉시 전환: 서버가 "현재 기간"의 periodStart를 계산
      if (data.periodType === PeriodType.MONTHLY) {
        periodStart = getMonthlyPeriodStartUTC(timeZone, new Date());
      } else {
        // BIWEEKLY (anchor 기반 2주 주기 시작점 계산)
        const parsedAnchorUTC = parseIsoDateOrNull(data.periodAnchorUTC);
        const anchorUTC = parsedAnchorUTC
          ? parsedAnchorUTC
          : isoLocalDayToUTCDate(timeZone, data.periodAnchorISO!);
        periodStart = getBiweeklyPeriodStartUTC(
          timeZone,
          anchorUTC,
          new Date(),
          DEFAULT_WEEK_STARTS_ON,
        );
      }
    } else {
      // Prefer explicit UTC instant when provided; otherwise interpret periodStartISO as a local-day identifier.
      const parsedStartUTC = parseIsoDateOrNull(data.periodStartUTC);
      if (parsedStartUTC) {
        periodStart = parsedStartUTC;
      } else {
        periodStart = isoLocalDayToUTCDate(timeZone, data.periodStartISO!);
      }
    }

    const periodEnd = calcNextPeriodEnd(periodStart, data.periodType, timeZone);

    const parsedAnchorUTC = parseIsoDateOrNull(data.periodAnchorUTC);
    const periodAnchor = parsedAnchorUTC
      ? parsedAnchorUTC
      : data.periodAnchorISO
        ? isoLocalDayToUTCDate(timeZone, data.periodAnchorISO)
        : undefined;

    const currency = (data.currency ??
      data.homeCurrency ??
      data.displayCurrency ??
      user.currency) as CurrencyCode | undefined;

    const language = (data.language ?? user.language) as
      | LanguageCode
      | undefined;

    const plan = await prisma.$transaction(async (tx) => {
      const upserted = await tx.plan.upsert({
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
          timeZone: planTimeZone,
          currency: currency ?? user.currency,
          language: language ?? user.language,
          totalBudgetLimitMinor: data.totalBudgetLimitMinor ?? 0,
        },
        update: {
          periodEnd,
          periodAnchor,
          timeZone: planTimeZone,
          currency: currency ?? user.currency,
          language: language ?? user.language,
          totalBudgetLimitMinor: data.totalBudgetLimitMinor,
        },
        include: {
          budgetGoals: true,
          savingsGoals: true,
        },
      });
      return upserted;
    });

    // ✅ Active handling
    // - setActive=true: always switch the user's active plan to this plan
    // - otherwise: only initialize/repair activePlanId when missing or broken

    if (setActive) {
      await prisma.user.update({
        where: { id: userId },
        data: { activePlanId: plan.id },
      });
    } else {
      let shouldSetActive = false;

      if (!user.activePlanId) {
        shouldSetActive = true;
      } else {
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
    }

    return NextResponse.json(withPlanUtcFields(plan, timeZone));
  } catch (error) {
    console.error("Update plan error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
