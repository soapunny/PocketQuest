// apps/server/src/app/api/plans/actions/switch-currency/route.ts

import { NextRequest, NextResponse } from "next/server";

import { switchCurrencyRequestSchema } from "@pq/shared/plans/types";

import { requireUserId } from "@/lib/auth";
import { jsonRouteError } from "@/lib/http/httpError";

import { switchCurrency } from "@/domain/plan/plan.service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const auth = await requireUserId(request, body);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;

    const parsed = switchCurrencyRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Bad Request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await switchCurrency(userId, parsed.data);

    return NextResponse.json({ plan: result.plan });
  } catch (error) {
    return jsonRouteError(error, "[PLAN_SWITCH_CURRENCY_ERROR]");
  }
}
