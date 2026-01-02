import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET /api/plans - Get user's plan
export async function GET(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const plan = await prisma.plan.findUnique({
      where: { userId: user.userId },
      include: {
        budgetGoals: true,
        savingsGoals: true,
      },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    return NextResponse.json(plan);
  } catch (error) {
    console.error("Get plan error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/plans - Update user's plan
export async function PATCH(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const plan = await prisma.plan.update({
      where: { userId: user.userId },
      data: {
        periodType: body.periodType,
        periodAnchorISO: body.periodAnchorISO,
        periodStartISO: body.periodStartISO,
        homeCurrency: body.homeCurrency,
        displayCurrency: body.displayCurrency,
        advancedCurrencyMode: body.advancedCurrencyMode,
        language: body.language,
        totalBudgetLimitCents: body.totalBudgetLimitCents,
      },
      include: {
        budgetGoals: true,
        savingsGoals: true,
      },
    });

    return NextResponse.json(plan);
  } catch (error) {
    console.error("Update plan error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

