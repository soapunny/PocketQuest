// apps/server/src/app/api/transactions/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import {
  transactionCreateSchema,
  rangeSchema,
} from "@pq/shared/transactions/types";

import {
  getTransactionsForUser,
  createTransactionForUser,
} from "@/domain/transaction/transaction.service";
import { jsonRouteError } from "@/lib/http/httpError";

// GET /api/transactions - Get all transactions for user
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUserId(request);

    if (!auth.ok) return auth.response;

    const userId = auth.userId;
    // Optional calendar filters: range=THIS_MONTH | LAST_MONTH | THIS_YEAR | ALL (default ALL)
    const rawRange = request.nextUrl.searchParams.get("range") || "ALL";
    const normalizedRange = rawRange.toUpperCase();
    const parsedRange = rangeSchema.parse(normalizedRange); //zod enum validation check

    const includeSummary =
      request.nextUrl.searchParams.get("includeSummary") === "1"; // 총 지출, 총 수입, 카테고리 합계 계산 여부

    const result = await getTransactionsForUser({
      userId,
      range: parsedRange,
      includeSummary,
    });

    return NextResponse.json(result); //json으로 결과 반환
  } catch (error) {
    return jsonRouteError(error, "Get transactions error:");
  }
}

// POST /api/transactions - Create new transaction
export async function POST(request: NextRequest) {
  try {
    //입력
    const body: unknown = await request.json();
    //검증
    const auth = await requireUserId(request, body);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;
    //파싱
    type ServiceCreateData = Parameters<
      typeof createTransactionForUser
    >[0]["data"];
    const data: ServiceCreateData = transactionCreateSchema.parse(body);
    //서비스에 넘김
    const result = await createTransactionForUser({ userId, data });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return jsonRouteError(error, "Create transaction error:");
  }
}
