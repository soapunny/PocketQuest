// apps/server/src/app/api/plans/[id]/goals/savings/route.ts

import { NextRequest, NextResponse } from "next/server";

import {
  patchSavingsGoalsRequestSchema,
  upsertSavingsGoalRequestSchema,
} from "@pq/shared/plans/types";

import { requireUserId } from "@/lib/auth";
import { jsonRouteError } from "@/lib/http/httpError";

import {
  getSavingsGoals,
  patchSavingsGoals,
  upsertSavingsGoal,
} from "@/domain/plan/plan.service";

// GET /api/plans/[id]/goals/savings
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;
    const planId = params.id;

    const result = await getSavingsGoals(userId, planId);
    return NextResponse.json(result.goals);
  } catch (error) {
    return jsonRouteError(error, "[savings goals] GET error:");
  }
}

// POST /api/plans/[id]/goals/savings
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body: unknown = await request.json().catch(() => ({}));
    const auth = await requireUserId(request, body);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;
    const planId = params.id;

    const parsedBody = upsertSavingsGoalRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    const result = await upsertSavingsGoal(userId, planId, parsedBody.data);
    return NextResponse.json({ plan: result.plan }, { status: 200 });
  } catch (error) {
    return jsonRouteError(error, "[savings goals] POST error:");
  }
}

// PATCH /api/plans/[id]/goals/savings
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body: unknown = await request.json().catch(() => ({}));
    const auth = await requireUserId(request, body);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;
    const planId = params.id;

    const parsed = patchSavingsGoalsRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await patchSavingsGoals(userId, planId, parsed.data);
    return NextResponse.json({ plan: result.plan });
  } catch (error) {
    return jsonRouteError(error, "[savings goals] PATCH error:");
  }
}
