// apps/server/src/app/api/plans/actions/rollover/route.ts

import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { jsonRouteError } from "@/lib/http/httpError";

import { rollover } from "@/domain/plan/plan.service";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;

    const result = await rollover(userId);

    if (!result.rolled) {
      if (result.error === "No active plan found") {
        return NextResponse.json(
          { rolled: false, plan: null, error: result.error },
          { status: 404 },
        );
      }
      if (result.reason === "Plan is still active") {
        return NextResponse.json(
          { rolled: false, reason: result.reason, plan: null },
          { status: 409 },
        );
      }
    }

    return NextResponse.json({
      rolled: result.rolled,
      createdCount: result.rolled ? result.createdCount : 0,
      plan: result.rolled ? result.plan : null,
    });
  } catch (error) {
    return jsonRouteError(error, "[PLAN_ROLLOVER_ERROR]");
  }
}
