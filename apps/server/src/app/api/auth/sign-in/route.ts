//  apps/server/src/app/api/auth/sign-in/route.ts

import { NextRequest, NextResponse } from "next/server";
import { signInWithSupabaseAccessToken } from "@/domain/auth/auth.service";
import { extractBearerToken } from "@/lib/auth";
import { Prisma } from "@prisma/client";

// 모바일에서 로그인 직후 Supabase access token을 받아서 여기 서버로 보냄
export async function POST(request: NextRequest) {
  try {
    // 1) Supabase access token 추출
    const accessToken = extractBearerToken(request);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Missing Authorization: Bearer <token>" },
        { status: 401 },
      );
    }

    const result = await signInWithSupabaseAccessToken(accessToken);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Sign-in error:", error);

    if (
      error?.message === "Account already exists with different login method"
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "Resource already exists" },
          { status: 409 },
        );
      }
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
