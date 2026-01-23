import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import {
  getWeeklyPeriodStartUTC,
  getBiweeklyPeriodStartUTC,
  calcNextPeriodEnd,
} from "@/lib/plan/periodRules";
import {
  DEFAULT_TIME_ZONE,
  DEFAULT_LOCALE,
  DEFAULT_WEEK_STARTS_ON,
} from "@/lib/plan/defaults";
import { CurrencyCode, LanguageCode, PeriodType } from "@prisma/client";
import { z } from "zod";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

// ---- Helper utilities ----
function isValidIanaTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string") return false;
  const v = tz.trim();
  if (!v) return false;
  try {
    // Will throw on unknown time zone in JS runtimes that support IANA tz
    Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone: v }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function normalizeUserTimeZone(tz: unknown): string {
  return isValidIanaTimeZone(tz) ? tz.trim() : DEFAULT_TIME_ZONE;
}

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
  // DB uses a single `currency` field (CurrencyCode). We still accept legacy client fields.
  currency: currencySchema.optional(),
  homeCurrency: currencySchema.optional(),
  displayCurrency: currencySchema.optional(),
  advancedCurrencyMode: z.boolean().optional(),
  language: languageSchema.optional(),
  totalBudgetLimitMinor: z.number().int().nonnegative().optional(),
  // New: Accept arrays of goals for upsert
  budgetGoals: z
    .array(
      z.object({
        // Optional: allow client to send id (server ignores it for upsert)
        id: z.string().min(1).optional(),
        category: z.string().min(1),
        limitMinor: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  savingsGoals: z
    .array(
      z.object({
        // Optional: allow client to send id (server ignores it for upsert)
        id: z.string().min(1).optional(),
        name: z.string().min(1),
        targetMinor: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  // If true, set this plan as the user's active plan (updates User.activePlanId)
  setActive: z.boolean().optional(),
  // If true, server will compute the current periodStart for the given periodType when periodStartISO is omitted
  useCurrentPeriod: z.boolean().optional(),
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
  // Interpret YYYY-MM-DD as UTC midnight (ONLY use when the date is truly UTC-based)
  const s = String(iso || "");
  const [y, m, d] = s.split("-").map((n) => Number(n));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0));
}

function isoLocalDayToUTCDate(timeZone: string, iso: unknown): Date {
  // Interpret YYYY-MM-DD as *local* midnight in `timeZone`, then convert to UTC.
  // IMPORTANT: avoid `new Date(y, m, d, ...)` because it uses the server's runtime timezone.
  const s = typeof iso === "string" ? iso.trim() : String(iso ?? "").trim();

  // Basic ISO date (local day) validation: YYYY-MM-DD
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(s);
  if (!m) {
    throw new Error(`Invalid ISO local-day date: ${s}`);
  }

  // Build a local time string in the user's timezone and convert that instant to UTC.
  // Example: 2026-01-19T00:00:00 in America/New_York -> 2026-01-19T05:00:00.000Z
  return fromZonedTime(`${s}T00:00:00`, timeZone);
}

function getMonthlyPeriodStartUTC_local(
  timeZone: string,
  now: Date = new Date(),
): Date {
  const zonedNow = toZonedTime(now, timeZone);
  const zonedStart = new Date(
    zonedNow.getFullYear(),
    zonedNow.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );
  return fromZonedTime(zonedStart, timeZone);
}

function withPlanUtcFields(plan: any, timeZone: string) {
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

async function ensureDefaultActivePlan(userId: string, timeZone: string) {
  // Default behavior for MVP: if the user has no plans yet, create a current MONTHLY plan
  // (can be changed later to WEEKLY/BIWEEKLY based on onboarding).
  const include = { budgetGoals: true, savingsGoals: true } as const;

  const periodType: PeriodType = PeriodType.MONTHLY;
  const periodStart = getMonthlyPeriodStartUTC_local(timeZone);
  const periodEnd = calcNextPeriodEnd(periodStart, periodType, timeZone);

  const plan = await prisma.plan.upsert({
    where: {
      userId_periodType_periodStart: {
        userId,
        periodType,
        periodStart,
      },
    },
    create: {
      userId,
      periodType,
      periodStart,
      periodEnd,
      // Safe defaults; user can update via PATCH later
      totalBudgetLimitMinor: 0,
    },
    update: {
      // Repair periodEnd if rules changed
      periodEnd,
    },
    include,
  });

  await prisma.user.update({
    where: { id: userId },
    data: { activePlanId: plan.id },
  });

  console.log("[plans] auto-created default plan", {
    userId,
    timeZone,
    periodType,
    periodStartUTC: periodStart.toISOString(),
    periodEndUTC: periodEnd.toISOString(),
    planId: plan.id,
  });

  return plan;
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
      { status: 401 },
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
      { status: 400 },
    );
  }

  try {
    const { periodType, periodStartISO } = parsedQuery.data;

    const include = { budgetGoals: true, savingsGoals: true } as const;

    // 1) caller가 periodType + periodStartISO를 주면 해당 플랜 정확히 조회
    if (periodType && periodStartISO) {
      // periodStartISO is a local-day identifier; convert using the user's timezone.
      const userTzRow = await prisma.user.findUnique({
        where: { id: userId },
        select: { timeZone: true },
      });
      const timeZone = normalizeUserTimeZone(userTzRow?.timeZone);

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
    const timeZone = normalizeUserTimeZone(user?.timeZone);

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
      select: { timeZone: true, id: true, activePlanId: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const timeZone = normalizeUserTimeZone(user.timeZone);
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
        periodStart = getMonthlyPeriodStartUTC_local(timeZone);
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
          1,
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
      data.displayCurrency) as CurrencyCode | undefined;

    const language = data.language as LanguageCode | undefined;

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
          ...(currency ? { currency } : {}),
          ...(language ? { language } : {}),
          totalBudgetLimitMinor: data.totalBudgetLimitMinor ?? 0,
        },
        update: {
          periodEnd,
          periodAnchor,
          ...(currency ? { currency } : {}),
          ...(language ? { language } : {}),
          totalBudgetLimitMinor: data.totalBudgetLimitMinor,
        },
        include: {
          budgetGoals: true,
          savingsGoals: true,
        },
      });

      // Patch semantics: only modify categories provided by the client.
      if (data.budgetGoals) {
        for (const g of data.budgetGoals) {
          const category = String(g.category).trim();
          const limitMinor = Number(g.limitMinor);

          if (!category) continue;

          if (!Number.isFinite(limitMinor) || limitMinor <= 0) {
            await tx.budgetGoal.deleteMany({
              where: { planId: upserted.id, category },
            });
            continue;
          }

          await tx.budgetGoal.upsert({
            where: {
              planId_category: {
                planId: upserted.id,
                category,
              },
            },
            create: { planId: upserted.id, category, limitMinor },
            update: { limitMinor },
          });
        }
      }

      // Patch semantics: only modify savings goals provided by the client.
      if (data.savingsGoals) {
        for (const g of data.savingsGoals) {
          const name = String(g.name).trim();
          const targetMinor = Number(g.targetMinor);

          if (!name) continue;

          if (!Number.isFinite(targetMinor) || targetMinor <= 0) {
            await tx.savingsGoal.deleteMany({
              where: { planId: upserted.id, name },
            });
            continue;
          }

          await tx.savingsGoal.upsert({
            where: {
              planId_name: {
                planId: upserted.id,
                name,
              },
            },
            create: { planId: upserted.id, name, targetMinor },
            update: { targetMinor },
          });
        }
      }

      // Re-fetch with relations if we modified any goals.
      if (data.budgetGoals || data.savingsGoals) {
        const fresh = await tx.plan.findUnique({
          where: { id: upserted.id },
          include: { budgetGoals: true, savingsGoals: true },
        });
        return fresh ?? upserted;
      }

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
      select: { timeZone: true, id: true, activePlanId: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const timeZone = normalizeUserTimeZone(user.timeZone);
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
        periodStart = getMonthlyPeriodStartUTC_local(timeZone);
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
          1,
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
      data.displayCurrency) as CurrencyCode | undefined;

    const language = data.language as LanguageCode | undefined;

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
          ...(currency ? { currency } : {}),
          ...(language ? { language } : {}),
          totalBudgetLimitMinor: data.totalBudgetLimitMinor ?? 0,
        },
        update: {
          periodEnd, // ✅ periodEnd는 항상 최신 규칙으로 채우기(특히 null 복구)
          periodAnchor,
          ...(currency ? { currency } : {}),
          ...(language ? { language } : {}),
          totalBudgetLimitMinor: data.totalBudgetLimitMinor,
        },
        include: {
          budgetGoals: true,
          savingsGoals: true,
        },
      });

      // Patch semantics: only modify categories provided by the client.
      if (data.budgetGoals) {
        for (const g of data.budgetGoals) {
          const category = String(g.category).trim();
          const limitMinor = Number(g.limitMinor);

          if (!category) continue;

          if (!Number.isFinite(limitMinor) || limitMinor <= 0) {
            await tx.budgetGoal.deleteMany({
              where: { planId: upserted.id, category },
            });
            continue;
          }

          await tx.budgetGoal.upsert({
            where: {
              planId_category: {
                planId: upserted.id,
                category,
              },
            },
            create: { planId: upserted.id, category, limitMinor },
            update: { limitMinor },
          });
        }
      }

      // Patch semantics: only modify savings goals provided by the client.
      if (data.savingsGoals) {
        for (const g of data.savingsGoals) {
          const name = String(g.name).trim();
          const targetMinor = Number(g.targetMinor);

          if (!name) continue;

          if (!Number.isFinite(targetMinor) || targetMinor <= 0) {
            await tx.savingsGoal.deleteMany({
              where: { planId: upserted.id, name },
            });
            continue;
          }

          await tx.savingsGoal.upsert({
            where: {
              planId_name: {
                planId: upserted.id,
                name,
              },
            },
            create: { planId: upserted.id, name, targetMinor },
            update: { targetMinor },
          });
        }
      }

      // Re-fetch with relations if we modified any goals.
      if (data.budgetGoals || data.savingsGoals) {
        const fresh = await tx.plan.findUnique({
          where: { id: upserted.id },
          include: { budgetGoals: true, savingsGoals: true },
        });
        return fresh ?? upserted;
      }

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
