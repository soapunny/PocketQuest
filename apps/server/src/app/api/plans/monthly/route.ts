import { z } from "zod";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { NextRequest, NextResponse } from "next/server";
// NOTE: Avoid importing model types (e.g., BudgetGoal) because some Prisma client builds may not export them reliably in this repo setup.
import { prisma } from "@/lib/prisma";
import { getMonthlyPeriodStartUTC } from "@/lib/plan/periodRules";

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

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function parseAtToMonthStartUTC(atRaw: string, timeZone: string): Date | null {
  const s = String(atRaw || "").trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return null;

  // Interpret as local midnight in the user's timezone.
  const local = new Date(`${s}-01T00:00:00`);
  try {
    return fromZonedTime(local, timeZone);
  } catch {
    return null;
  }
}

function parseAtToUTC(
  atRaw: string | null | undefined,
  timeZone: string,
): Date {
  const raw = String(atRaw || "").trim();

  // Default: current month in the user's timezone
  if (!raw) {
    const nowZ = toZonedTime(new Date(), timeZone);
    const y = nowZ.getFullYear();
    const m = String(nowZ.getMonth() + 1).padStart(2, "0");
    const d = parseAtToMonthStartUTC(`${y}-${m}`, timeZone);
    if (!d) throw new Error("Invalid default at");
    return d;
  }

  // Preferred contract: YYYY-MM
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const d = parseAtToMonthStartUTC(raw, timeZone);
    if (!d) throw new Error("Invalid at");
    return d;
  }

  // Fallback: ISO date string
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid at");
  }
  return parsed;
}

function parseAtToDate(atRaw: string | null | undefined): Date {
  const raw = (atRaw || "").trim();

  // Default: current month anchor (UTC) to avoid timezone edge cases.
  if (!raw) {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    return new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  }

  // Support YYYY-MM
  const ym = /^\d{4}-\d{2}$/.test(raw);
  if (ym) {
    const [yy, mm] = raw.split("-");
    const y = Number(yy);
    const m = Number(mm) - 1;
    return new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
  }
  return parsed;
}

function normalizeTimeZone(tzRaw: unknown): string {
  const tz = typeof tzRaw === "string" ? tzRaw.trim() : "";
  if (!tz) return "America/New_York";
  try {
    // Validate against Intl (throws on invalid IANA zone)
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return "America/New_York";
  }
}

function assertValidDate(d: Date, label: string) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new Error(`${label} is invalid`);
  }
}

function assertReasonableDateRange(d: Date, label: string) {
  // Prevent accidental year overflow (commonly triggers Prisma/Postgres "Date value out of bounds")
  const y = d.getUTCFullYear();
  if (y < 1970 || y > 2100) {
    throw new Error(`${label} out of reasonable range: ${y}`);
  }
}

function computeMonthlyPeriodStartSafe(timeZone: string, atDate: Date): Date {
  try {
    const periodStart = getMonthlyPeriodStartUTC(timeZone, atDate);
    assertValidDate(periodStart, "periodStart");
    assertReasonableDateRange(periodStart, "periodStart");
    return periodStart;
  } catch {
    // Fallback: UTC month start based on atDate
    return new Date(
      Date.UTC(atDate.getUTCFullYear(), atDate.getUTCMonth(), 1, 0, 0, 0, 0),
    );
  }
}

function monthKeyFromZoned(
  baseUTC: Date,
  timeZone: string,
  offsetMonths: number,
): string {
  const z = toZonedTime(baseUTC, timeZone);
  const y0 = z.getFullYear();
  const m0 = z.getMonth(); // 0-11
  const total = y0 * 12 + m0 - offsetMonths;
  const y = Math.floor(total / 12);
  const m = total % 12;
  const mm = String(m + 1).padStart(2, "0");
  return `${y}-${mm}`;
}

