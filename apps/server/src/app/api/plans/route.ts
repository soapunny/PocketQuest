// apps/server/src/app/api/plans/route.ts

import { NextRequest, NextResponse } from "next/server";

import {
  getPlanQuerySchema,
  patchPlanSchema,
} from "@pq/shared/plans/types";
import type { PatchPlanDTO } from "@pq/shared/plans/types";

import { requireUserId } from "@/lib/auth";
import { jsonRouteError } from "@/lib/http/httpError";
import { PeriodType as PrismaPeriodType } from "@prisma/client";

import {
  getCurrentPlan,
  getPlanByPeriod,
  getMonthlyPlans,
  upsertPlan,
} from "@/domain/plan/plan.service";

// Get plan
// 1. Monthly list, 2. Exact period lookup, 3. Active plan (with fallback / auto-create)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;

    const url = new URL(request.url);
    const parsedQuery = getPlanQuerySchema.safeParse({
      periodType: url.searchParams.get("periodType") ?? undefined,
      periodStartISO: url.searchParams.get("periodStartISO") ?? undefined,
      at: url.searchParams.get("at") ?? undefined,
      months: url.searchParams.get("months") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Invalid query", details: parsedQuery.error.flatten() },
        { status: 400 },
      );
    }

    const { periodType, periodStartISO, at, months } = parsedQuery.data;

    // Monthly list
    if (periodType === "MONTHLY" && (at || months)) {
      const result = await getMonthlyPlans(userId, at ?? null, months ?? null);
      return NextResponse.json(result);
    }

    // Exact period lookup
    if (periodType && periodStartISO) {
      const plan = await getPlanByPeriod(
        userId,
        periodType as PrismaPeriodType,
        periodStartISO,
      );
      if (!plan) {
        return NextResponse.json({ error: "Plan not found" }, { status: 404 });
      }
      return NextResponse.json(plan);
    }

    // Default: active plan (or fallback / auto-create)
    const plan = await getCurrentPlan(userId);
    return NextResponse.json(plan);
  } catch (error) {
    return jsonRouteError(error, "[plans] GET error:");
  }
}

// Create plan
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const auth = await requireUserId(request, body);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;

    const parsed = patchPlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = parsed.data as PatchPlanDTO;

    const url = new URL(request.url);
    const monthlyAtOverride =
      data.periodType === "MONTHLY"
        ? (data.at ?? url.searchParams.get("at") ?? undefined)
        : undefined;

    const result = await upsertPlan(userId, data, {
      monthlyAtOverride,
      allowMonthlyAtFromQuery: true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonRouteError(error, "[plans] POST error:");
  }
}

// Update plan
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const auth = await requireUserId(request, body);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;

    const parsed = patchPlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = parsed.data as PatchPlanDTO;

    const result = await upsertPlan(userId, data, {
      allowMonthlyAtFromQuery: false,
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonRouteError(error, "[plans] PATCH error:");
  }
}
