// apps/server/src/app/api/bootstrap/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { buildBootstrapPayload } from "@/lib/bootstrap/buildBootstrapPayload";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const bootstrapQuerySchema = z.object({
  // 대시보드 월 리스트를 몇 개월치 준비할지 (기본 3)
  months: z.string().optional(),
  // 월 리스트 기준 월 (YYYY-MM). 없으면 현재 월 기준
  at: z.string().optional(),
});

async function handleBootstrap(request: NextRequest) {
  const authed = await getAuthUser(request);
  const supabaseUserId = authed?.supabaseUserId;

  if (!supabaseUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Map Supabase UUID -> internal User.id (cuid)
  const internal = await prisma.user.findUnique({
    where: { supabaseUserId },
    select: { id: true },
  });

  if (!internal?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = internal.id;

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