function monthlyPeriodStartUTCFromAt(
  atRaw: string | null | undefined,
  timeZone: string,
): Date {
  const atDate = parseAtToUTC(atRaw, timeZone);
  // For MONTHLY, our canonical periodStart is "local month start" converted to UTC.
  // If atRaw was YYYY-MM, parseAtToUTC already returns that instant.
  // If atRaw was ISO or empty, normalize to the corresponding month key.
  const key = /^\d{4}-\d{2}$/.test(String(atRaw || "").trim())
    ? String(atRaw).trim()
    : monthKeyFromZoned(atDate, timeZone, 0);

  const d = parseAtToMonthStartUTC(key, timeZone);
  if (!d) throw new Error("Invalid at");
  return d;
}

export async function GET(request: NextRequest) {
  const queryUserId = (request.nextUrl.searchParams.get("userId") || "").trim();
  const devUserId = !queryUserId ? getDevUserId(request) : null;
  const userId = queryUserId || devUserId || "";

  if (!userId) {
    return NextResponse.json(
      // DEV ONLY: userId is passed explicitly or resolved from DEV_USER_ID.
      // In production, this should come from auth/session.
      { error: "userId is required (dev only)" },
      { status: 400 },
    );
  }

  // Optional: fetch a specific month
  const atRaw = (request.nextUrl.searchParams.get("at") || "").trim();

  // 1) 유저 timezone 조회
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, timeZone: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const timeZone = normalizeTimeZone(user.timeZone);

  const atDate = parseAtToUTC(atRaw, timeZone);

  // 2) 월 시작 계산(UTC 저장값)
  try {
    assertValidDate(atDate, "atDate");
    assertReasonableDateRange(atDate, "atDate");
  } catch (e: any) {
    return NextResponse.json(
      {
        error: "Invalid date inputs",
        details: e?.message ?? String(e),
        debug: { at: atRaw || null, note: "Expected at=YYYY-MM" },
      },
      { status: 400 },
    );
  }

  const periodStart = monthlyPeriodStartUTCFromAt(atRaw, timeZone);

  // Optional: list recent months ending at `at` (or now)
  const monthsRaw = (request.nextUrl.searchParams.get("months") || "").trim();
  const months = monthsRaw
    ? Math.max(1, Math.min(24, Number.parseInt(monthsRaw, 10) || 0))
    : 0;

  if (months > 0) {
    // Build month slots (periodStart UTC)
    const starts: Date[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < months; i++) {
      const atKey = monthKeyFromZoned(atDate, timeZone, i);
      const start = parseAtToMonthStartUTC(atKey, timeZone);
      if (!start) continue;

      // Hard guard: never allow unreasonable years into Prisma queries
      try {
        assertValidDate(start, `starts[${i}]`);
        assertReasonableDateRange(start, `starts[${i}]`);
      } catch {
        continue;
      }

      const key = start.toISOString();
      if (!seen.has(key)) {
        seen.add(key);
        starts.push(start);
      }
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
      existing.map((p: any) => [p.periodStart.toISOString(), p] as const),
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
              starts: starts.map((s) => {
                try {
                  return s.toISOString();
                } catch {
                  return "<invalid-date>";
                }
              }),
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
      { status: 404 },
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
  try {
    const body: unknown = await request.json().catch(() => ({}));

    let userId =
      typeof body === "object" &&
      body !== null &&
      "userId" in body &&
      typeof (body as any).userId === "string"
        ? (body as any).userId.trim()
        : "";

    if (!userId) {
      const devUserId = getDevUserId(request, body);
      if (devUserId) {
        userId = devUserId;
      }
    }

    if (!userId) {
      return NextResponse.json(
        // DEV ONLY: userId is passed explicitly or resolved from DEV_USER_ID.
        // In production, this should come from auth/session.
        { error: "userId is required (dev only)" },
        { status: 400 },
      );
    }

    // Client contract: prefer query (?at=YYYY-MM or ISO). Backward-compat: allow body.at.
    const atRawQuery = (request.nextUrl.searchParams.get("at") || "").trim();
    const atRawBody =
      typeof body === "object" &&
      body !== null &&
      "at" in body &&
      typeof (body as any).at === "string"
        ? String((body as any).at).trim()
        : "";
    const atRaw = atRawQuery || atRawBody;

    // 1) Fetch user timezone
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, timeZone: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const timeZone = normalizeTimeZone(user.timeZone);

    // 2) Normalize/validate dates (same rules as PATCH)
    const atDate = parseAtToUTC(atRaw, timeZone);

    try {
      assertValidDate(atDate, "atDate");
      assertReasonableDateRange(atDate, "atDate");
    } catch (e: any) {
      return NextResponse.json(
        {
          error: "Invalid date inputs",
          details: e?.message ?? String(e),
          debug: { at: atRaw || null, note: "Expected at=YYYY-MM" },
        },
        { status: 400 },
      );
    }

    const periodStart = monthlyPeriodStartUTCFromAt(atRaw, timeZone);

    if (process.env.NODE_ENV === "development") {
      console.log("[POST monthly] atRaw/atDate/periodStart", {
        atRaw: atRaw || null,
        atDate:
          atDate instanceof Date ? atDate.toISOString?.() : String(atDate),
        periodStart:
          periodStart instanceof Date
            ? periodStart.toISOString?.()
            : String(periodStart),
        timeZone,
      });
    }

    // 3) Upsert plan for this month (idempotent create if missing)
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
        // Defaults (can later come from settings)
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
  } catch (error: any) {
    console.error("POST /api/plans/monthly error:", error);

    const isDev = process.env.NODE_ENV === "development";
    const message =
      error && typeof error.message === "string"
        ? error.message
        : typeof error === "string"
          ? error
          : "Internal server error";

    const code =
      error && typeof error.code === "string" ? error.code : undefined;
    const meta =
      error && typeof error.meta === "object" ? error.meta : undefined;
    const name =
      error && typeof error.name === "string" ? error.name : undefined;

    return NextResponse.json(
      isDev
        ? {
            error: message,
            name,
            code,
            meta,
          }
        : { error: "Internal server error" },
      { status: 500 },
    );
  }
}

const patchMonthlyPlanSchema = z.object({
  // DEV ONLY: userId is passed explicitly.
  // In production, this should come from auth/session.
  userId: z.string().min(1),
  // Backward-compat: allow `at` in body; query param still wins.
  at: z.string().optional(),

  // Update fields
  totalBudgetLimitMinor: z.number().int().nonnegative().optional(),

  // Replace sets when provided
  budgetGoals: z
    .array(
      z.object({
        category: z.string().min(1),
        limitMinor: z.number().int().nonnegative(),
      }),
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
          },
        ),
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
        { status: 400 },
      );
    }

    const { userId } = parsed.data;

    const atRawQuery = (request.nextUrl.searchParams.get("at") || "").trim();
    const atRawBody =
      typeof parsed.data.at === "string" ? parsed.data.at.trim() : "";
    const atRaw = atRawQuery || atRawBody;

    // 1) 유저 timezone 조회
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, timeZone: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const timeZone = normalizeTimeZone(user.timeZone);

    const atDate = parseAtToUTC(atRaw, timeZone);

    // 2) 월 시작 계산(UTC 저장값)
    try {
      assertValidDate(atDate, "atDate");
      assertReasonableDateRange(atDate, "atDate");
    } catch (e: any) {
      return NextResponse.json(
        {
          error: "Invalid date inputs",
          details: e?.message ?? String(e),
          debug: { at: atRaw || null, note: "Expected at=YYYY-MM" },
        },
        { status: 400 },
      );
    }

    const periodStart = monthlyPeriodStartUTCFromAt(atRaw, timeZone);

    // DEV LOG: computed dates
    if (process.env.NODE_ENV === "development") {
      console.log("[PATCH monthly] atRaw/atDate/periodStart", {
        atRaw: atRaw || null,
        atDate:
          atDate instanceof Date ? atDate.toISOString?.() : String(atDate),
        periodStart:
          periodStart instanceof Date
            ? periodStart.toISOString?.()
            : String(periodStart),
        timeZone,
      });
    }

    // 3) Plan upsert + (optional) replace goals
    const result = await prisma.$transaction(async (tx: TxClient) => {
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

      // Merge BudgetGoals if provided (PATCH semantics: update only the provided categories)
      // - limitMinor <= 0 => delete that category for this plan
      // - limitMinor > 0  => upsert that category for this plan
      // IMPORTANT: Do NOT delete goals that are not included in the payload.
      if (parsed.data.budgetGoals) {
        // Normalize + dedupe by category (last write wins)
        const byCategory = new Map<string, number>();
        for (const g of parsed.data.budgetGoals) {
          const category = String((g as any)?.category ?? "").trim();
          const limitMinor = Math.max(
            0,
            Math.round(Number((g as any)?.limitMinor) || 0),
          );
          if (!category) continue;
          byCategory.set(category, limitMinor);
        }

        for (const [category, limitMinor] of byCategory.entries()) {
          // Delete only this category when explicitly set to 0
          if (limitMinor <= 0) {
            await tx.budgetGoal.deleteMany({
              where: { planId: plan.id, category },
            });
            continue;
          }

          // Upsert by (planId, category) without relying on Prisma compound-unique name
          const existing = await tx.budgetGoal.findFirst({
            where: { planId: plan.id, category },
            select: { id: true },
          });

          if (existing?.id) {
            await tx.budgetGoal.update({
              where: { id: existing.id },
              data: { limitMinor },
            });
          } else {
            await tx.budgetGoal.create({
              data: { planId: plan.id, category, limitMinor },
            });
          }
        }
      }

      // Merge SavingsGoals if provided (PATCH semantics: update only the provided names)
      // - targetMinor <= 0 => delete that name for this plan
      // - targetMinor > 0  => upsert that name for this plan
      // IMPORTANT: Do NOT delete goals that are not included in the payload.
      if (parsed.data.savingsGoals) {
        // Normalize + dedupe by name (last write wins)
        const byName = new Map<string, number>();
        for (const g of parsed.data.savingsGoals) {
          const name = String((g as any)?.name ?? "").trim();
          const raw = (g as any)?.targetMinor ?? (g as any)?.targetCents ?? 0;
          const targetMinor = Math.max(0, Math.round(Number(raw) || 0));
          if (!name) continue;
          byName.set(name, targetMinor);
        }

        for (const [name, targetMinor] of byName.entries()) {
          if (targetMinor <= 0) {
            await tx.savingsGoal.deleteMany({
              where: { planId: plan.id, name },
            });
            continue;
          }

          const existing = await tx.savingsGoal.findFirst({
            where: { planId: plan.id, name },
            select: { id: true },
          });

          if (existing?.id) {
            await tx.savingsGoal.update({
              where: { id: existing.id },
              data: { targetMinor },
            });
          } else {
            await tx.savingsGoal.create({
              data: { planId: plan.id, name, targetMinor },
            });
          }
        }
      }

      // Return full plan with relations
      return tx.plan.findUnique({
        where: { id: plan.id },
        include: { budgetGoals: true, savingsGoals: true },
      });
    });

    console.log(
      "[PATCH monthly] saved goals:",
      result?.budgetGoals?.find(
        (g: { category: string }) => g.category === "Utilities",
      ),
    );

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
  } catch (error: any) {
    console.error("PATCH /api/plans/monthly error:", error);

    const isDev = process.env.NODE_ENV === "development";
    const message =
      error && typeof error.message === "string"
        ? error.message
        : typeof error === "string"
          ? error
          : "Internal server error";

    // Prisma errors often include `code` and `meta`
    const code =
      error && typeof error.code === "string" ? error.code : undefined;
    const meta =
      error && typeof error.meta === "object" ? error.meta : undefined;
    const name =
      error && typeof error.name === "string" ? error.name : undefined;

    return NextResponse.json(
      isDev
        ? {
            error: message,
            name,
            code,
            meta,
          }
        : { error: "Internal server error" },
      { status: 500 },
    );
  }
}
