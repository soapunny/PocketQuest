// apps/server/src/app/api/transactions/route.ts

import { NextRequest, NextResponse } from "next/server";
import { resolveInternalUserId } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import {
  transactionCreateSchema,
  rangeSchema,
  Range,
} from "@pq/shared/transactions/types";

import {
  getTransactionsForUser,
  createTransactionForUser,
} from "@/domain/transaction/transaction.service";
import { ZodError } from "zod";

async function requireUserId(request: NextRequest, body?: unknown) {
  const { userId, devHint } = await resolveInternalUserId(request, body);

  if (!userId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: "Unauthorized",
          ...(process.env.NODE_ENV !== "production" && devHint
            ? { hint: devHint }
            : {}),
        },
        { status: 401 },
      ),
    };
  }

  return { ok: true as const, userId };
}

// GET /api/transactions - Get all transactions for user
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUserId(request);

    if (!auth.ok) return auth.response;

    const userId = auth.userId;
    // Optional calendar filters: range=THIS_MONTH | LAST_MONTH | THIS_YEAR | ALL (default ALL)
    const rawRange = request.nextUrl.searchParams.get("range") || "ALL";
    const normalizedRange = rawRange.toUpperCase();
    const parsedRange = rangeSchema.safeParse(normalizedRange);

    if (!parsedRange.success) {
      return NextResponse.json(
        { error: "Invalid range", details: parsedRange.error.message },
        { status: 400 },
      );
    }

    const includeSummary =
      request.nextUrl.searchParams.get("includeSummary") === "1";

    const result = await getTransactionsForUser({
      userId,
      range: parsedRange.data as Range,
      includeSummary,
    });

    return NextResponse.json(result);
  } catch (error) {
    const status = (error as any)?.status;
    if (typeof status === "number") {
      return NextResponse.json(
        {
          error: (error as any)?.message ?? "Error",
          ...((error as any)?.payload ?? {}),
        },
        { status },
      );
    }
    console.error("Get transactions error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST /api/transactions - Create new transaction
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const auth = await requireUserId(request, body);
    if (!auth.ok) return auth.response;

    const userId = auth.userId;

    type ServiceCreateData = Parameters<
      typeof createTransactionForUser
    >[0]["data"];
    const data: ServiceCreateData = transactionCreateSchema.parse(body);
    const result = await createTransactionForUser({ userId, data });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const status = (error as any)?.status;
    if (typeof status === "number") {
      return NextResponse.json(
        {
          error: (error as any)?.message ?? "Error",
          ...((error as any)?.payload ?? {}),
        },
        { status },
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 },
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

    console.error("Create transaction error:", error);

    const payload: any = { error: "Internal server error" };
    if (process.env.NODE_ENV !== "production") {
      payload.message = (error as any)?.message ?? String(error);
    }

    return NextResponse.json(payload, { status: 500 });
  }
}
