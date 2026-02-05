import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

// GET /api/character - Get user's character
export async function GET(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // NOTE: Character model/table is not part of the Prisma schema yet.
    // Keep this endpoint as a placeholder so TypeScript builds pass.
    return NextResponse.json(
      { error: "Not implemented" },
      { status: 501 }
    );
  } catch (error) {
    console.error("Get character error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

