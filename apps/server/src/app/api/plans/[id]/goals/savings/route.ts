// apps/server/src/app/api/plans/[id]/goals/savings/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import {
  patchSavingsGoalsRequestSchema,
  serverPlanDTOSchema,
  upsertSavingsGoalRequestSchema,
} from "../../../../../../../../../packages/shared/src/plans/types";
import type {
  PatchSavingsGoalsRequestDTO,
  ServerPlanDTO,
} from "../../../../../../../../../packages/shared/src/plans/types";

import { ZodError } from "zod";

function normalizeSavingsName(v: unknown) {
  return String(v ?? "").trim();
}

function nameWhereInsensitive(planId: string, name: string) {
  return {
    planId,
    name: { equals: name, mode: "insensitive" as const },
  };
}

function toServerPlanDTO(plan: any): ServerPlanDTO {
  const timeZone =
    typeof plan?.timeZone === "string" && plan.timeZone.trim()
      ? plan.timeZone.trim()
      : "UTC";

  const dto: ServerPlanDTO = {
    id: String(plan.id),
    language: plan?.language ?? null,
    periodType: plan?.periodType,
    periodStartUTC:
      plan?.periodStart instanceof Date
        ? plan.periodStart.toISOString()
        : undefined,
    periodEndUTC:
      plan?.periodEnd instanceof Date
        ? plan.periodEnd.toISOString()
        : undefined,
    periodAnchorUTC:
      plan?.periodAnchor instanceof Date
        ? plan.periodAnchor.toISOString()
        : undefined,
    timeZone,
    totalBudgetLimitMinor:
      typeof plan?.totalBudgetLimitMinor === "number"
        ? plan.totalBudgetLimitMinor
        : (plan?.totalBudgetLimitMinor ?? null),
    currency: plan?.currency,
    homeCurrency: plan?.currency,
    displayCurrency: plan?.currency,
    budgetGoals: Array.isArray(plan?.budgetGoals)
      ? plan.budgetGoals.map((g: any) => ({
          id: g.id ?? null,
          category: String(g.category ?? "Other"),
          limitMinor: typeof g.limitMinor === "number" ? g.limitMinor : null,
        }))
      : null,
    savingsGoals: Array.isArray(plan?.savingsGoals)
      ? plan.savingsGoals.map((g: any) => ({
          id: g.id ?? null,
          name: String(g.name ?? "Other").trim(),
          targetMinor: typeof g.targetMinor === "number" ? g.targetMinor : null,
        }))
      : null,
  };

  return serverPlanDTOSchema.parse(dto);
}

// GET /api/plans/[id]/goals/savings - Get savings goals for a specific plan
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const planId = params.id;

  const user = getAuthUser(request);
  const actorUserId = user?.userId;
  if (!actorUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      select: { id: true, userId: true, savingsGoals: true },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if (plan.userId !== actorUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  const parsedBody = upsertSavingsGoalRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid request data", details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  const user = getAuthUser(request);
  const actorUserId = user?.userId;
  if (!actorUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const name = normalizeSavingsName(parsedBody.data.name);
  const targetMinor = Math.trunc(Number(parsedBody.data.targetMinor) || 0);

  try {
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const plan = await tx.plan.findUnique({
        where: { id: planId },
        select: { id: true, userId: true },
      });

      if (!plan) return { kind: "NOT_FOUND" } as const;
      if (plan.userId !== actorUserId) return { kind: "FORBIDDEN" } as const;

      const cleanTarget = Math.max(0, targetMinor);

      if (cleanTarget <= 0) {
        await tx.savingsGoal.deleteMany({
          where: nameWhereInsensitive(planId, name),
        });
      } else {
        const matches = await tx.savingsGoal.findMany({
          where: nameWhereInsensitive(planId, name),
          select: { id: true },
          orderBy: { id: "asc" },
        });

        const keep = matches[0];
        const extras = matches.slice(1);

        if (extras.length) {
          await tx.savingsGoal.deleteMany({
            where: { id: { in: extras.map((x) => x.id) } },
          });
        }

        if (keep?.id) {
          await tx.savingsGoal.update({
            where: { id: keep.id },
            data: { targetMinor: cleanTarget, name },
          });
        } else {
          await tx.savingsGoal.create({
            data: { planId, name, targetMinor: cleanTarget },
          });
        }
      }

      const full = await tx.plan.findUnique({
        where: { id: planId },
        include: { budgetGoals: true, savingsGoals: true },
      });

      if (!full) return { kind: "NOT_FOUND" } as const;
      return { kind: "OK", plan: full } as const;
    });

    if ((updated as any)?.kind === "NOT_FOUND") {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if ((updated as any)?.kind === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const dto = toServerPlanDTO((updated as any).plan);
    return NextResponse.json({ plan: dto }, { status: 200 });
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
  let parsed: PatchSavingsGoalsRequestDTO;
  try {
    parsed = patchSavingsGoalsRequestSchema.parse(body);
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid body", details: e.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const user = getAuthUser(request);
  const actorUserId = user?.userId;
  if (!actorUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const plan = await tx.plan.findUnique({
      where: { id: planId },
      select: { id: true, userId: true },
    });
    if (!plan) return { kind: "NOT_FOUND" } as const;
    if (plan.userId !== actorUserId) return { kind: "FORBIDDEN" } as const;

    // Normalize + dedupe by name (last write wins)
    const byName = new Map<string, number>();
    const incoming = parsed.savingsGoals;
    for (const g of incoming) {
      const name = normalizeSavingsName(g.name);
      const targetMinor = Math.max(
        0,
        Math.trunc(Number((g as any).targetMinor) || 0),
      );
      if (!name) continue;
      byName.set(name, targetMinor);
    }

    for (const [name, targetMinor] of byName.entries()) {
      if (!name) continue;

      if (targetMinor <= 0) {
        await tx.savingsGoal.deleteMany({
          where: nameWhereInsensitive(planId, name),
        });
        continue;
      }

      const matches = await tx.savingsGoal.findMany({
        where: nameWhereInsensitive(planId, name),
        select: { id: true },
        orderBy: { id: "asc" },
      });

      const keep = matches[0];
      const extras = matches.slice(1);

      if (extras.length) {
        await tx.savingsGoal.deleteMany({
          where: { id: { in: extras.map((x) => x.id) } },
        });
      }

      if (keep?.id) {
        await tx.savingsGoal.update({
          where: { id: keep.id },
          data: { targetMinor, name },
        });
      } else {
        await tx.savingsGoal.create({ data: { planId, name, targetMinor } });
      }
    }

    const updated = await tx.plan.findUnique({
      where: { id: planId },
      include: { budgetGoals: true, savingsGoals: true },
    });
    if (!updated) return { kind: "NOT_FOUND" };
    return { kind: "OK", plan: updated } as const;
  });

  if ((result as any)?.kind === "NOT_FOUND") {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  if ((result as any)?.kind === "FORBIDDEN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dto = toServerPlanDTO((result as any).plan);
  return NextResponse.json({ plan: dto });
}
