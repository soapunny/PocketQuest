// apps/server/src/app/api/transactions/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { resolveInternalUserId } from "@/lib/auth";
import { transactionUpdateSchema } from "@pq/shared/transactions/types";

import {
  getTransactionByIdForUser,
  updateTransactionForUser,
  deleteTransactionForUser,
} from "@/domain/transaction/transaction.service";
import { HttpError } from "@/lib/http/httpError";

// Use shared transactionUpdateSchema for basic update shape; server enforces extra rules.
const updateTransactionSchema = transactionUpdateSchema;

function jsonUnauthorized(devHint: string | null) {
  return NextResponse.json(
    {
      error: "Unauthorized",
      ...(process.env.NODE_ENV !== "production" && devHint
        ? { hint: devHint }
        : {}),
    },
    { status: 401 },
  );
}

function jsonHttpError(error: HttpError) {
  return NextResponse.json(
    { error: error.message, ...(error.payload ?? {}) },
    { status: error.status },
  );
}

async function requireUserId(request: NextRequest, body?: unknown) {
  const { userId, devHint } = await resolveInternalUserId(request, body);
  if (!userId)
    return { ok: false as const, response: jsonUnauthorized(devHint) };
  return { ok: true as const, userId };
}

// GET /api/transactions/[id] - Get single transaction
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const result = await getTransactionByIdForUser({
      userId: auth.userId,
      id: params.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    // ✅ service에서 던진 HttpError(status/payload)를 그대로 내려보내기
    if (error instanceof HttpError) return jsonHttpError(error);

    console.error("Get transaction error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// PATCH /api/transactions/[id] - Update transaction
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  // const user = getAuthUser(request);

  try {
    const body: unknown = await request.json();

    const auth = await requireUserId(request, body);
    if (!auth.ok) return auth.response;
    const parsed = updateTransactionSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid request data", {
        details: parsed.error.issues,
        message: parsed.error.message,
      });
    }
    const data = parsed.data;
    const result = await updateTransactionForUser({
      userId: auth.userId,
      id: params.id,
      data,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof HttpError) return jsonHttpError(error);

    console.error("Update transaction error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// DELETE /api/transactions/[id] - Delete transaction
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const result = await deleteTransactionForUser({
      userId: auth.userId,
      id: params.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof HttpError) return jsonHttpError(error);
    console.error("Delete transaction error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
