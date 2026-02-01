// apps/server/src/app/api/transactions/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { z, ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { Currency } from "../../../../../../../packages/shared/src/money/types";
import {
  transactionUpdateSchema,
  TransactionDTO,
  TxType,
} from "../../../../../../../packages/shared/src/transactions/types";
import {
  EXPENSE_CATEGORY_KEYS,
  INCOME_CATEGORY_KEYS,
  canonicalCategoryKeyForServer,
} from "../../../../../../../packages/shared/src/transactions/categories";

const SAVING_CATEGORY_KEY = "savings" as const;

// Zod enums from shared SSOT
const expenseCategoryKeySchema = z.enum(EXPENSE_CATEGORY_KEYS);
const incomeCategoryKeySchema = z.enum(INCOME_CATEGORY_KEYS);
import { DEFAULT_TIME_ZONE } from "@/lib/plan/defaults";
import { toZonedTime } from "date-fns-tz";
import { format } from "date-fns";

// Use shared transactionUpdateSchema for basic update shape; server enforces extra rules.
const updateTransactionSchema = transactionUpdateSchema;

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
    occurredAt: t.occurredAt.toISOString(),
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

  return null;
}

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

// GET /api/transactions/[id] - Get single transaction
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { timeZone: true },
    });
    const timeZone = dbUser?.timeZone || DEFAULT_TIME_ZONE;

    const transaction = (await prisma.transaction.findFirst({
      where: {
        id: params.id,
        userId,
      },
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
    })) as TransactionRow | null;

    if (!transaction) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      transaction: toTransactionDTO(transaction, timeZone),
    });
  } catch (error) {
    console.error("Get transaction error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/transactions/[id] - Update transaction
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const data = updateTransactionSchema.parse(body);
    if (process.env.NODE_ENV !== "production") {
      console.log("[transactions/[id]] PATCH body", body);
    }

    // Check if transaction exists and belongs to user
    const existing = (await prisma.transaction.findFirst({
      where: {
        id: params.id,
        userId,
      },
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
      },
    })) as TransactionRow | null;

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // compute next state
    const nextType = data.type ?? existing.type;
    const nextAmountMinor = data.amountMinor ?? existing.amountMinor;
    const nextCurrency = data.currency ?? existing.currency;
    const nextFxUsdKrw =
      data.fxUsdKrw !== undefined ? data.fxUsdKrw : existing.fxUsdKrw;
    const nextNote = data.note !== undefined ? data.note : existing.note;
    const nextOccurredAt = data.occurredAtISO
      ? new Date(data.occurredAtISO)
      : existing.occurredAt;
    const nextCategoryRaw = data.category ?? existing.category;
    const nextSavingsGoalIdRaw =
      data.savingsGoalId !== undefined
        ? data.savingsGoalId
        : existing.savingsGoalId;

    // Canonicalize category to server-accepted keys (aliases/casing)
    let category = canonicalCategoryKeyForServer(
      String(nextCategoryRaw ?? "").trim(),
      nextType as TxType
    );

    // Defaults are handled by shared SSOT (`canonicalCategoryKeyForServer`).
    // Defense-in-depth: INCOME must never be "uncategorized" (legacy key).
    if (nextType === "INCOME" && category === "uncategorized") {
      category = "other";
    }
    let savingsGoalId =
      typeof nextSavingsGoalIdRaw === "string"
        ? nextSavingsGoalIdRaw.trim()
        : undefined;
    if (savingsGoalId === "") savingsGoalId = undefined;

    if (nextType === "SAVING") {
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

      category = SAVING_CATEGORY_KEY;
    } else {
      // For non-saving types, savingsGoalId must be cleared (nullable field => set null in Prisma)
      savingsGoalId = undefined;

      if (nextType === "EXPENSE") {
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

      if (nextType === "INCOME") {
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

    const updateData: any = {
      type: nextType,
      amountMinor: nextAmountMinor,
      currency: nextCurrency,
      // Nullable columns: use null to clear
      fxUsdKrw: nextFxUsdKrw ?? null,
      category,
      // Nullable in Prisma schema: set for SAVING, otherwise clear to null
      savingsGoalId: nextType === "SAVING" ? savingsGoalId : null,
      occurredAt: nextOccurredAt,
      note: nextNote ?? null,
    };
    if (process.env.NODE_ENV !== "production") {
      console.log("[transactions/[id]] PATCH updateData", updateData);
    }

    const transaction = (await prisma.transaction.update({
      where: { id: params.id },
      data: updateData,
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

    return NextResponse.json({
      transaction: toTransactionDTO(transaction, timeZone),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // e.g. P2025 (record not found), P2002 (unique), etc.
      const payload: any = {
        error: "Database error",
        code: error.code,
      };
      if (process.env.NODE_ENV !== "production") {
        payload.message = error.message;
        payload.meta = (error as any).meta ?? null;
      }
      return NextResponse.json(payload, { status: 400 });
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      const payload: any = { error: "Database validation error" };
      if (process.env.NODE_ENV !== "production") {
        payload.message = error.message;
      }
      return NextResponse.json(payload, { status: 400 });
    }

    console.error("Update transaction error:", error);

    const payload: any = { error: "Internal server error" };
    if (process.env.NODE_ENV !== "production") {
      payload.message = (error as any)?.message ?? String(error);
    }

    return NextResponse.json(payload, { status: 500 });
  }
}

// DELETE /api/transactions/[id] - Delete transaction
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    // Check if transaction exists and belongs to user
    const existing = await prisma.transaction.findFirst({
      where: {
        id: params.id,
        userId,
      },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.transaction.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete transaction error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
