// apps/server/src/app/api/plans/[id]/goals/savings/route.ts

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

const patchSavingsGoalsSchema = z
  .object({
    // NOTE: DEV ONLY. In prod, validate plan belongs to authed user.
    userId: z.string().min(1).optional(),

    // New shape
    savingsGoals: z
      .array(
        z
          .object({
            name: z.string().min(1),
            targetMinor: z.number().int().nonnegative().optional(),
            targetCents: z.number().int().nonnegative().optional(),
          })
          .refine(
            (g) =>
              typeof g.targetMinor === "number" ||
              typeof g.targetCents === "number",
            {
              message:
                "savingsGoals[].targetMinor or savingsGoals[].targetCents is required",
            },
          ),
      )
      .optional(),

    // Legacy shape used by older clients
    goals: z
      .array(
        z
          .object({
            name: z.string().min(1),
            targetCents: z.number().int().nonnegative().optional(),
            targetMinor: z.number().int().nonnegative().optional(),
          })
          .refine(
            (g) =>
              typeof g.targetMinor === "number" ||
              typeof g.targetCents === "number",
            {
              message: "goals[].targetMinor or goals[].targetCents is required",
            },
          ),
      )
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.savingsGoals && !val.goals) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "savingsGoals (or legacy goals) is required",
        path: ["savingsGoals"],
      });
    }
  });

const singleSavingsGoalSchema = z
  .object({
    // Legacy clients may send one goal at a time
    name: z.string().min(1),
    targetMinor: z.number().int().nonnegative().optional(),
    // Legacy field name
    targetCents: z.number().int().nonnegative().optional(),
    // DEV-only fallback
    userId: z.string().min(1).optional(),
  })
  .superRefine((val, ctx) => {
    if (
      typeof val.targetMinor !== "number" &&
      typeof val.targetCents !== "number"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targetMinor or targetCents is required",
        path: ["targetMinor"],
      });
    }
  });

// GET /api/plans/[id]/goals/savings - Get savings goals for a specific plan
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
      select: { id: true, userId: true, savingsGoals: true },
    });

    if (!plan || plan.userId !== actorUserId) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    return NextResponse.json(plan.savingsGoals ?? []);
  } catch (error) {
    console.error("Get savings goals error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST /api/plans/[id]/goals/savings - Create or update a single savings goal for a specific plan
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const planId = params.id;

  const body: unknown = await request.json().catch(() => ({}));
  const parsedBody = singleSavingsGoalSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid request data", details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  const actorUserId = resolveActorUserId(request, parsedBody.data.userId);
  if (!actorUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const name = String(parsedBody.data.name).trim();
  const rawTarget =
    typeof parsedBody.data.targetMinor === "number"
      ? parsedBody.data.targetMinor
      : typeof parsedBody.data.targetCents === "number"
        ? parsedBody.data.targetCents
        : 0;

  const targetMinor = Math.trunc(Number(rawTarget) || 0);

  try {
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      select: { id: true, userId: true },
    });

    if (!plan || plan.userId !== actorUserId) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // If target <= 0, treat as delete for convenience/back-compat
    if (targetMinor <= 0) {
      await prisma.savingsGoal.deleteMany({ where: { planId, name } });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const existing = await prisma.savingsGoal.findFirst({
      where: { planId, name },
      select: { id: true },
    });

    const savingsGoal = existing?.id
      ? await prisma.savingsGoal.update({
          where: { id: existing.id },
          data: { targetMinor },
        })
      : await prisma.savingsGoal.create({
          data: { planId, name, targetMinor },
        });

    return NextResponse.json(savingsGoal, { status: 201 });
  } catch (error) {
    console.error("Create/update savings goal error:", error);
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
  const parsed = patchSavingsGoalsSchema.safeParse(body);
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
    if (plan.userId !== actorUserId) return null;

    // Normalize + dedupe by name (last write wins)
    const byName = new Map<string, number>();
    const incoming = parsed.data.savingsGoals ?? parsed.data.goals ?? [];
    for (const g of incoming) {
      const name = String(g.name ?? "").trim();
      const raw = (g.targetMinor ?? g.targetCents ?? 0) as number;
      const targetMinor = Math.max(0, Math.round(Number(raw) || 0));
      if (!name) continue;
      byName.set(name, targetMinor);
    }

    for (const [name, targetMinor] of byName.entries()) {
      if (targetMinor <= 0) {
        await tx.savingsGoal.deleteMany({ where: { planId, name } });
        continue;
      }

      const existing = await tx.savingsGoal.findFirst({
        where: { planId, name },
        select: { id: true },
      });

      if (existing?.id) {
        await tx.savingsGoal.update({
          where: { id: existing.id },
          data: { targetMinor },
        });
      } else {
        await tx.savingsGoal.create({ data: { planId, name, targetMinor } });
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
