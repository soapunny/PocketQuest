import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { z } from "zod";

const savingsGoalSchema = z.object({
  name: z.string(),
  targetCents: z.number().int(),
});

// GET /api/plans/savings-goals - Get all savings goals
export async function GET(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const plan = await prisma.plan.findUnique({
      where: { userId: user.userId },
      include: { savingsGoals: true },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    return NextResponse.json(plan.savingsGoals);
  } catch (error) {
    console.error("Get savings goals error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/plans/savings-goals - Create savings goal
export async function POST(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = savingsGoalSchema.parse(body);

    const plan = await prisma.plan.findUnique({
      where: { userId: user.userId },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const savingsGoal = await prisma.savingsGoal.create({
      data: {
        planId: plan.id,
        name: data.name,
        targetCents: data.targetCents,
      },
    });

    return NextResponse.json(savingsGoal, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Create savings goal error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/plans/savings-goals/[id] - Delete savings goal
export async function DELETE(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    const plan = await prisma.plan.findUnique({
      where: { userId: user.userId },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // Verify savings goal belongs to user's plan
    const savingsGoal = await prisma.savingsGoal.findFirst({
      where: {
        id,
        planId: plan.id,
      },
    });

    if (!savingsGoal) {
      return NextResponse.json({ error: "Savings goal not found" }, { status: 404 });
    }

    await prisma.savingsGoal.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete savings goal error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

