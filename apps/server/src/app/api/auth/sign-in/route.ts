import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { z } from "zod";

const JWT_SECRET: string = (() => {
  const v = process.env.JWT_SECRET;
  if (!v) throw new Error("JWT_SECRET is required (production)");
  return v;
})();

const signInSchema = z.object({
  provider: z.enum(["google", "kakao"]),
  providerId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  profileImageUri: z.string().nullable().optional(),
});

function toPrismaProvider(p: "google" | "kakao") {
  // Prisma enum is uppercase (e.g. GOOGLE/KAKAO)
  return p.toUpperCase() as "GOOGLE" | "KAKAO";
}

function toClientProvider(p: any): "google" | "kakao" {
  return String(p).toUpperCase() === "KAKAO" ? "kakao" : "google";
}

async function ensureActivePlan(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new Error("User not found");

  if (u.activePlanId) return u;

  const plan = await prisma.plan.create({
    data: {
      userId: u.id,
      periodType: "WEEKLY",
      periodStart: new Date(),
      timeZone: u.timeZone,
      currency: u.currency,
      language: u.language,
    },
  });

  return prisma.user.update({
    where: { id: u.id },
    data: { activePlanId: plan.id },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = signInSchema.parse(body);

    const prismaProvider = toPrismaProvider(data.provider);

    // Find or create user
    // Use findFirst to avoid depending on a specific compound-unique name.
    let user = await prisma.user.findFirst({
      where: {
        provider: prismaProvider,
        providerId: data.providerId,
      },
    });

    if (!user) {
      // Check if user exists with this email (different provider)
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email },
      });

      if (existingUser) {
        // Update existing user with new provider info
        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            provider: prismaProvider,
            providerId: data.providerId,
            name: data.name,
            profileImageUri: data.profileImageUri || null,
          },
        });
        user = await ensureActivePlan(user.id);
      } else {
        // Create new user
        user = await prisma.user.create({
          data: {
            email: data.email,
            name: data.name,
            profileImageUri: data.profileImageUri || null,
            provider: prismaProvider,
            providerId: data.providerId,
          },
        });
        user = await ensureActivePlan(user.id);
      }
    } else {
      // Update user info
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: data.name,
          profileImageUri: data.profileImageUri || null,
        },
      });
      user = await ensureActivePlan(user.id);
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: "30d" },
    );

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        profileImageUri: user.profileImageUri,
        provider: toClientProvider(user.provider),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 },
      );
    }

    console.error("Sign-in error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
