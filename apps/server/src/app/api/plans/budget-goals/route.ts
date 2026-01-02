import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { z } from "zod";

const budgetGoalSchema = z.object({
  category: z.string(),
  limitCents: z.number().int(),
});

// GET /api/plans/budget-goals - Get all budget goals
export async function GET(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const plan = await prisma.plan.findUnique({
      where: { userId: user.userId },
      include: { budgetGoals: true },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    return NextResponse.json(plan.budgetGoals);
  } catch (error) {
    console.error("Get budget goals error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/plans/budget-goals - Create or update budget goal
export async function POST(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = budgetGoalSchema.parse(body);

    const plan = await prisma.plan.findUnique({
      where: { userId: user.userId },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const budgetGoal = await prisma.budgetGoal.upsert({
      where: {
        planId_category: {
          planId: plan.id,
          category: data.category,
        },
      },
      update: {
        limitCents: data.limitCents,
      },
      create: {
        planId: plan.id,
        category: data.category,
        limitCents: data.limitCents,
      },
    });

    return NextResponse.json(budgetGoal, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Upsert budget goal error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

