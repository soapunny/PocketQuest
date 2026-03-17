// apps/server/src/app/api/plans/[id]/goals/budget/route.ts

import { NextRequest, NextResponse } from "next/server";

import {
  patchBudgetGoalsRequestSchema,
  upsertBudgetGoalRequestSchema,
} from "@pq/shared/plans/types";

import { requireUserId } from "@/lib/auth";
import { jsonRouteError } from "@/lib/http/httpError";

import {
  getBudgetGoals,
  patchBudgetGoals,
  upsertBudgetGoal,
} from "@/domain/plan/plan.service";

// GET /api/plans/[id]/goals/budget
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;
    const planId = params.id;

    const result = await getBudgetGoals(userId, planId);
    return NextResponse.json(result.goals);
  } catch (error) {
    return jsonRouteError(error, "[budget goals] GET error:");
  }
}

// POST /api/plans/[id]/goals/budget
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

    const parsedBody = upsertBudgetGoalRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    const result = await upsertBudgetGoal(userId, planId, parsedBody.data);

    if ("ok" in result && result.ok) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    const { plan } = result as { plan: { id?: string } };
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    return jsonRouteError(error, "[budget goals] POST error:");
  }
}

// PATCH /api/plans/[id]/goals/budget
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

    const parsed = patchBudgetGoalsRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await patchBudgetGoals(userId, planId, parsed.data);
    return NextResponse.json({ plan: result.plan });
  } catch (error) {
    return jsonRouteError(error, "[budget goals] PATCH error:");
  }
}
