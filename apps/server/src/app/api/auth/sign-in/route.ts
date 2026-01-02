import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { z } from "zod";

const signInSchema = z.object({
  provider: z.enum(["google", "kakao"]),
  providerId: z.string(),
  email: z.string().email(),
  name: z.string().min(1),
  profileImageUri: z.string().nullable().optional(),
});

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = signInSchema.parse(body);

    // Find or create user
    // Note: Prisma compound unique constraint naming
    let user = await prisma.user.findUnique({
      where: {
        provider_providerId: {
          provider: data.provider,
          providerId: data.providerId,
        },
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
            provider: data.provider,
            providerId: data.providerId,
            name: data.name,
            profileImageUri: data.profileImageUri || null,
          },
        });
      } else {
        // Create new user
        user = await prisma.user.create({
          data: {
            email: data.email,
            name: data.name,
            profileImageUri: data.profileImageUri || null,
            provider: data.provider,
            providerId: data.providerId,
            // Create default plan
            plans: {
              create: {
                periodType: "WEEKLY",
                periodStartISO: new Date().toISOString().slice(0, 10),
              },
            },
            // Create default character
            character: {
              create: {
                level: 1,
                xp: 0,
              },
            },
          },
        });
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
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        profileImageUri: user.profileImageUri,
        provider: user.provider as "google" | "kakao",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Sign-in error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

