// apps/server/src/app/api/transactions/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { transactionUpdateSchema } from "@pq/shared/transactions/types";

import {
  getTransactionByIdForUser,
  updateTransactionForUser,
  deleteTransactionForUser,
} from "@/domain/transaction/transaction.service";
import {
  HttpError,
  jsonHttpError,
  jsonInternalError,
} from "@/lib/http/httpError";

// Use shared transactionUpdateSchema for basic update shape; server enforces extra rules.
const updateTransactionSchema = transactionUpdateSchema;

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
    // service에서 던진 HttpError(status/payload)를 그대로 내려보내기
    const httpError = jsonHttpError(error);
    if (httpError) return httpError;

    return jsonInternalError(error, "Get transaction error:");
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
    const httpError = jsonHttpError(error);
    if (httpError) return httpError;

    return jsonInternalError(error, "Update transaction error:");
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
    const httpError = jsonHttpError(error);
    if (httpError) return httpError;

    return jsonInternalError(error, "Delete transaction error:");
  }
}
