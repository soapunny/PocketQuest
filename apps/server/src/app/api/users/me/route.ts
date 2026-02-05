// apps/server/src/app/api/users/me/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET /api/users/me - Get current user profile
export async function GET(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userData = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        email: true,
        name: true,
        profileImageUri: true,
        provider: true,
        cashflowCarryoverEnabled: true,
        cashflowCarryoverMode: true,
      },
    });

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(userData);
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/users/me - Update current user profile
export async function PATCH(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      name?: unknown;
      profileImageUri?: unknown;
      cashflowCarryoverEnabled?: unknown;
      cashflowCarryoverMode?: unknown;
    };

    // Sanitize & validate inputs
    let name: string | null = null;
    if (body.name !== undefined) {
      if (typeof body.name !== "string") {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 });
      }
      const trimmed = body.name.trim();
      if (trimmed.length === 0 || trimmed.length > 30) {
        return NextResponse.json(
          { error: "Name must be between 1 and 30 characters" },
          { status: 400 }
        );
      }
      name = trimmed;
    }

    let profileImageUri: string | null = null;
    if (body.profileImageUri !== undefined) {
      if (typeof body.profileImageUri !== "string") {
        return NextResponse.json(
          { error: "Invalid profileImageUri" },
          { status: 400 }
        );
      }
      const trimmed = body.profileImageUri.trim();
      if (trimmed.length > 0) {
        try {
          const url = new URL(trimmed);
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            throw new Error("Invalid protocol");
          }
          profileImageUri = trimmed;
        } catch {
          return NextResponse.json(
            { error: "profileImageUri must be a valid URL" },
            { status: 400 }
          );
        }
      }
    }

    let cashflowCarryoverEnabled: boolean | null = null;
    if (body.cashflowCarryoverEnabled !== undefined) {
      if (typeof body.cashflowCarryoverEnabled !== "boolean") {
        return NextResponse.json(
          { error: "Invalid cashflowCarryoverEnabled" },
          { status: 400 }
        );
      }
      cashflowCarryoverEnabled = body.cashflowCarryoverEnabled;
    }

    let cashflowCarryoverMode: "ROLLING" | null = null;
    if (body.cashflowCarryoverMode !== undefined) {
      const v = String(body.cashflowCarryoverMode || "").trim().toUpperCase();
      if (v !== "ROLLING") {
        return NextResponse.json(
          { error: "Invalid cashflowCarryoverMode" },
          { status: 400 }
        );
      }
      cashflowCarryoverMode = "ROLLING";
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: user.userId },
    });

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = await prisma.user.update({
      where: { id: user.userId },
      data: {
        ...(name !== null && { name }),
        ...(profileImageUri !== null && { profileImageUri }),
        ...(cashflowCarryoverEnabled !== null && {
          cashflowCarryoverEnabled,
        }),
        ...(cashflowCarryoverMode !== null && {
          cashflowCarryoverMode,
        }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        profileImageUri: true,
        provider: true,
        cashflowCarryoverEnabled: true,
        cashflowCarryoverMode: true,
      },
    });

    return NextResponse.json(userData);
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
