// apps/server/src/app/api/plans/route.ts

import { NextRequest, NextResponse } from "next/server";

import {
  getPlanQuerySchema,
  patchPlanSchema,
  serverPlanDTOSchema,
} from "../../../../../../packages/shared/src/plans/types";
import type {
  PatchPlanDTO,
  ServerPlanDTO,
} from "../../../../../../packages/shared/src/plans/types";
import { ZodError } from "zod";

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
import {
  CurrencyCode,
  LanguageCode,
  PeriodType as PrismaPeriodType,
} from "@prisma/client";

// (removed date-fns-tz import)

function parseIsoDateOrNull(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
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

function toServerPlanDTO(plan: any, fallbackTimeZone: string): ServerPlanDTO {
  const timeZone =
    typeof plan?.timeZone === "string" && plan.timeZone.trim()
      ? plan.timeZone.trim()
      : fallbackTimeZone;

  const dto: ServerPlanDTO = {
    id: String(plan.id),
    language: plan?.language ?? null,
    periodType: plan?.periodType,
    periodStartUTC:
      plan?.periodStart instanceof Date
        ? plan.periodStart.toISOString()
        : undefined,
    periodEndUTC:
      plan?.periodEnd instanceof Date
        ? plan.periodEnd.toISOString()
        : undefined,
    periodAnchorUTC:
      plan?.periodAnchor instanceof Date
        ? plan.periodAnchor.toISOString()
        : undefined,
    timeZone,
    totalBudgetLimitMinor:
      typeof plan?.totalBudgetLimitMinor === "number"
        ? plan.totalBudgetLimitMinor
        : (plan?.totalBudgetLimitMinor ?? null),
    currency: plan?.currency,
    homeCurrency: plan?.currency,
    displayCurrency: plan?.currency,
    budgetGoals: Array.isArray(plan?.budgetGoals)
      ? plan.budgetGoals.map((g: any) => ({
          id: g.id ?? null,
          category: String(g.category ?? "Other"),
          limitMinor: typeof g.limitMinor === "number" ? g.limitMinor : null,
        }))
      : null,
    savingsGoals: Array.isArray(plan?.savingsGoals)
      ? plan.savingsGoals.map((g: any) => ({
          id: g.id ?? null,
          name: String(g.name ?? "Other"),
          targetMinor: typeof g.targetMinor === "number" ? g.targetMinor : null,
        }))
      : null,
  };

  serverPlanDTOSchema.parse(dto);
  return dto;
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

    // NOTE: Monthly plans list is intended for Dashboard / analytics (not PlanScreen).
    // 0) Monthly list (ported from /plans/monthly GET)
    // GET /api/plans?periodType=MONTHLY&at=YYYY-MM&months=N
    if (periodType === "MONTHLY" && (at || months)) {
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
        periodType: periodType as PrismaPeriodType,
        timeZone,
        startUTC: getMonthlyPeriodStartUTC(timeZone, now),
        count,
        at,
        now: now,
      });

      const plans = await prisma.plan.findMany({
        where: {
          userId,
          periodType: periodType as PrismaPeriodType,
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
            plan: plan ? toServerPlanDTO(plan, timeZone) : null,
          };
        });

      return NextResponse.json({
        timeZone,
        periodType,
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
            periodType: periodType as PrismaPeriodType,
            periodStart: isoLocalDayToUTCDate(timeZone, periodStartISO),
          },
        },
        include,
      });

      if (!plan) {
        return NextResponse.json({ error: "Plan not found" }, { status: 404 });
      }

      const dto = toServerPlanDTO(plan, timeZone);
      return NextResponse.json(dto);
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
        const dto = toServerPlanDTO(activePlan, timeZone);
        return NextResponse.json(dto);
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
      const dto = toServerPlanDTO(created, timeZone);
      return NextResponse.json(dto);
    }

    // ✅ 복구: 최신 플랜을 activePlanId로 세팅
    await prisma.user.update({
      where: { id: userId },
      data: { activePlanId: plan.id },
    });

    const dto = toServerPlanDTO(plan, timeZone);
    return NextResponse.json(dto);
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
  let data: PatchPlanDTO;
  try {
    data = patchPlanSchema.parse(body);
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid body", details: e.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
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
    // validated above
    const url = new URL(request.url);
    // Legacy /plans/monthly POST sometimes provided `at` via querystring.
    const monthlyAt =
      data.periodType === "MONTHLY"
        ? (data.at ?? url.searchParams.get("at") ?? undefined)
        : undefined;

    const setActive = data.setActive === true;
    const useCurrentPeriod = data.useCurrentPeriod === true;

    // ✅ biweekly는 anchor가 필수 (2주 단위 기준점)
    if (
      data.periodType === "BIWEEKLY" &&
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
      data.periodType !== "WEEKLY" &&
      !data.periodStartISO &&
      !data.periodStartUTC &&
      !(setActive && useCurrentPeriod) &&
      !(data.periodType === "MONTHLY" && monthlyAt)
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

    if (data.periodType === "WEEKLY") {
      // ✅ Weekly는 서버가 weekStartsOn 기준으로 계산 (유저 타임존 기준)
      periodStart = getWeeklyPeriodStartUTC(
        timeZone,
        new Date(),
        DEFAULT_WEEK_STARTS_ON,
      );
    } else if (setActive && useCurrentPeriod) {
      // ✅ 즉시 전환: 서버가 "현재 기간"의 periodStart를 계산
      if (data.periodType === "MONTHLY") {
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
      } else if (data.periodType === "MONTHLY" && monthlyAt) {
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
            periodType: data.periodType as PrismaPeriodType,
            periodStart,
          },
        },
        create: {
          userId,
          periodType: data.periodType as PrismaPeriodType,
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

    const dto = toServerPlanDTO(plan, timeZone);
    return NextResponse.json(dto);
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
  let data: PatchPlanDTO;
  try {
    data = patchPlanSchema.parse(body);
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid body", details: e.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
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
    // validated above

    const setActive = data.setActive === true;
    const useCurrentPeriod = data.useCurrentPeriod === true;

    // ✅ biweekly는 anchor가 필수 (2주 단위 기준점)
    if (
      data.periodType === "BIWEEKLY" &&
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
      data.periodType !== "WEEKLY" &&
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

    if (data.periodType === "WEEKLY") {
      // ✅ Weekly는 서버가 weekStartsOn 기준으로 계산 (유저 타임존 기준)
      periodStart = getWeeklyPeriodStartUTC(
        timeZone,
        new Date(),
        DEFAULT_WEEK_STARTS_ON,
      );
    } else if (setActive && useCurrentPeriod) {
      // ✅ 즉시 전환: 서버가 "현재 기간"의 periodStart를 계산
      if (data.periodType === "MONTHLY") {
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
            periodType: data.periodType as PrismaPeriodType,
            periodStart,
          },
        },
        create: {
          userId,
          periodType: data.periodType as PrismaPeriodType,
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

    const dto = toServerPlanDTO(plan, timeZone);
    return NextResponse.json(dto);
  } catch (error) {
    console.error("Update plan error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
