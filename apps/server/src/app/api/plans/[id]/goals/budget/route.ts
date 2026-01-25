// apps/server/src/app/api/plans/[id]/goals/budget/route.ts

import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function resolveActorUserId(
  request: NextRequest,
  bodyUserId?: string,
): string | null {
  const user = getAuthUser(request);
  if (user?.userId) return user.userId;
  return bodyUserId && bodyUserId.trim() ? bodyUserId.trim() : null;
}

const patchBudgetGoalsSchema = z
  .object({
    // NOTE: DEV ONLY. In prod, validate plan belongs to authed user.
    userId: z.string().min(1).optional(),

    // New shape
    budgetGoals: z
      .array(
        z.object({
          category: z.string().min(1),
          limitMinor: z.number().int().optional(),
          // Legacy field name
          limitCents: z.number().int().optional(),
        }),
      )
      .optional(),

    // Legacy shape used by older clients
    goals: z
      .array(
        z.object({
          category: z.string().min(1),
          // Legacy field name
          limitCents: z.number().int().optional(),
          // Some older code may already send limitMinor
          limitMinor: z.number().int().optional(),
        }),
      )
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.budgetGoals && !val.goals) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "budgetGoals (or legacy goals) is required",
        path: ["budgetGoals"],
      });
    }
  });

const singleBudgetGoalSchema = z.object({
  // Legacy clients may send one goal at a time
  category: z.string().min(1),
  limitMinor: z.number().int().optional(),
  // Legacy field name
  limitCents: z.number().int().optional(),
});

// GET /api/plans/[id]/goals/budget - Get budget goals for a specific plan
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const planId = params.id;

  const actorUserId = resolveActorUserId(request);
  if (!actorUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      select: { id: true, userId: true, budgetGoals: true },
    });

    if (!plan || plan.userId !== actorUserId) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    return NextResponse.json(plan.budgetGoals ?? []);
  } catch (error) {
    console.error("Get budget goals error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST /api/plans/[id]/goals/budget - Create or update a single budget goal for a specific plan
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const planId = params.id;

  const body: unknown = await request.json().catch(() => ({}));
  const parsedBody = singleBudgetGoalSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid request data", details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  const actorUserId = resolveActorUserId(request, (body as any)?.userId);
  if (!actorUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const category = String(parsedBody.data.category).trim();
  const rawLimit =
    typeof parsedBody.data.limitMinor === "number"
      ? parsedBody.data.limitMinor
      : typeof parsedBody.data.limitCents === "number"
        ? parsedBody.data.limitCents
        : 0;

  const limitMinor = Math.trunc(Number(rawLimit) || 0);

  try {
    // Ensure plan exists + ownership
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      select: { id: true, userId: true },
    });

    if (!plan || plan.userId !== actorUserId) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // If limit <= 0, treat as delete for back-compat convenience
    if (limitMinor <= 0) {
      await prisma.budgetGoal.deleteMany({ where: { planId, category } });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const budgetGoal = await prisma.budgetGoal.upsert({
      where: {
        planId_category: {
          planId,
          category,
        },
      },
      update: { limitMinor },
      create: { planId, category, limitMinor },
    });

    return NextResponse.json(budgetGoal, { status: 201 });
  } catch (error) {
    console.error("Upsert budget goal error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const planId = params.id;

  const body: unknown = await request.json().catch(() => ({}));
  const parsed = patchBudgetGoalsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const actorUserId = resolveActorUserId(request, parsed.data.userId);
  if (!actorUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await prisma.$transaction(async (tx: TxClient) => {
    const plan = await tx.plan.findUnique({
      where: { id: planId },
      select: { id: true, userId: true },
    });
    if (!plan) return null;

    if (plan.userId !== actorUserId) {
      return null;
    }

    const incoming = parsed.data.budgetGoals ?? parsed.data.goals ?? [];

    // Normalize + dedupe by category (last write wins)
    const byCategory = new Map<string, number>();
    for (const g of incoming) {
      const category = String(g.category ?? "").trim();

      const rawLimit =
        typeof (g as any).limitMinor === "number"
          ? (g as any).limitMinor
          : typeof (g as any).limitCents === "number"
            ? (g as any).limitCents
            : 0;

      const limitMinor = Math.max(0, Math.trunc(Number(rawLimit) || 0));

      if (!category) continue;
      byCategory.set(category, limitMinor);
    }

    for (const [category, limitMinor] of byCategory.entries()) {
      if (limitMinor <= 0) {
        await tx.budgetGoal.deleteMany({ where: { planId, category } });
        continue;
      }

      const existing = await tx.budgetGoal.findFirst({
        where: { planId, category },
        select: { id: true },
      });

      if (existing?.id) {
        await tx.budgetGoal.update({
          where: { id: existing.id },
          data: { limitMinor },
        });
      } else {
        await tx.budgetGoal.create({ data: { planId, category, limitMinor } });
      }
    }

    return tx.plan.findUnique({
      where: { id: planId },
      include: { budgetGoals: true, savingsGoals: true },
    });
  });

  if (!result)
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  return NextResponse.json({ plan: result });
}
