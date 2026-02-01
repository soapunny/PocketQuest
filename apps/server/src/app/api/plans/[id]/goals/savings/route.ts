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

const MAX_SAVINGS_GOALS_PER_PLAN = 10;

function normalizeId(v: unknown) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function normalizeSavingsName(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeSavingsNameLower(v: unknown) {
  return normalizeSavingsName(v).toLowerCase();
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
        : plan?.totalBudgetLimitMinor ?? null,
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
  { params }: { params: { id: string } }
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
      { status: 500 }
    );
  }
}

// POST /api/plans/[id]/goals/savings - Create or update a single savings goal for a specific plan
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const planId = params.id;

  const body: unknown = await request.json().catch(() => ({}));
  const parsedBody = upsertSavingsGoalRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid request data", details: parsedBody.error.flatten() },
      { status: 400 }
    );
  }

  const user = getAuthUser(request);
  const actorUserId = user?.userId;
  if (!actorUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawId = normalizeId((parsedBody.data as any).id);
  const name = normalizeSavingsName((parsedBody.data as any).name);
  const cleanTarget = Math.max(
    0,
    Math.trunc(Number((parsedBody.data as any).targetMinor) || 0)
  );

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

      // 1) id-based upsert
      if (rawId) {
        const existing = await tx.savingsGoal.findFirst({
          where: { id: rawId, planId },
          select: { id: true },
        });

        if (existing?.id) {
          await tx.savingsGoal.update({
            where: { id: existing.id },
            data: { name, targetMinor: cleanTarget },
          });
        } else {
          const count = await tx.savingsGoal.count({ where: { planId } });
          if (count >= MAX_SAVINGS_GOALS_PER_PLAN) {
            return { kind: "LIMIT" } as const;
          }

          // allow client-provided id (draft creation)
          await tx.savingsGoal.create({
            data: {
              id: rawId,
              planId,
              name,
              targetMinor: cleanTarget,
            } as any,
          });
        }
      } else {
        // 2) name-based upsert (case-insensitive), do NOT delete on target=0 (draft allowed)

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
          const count = await tx.savingsGoal.count({ where: { planId } });
          if (count >= MAX_SAVINGS_GOALS_PER_PLAN) {
            return { kind: "LIMIT" } as const;
          }

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

    if ((updated as any)?.kind === "LIMIT") {
      return NextResponse.json(
        { error: "Savings goals limit reached" },
        { status: 400 }
      );
    }

    const dto = toServerPlanDTO((updated as any).plan);
    return NextResponse.json({ plan: dto }, { status: 200 });
  } catch (error) {
    console.error("Create/update savings goal error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
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
        { status: 400 }
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

    // SYNC mode:
    // - Upsert incoming goals (by id first, otherwise by normalized name)
    // - Delete goals not present in payload
    const existingGoals = await tx.savingsGoal.findMany({
      where: { planId },
      select: { id: true, name: true },
    });
    const existingCount = existingGoals.length;

    const existingById = new Map<string, { id: string; name: string }>();
    const existingByNameLower = new Map<string, { id: string; name: string }>();

    for (const g of existingGoals) {
      existingById.set(g.id, { id: g.id, name: g.name });
      const key = normalizeSavingsNameLower(g.name);
      // Prefer first match if duplicates exist
      if (key && !existingByNameLower.has(key)) {
        existingByNameLower.set(key, { id: g.id, name: g.name });
      }
    }

    // --- LIMIT 계산 (existing + newCreates > 10) ---
    // Requirement explicitly uses existingCount (before sync) + creates count.
    const simById = new Set(existingGoals.map((g) => g.id));
    const simByNameLower = new Set(
      existingGoals.map((g) => normalizeSavingsNameLower(g.name))
    );
    let creates = 0;

    for (const incoming of parsed.savingsGoals) {
      const id = normalizeId((incoming as any).id);
      const name = normalizeSavingsName((incoming as any).name);
      const nameLower = normalizeSavingsNameLower(name);
      if (!nameLower) continue;

      if (id) {
        if (!simById.has(id)) {
          creates += 1;
          simById.add(id);
        }
      } else {
        if (!simByNameLower.has(nameLower)) {
          creates += 1;
          simByNameLower.add(nameLower);
        }
      }
    }

    if (existingCount + creates > MAX_SAVINGS_GOALS_PER_PLAN) {
      return { kind: "LIMIT" } as const;
    }

    const keepIds = new Set<string>();

    for (const incoming of parsed.savingsGoals) {
      const id = normalizeId((incoming as any).id);
      const name = normalizeSavingsName((incoming as any).name);
      const nameLower = normalizeSavingsNameLower(name);
      const targetMinor = Math.max(
        0,
        Math.trunc(Number((incoming as any).targetMinor) || 0)
      );

      if (!name) {
        return { kind: "BAD_REQUEST", error: "Name is required" } as const;
      }

      // 1) id-based upsert (update or create)
      if (id) {
        const existingForPlan = existingById.get(id);

        if (existingForPlan?.id) {
          const prevLower = normalizeSavingsNameLower(existingForPlan.name);
          const updated = await tx.savingsGoal.update({
            where: { id },
            data: { name, targetMinor },
          });
          keepIds.add(updated.id);
          existingById.set(updated.id, { id: updated.id, name });
          if (prevLower && existingByNameLower.get(prevLower)?.id === id) {
            existingByNameLower.delete(prevLower);
          }
          if (nameLower)
            existingByNameLower.set(nameLower, { id: updated.id, name });
        } else {
          // Guard against updating/stealing a goal belonging to another plan.
          const existingAny = await tx.savingsGoal.findUnique({
            where: { id },
            select: { id: true, planId: true, name: true },
          });
          if (existingAny?.id && existingAny.planId !== planId) {
            return {
              kind: "BAD_REQUEST",
              error: "Invalid savingsGoal id",
            } as const;
          }

          const created = await tx.savingsGoal.create({
            data: { id, planId, name, targetMinor } as any,
          });
          keepIds.add(created.id);
          existingById.set(created.id, { id: created.id, name });
          if (nameLower)
            existingByNameLower.set(nameLower, { id: created.id, name });
        }
        continue;
      }

      // 2) name(lowercase trim) based update-or-create
      const existing = nameLower
        ? existingByNameLower.get(nameLower)
        : undefined;
      if (existing?.id) {
        const prevLower = normalizeSavingsNameLower(existing.name);
        const updated = await tx.savingsGoal.update({
          where: { id: existing.id },
          data: { name, targetMinor },
        });
        keepIds.add(updated.id);
        existingById.set(updated.id, { id: updated.id, name });
        if (prevLower && prevLower !== nameLower) {
          if (existingByNameLower.get(prevLower)?.id === updated.id) {
            existingByNameLower.delete(prevLower);
          }
        }
        if (nameLower)
          existingByNameLower.set(nameLower, { id: updated.id, name });
      } else {
        const created = await tx.savingsGoal.create({
          data: { planId, name, targetMinor },
        });
        keepIds.add(created.id);
        existingById.set(created.id, { id: created.id, name });
        if (nameLower)
          existingByNameLower.set(nameLower, { id: created.id, name });
      }
    }

    // Delete any existing goal not included in payload (true delete)
    await tx.savingsGoal.deleteMany({
      where: { planId, id: { notIn: Array.from(keepIds) } },
    });

    const updated = await tx.plan.findUnique({
      where: { id: planId },
      include: { budgetGoals: true, savingsGoals: true },
    });
    if (!updated) return { kind: "NOT_FOUND" } as const;
    return { kind: "OK", plan: updated } as const;
  });

  if ((result as any)?.kind === "NOT_FOUND") {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  if ((result as any)?.kind === "FORBIDDEN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if ((result as any)?.kind === "LIMIT") {
    return NextResponse.json(
      { error: "Savings goals limit reached" },
      { status: 400 }
    );
  }

  if ((result as any)?.kind === "BAD_REQUEST") {
    return NextResponse.json(
      { error: (result as any).error ?? "Invalid request" },
      { status: 400 }
    );
  }

  const dto = toServerPlanDTO((result as any).plan);
  return NextResponse.json({ plan: dto });
}
