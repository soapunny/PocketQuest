// apps/server/src/app/api/bootstrap/route.ts

// apps/server/src/app/api/bootstrap/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { buildBootstrapPayload } from "@/lib/bootstrap/buildBootstrapPayload";
import { z } from "zod";

const bootstrapQuerySchema = z.object({
  // 대시보드 월 리스트를 몇 개월치 준비할지 (기본 3)
  months: z.string().optional(),
  // 월 리스트 기준 월 (YYYY-MM). 없으면 현재 월 기준
  at: z.string().optional(),
});

async function handleBootstrap(request: NextRequest) {
  const authed = getAuthUser(request);
  const userId = authed?.userId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsedQuery = bootstrapQuerySchema.safeParse({
    months: url.searchParams.get("months") ?? undefined,
    at: url.searchParams.get("at") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsedQuery.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const payload = await buildBootstrapPayload({
      userId,
      months: parsedQuery.data.months,
      at: parsedQuery.data.at,
      now: new Date(),
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Bootstrap error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleBootstrap(request);
}

export async function GET(request: NextRequest) {
  return handleBootstrap(request);
}
