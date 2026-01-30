// apps/server/src/app/api/plans/[id]/goals/budget/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import {
  patchBudgetGoalsRequestSchema,
  serverPlanDTOSchema,
  upsertBudgetGoalRequestSchema,
} from "../../../../../../../../../packages/shared/src/plans/types";
import type {
  PatchBudgetGoalsRequestDTO,
  ServerPlanDTO,
} from "../../../../../../../../../packages/shared/src/plans/types";
import { ZodError } from "zod";

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function requireActorUserId(request: NextRequest): string | null {
  const user = getAuthUser(request);
  return user?.userId ?? null;
}

function normalizeCategoryKey(v: unknown) {
  return (
    String(v ?? "uncategorized")
      .trim()
      .toLowerCase() || "uncategorized"
  );
}

function toServerPlanDTO(plan: any): ServerPlanDTO {
  const timeZone =
    typeof plan?.timeZone === "string" && plan.timeZone.trim()
      ? plan.timeZone.trim()
      : "UTC";

  const toFiniteNumberOrNull = (v: any): number | null => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "bigint") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    if (typeof v === "string") {
      const cleaned = v.trim().replace(/[,\s]/g, "");
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    }
    try {
      // Decimal-like objects (e.g., Prisma.Decimal) often stringify cleanly
      const s = String(v?.toString?.() ?? "")
        .trim()
        .replace(/[,\s]/g, "");
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  };

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
    totalBudgetLimitMinor: toFiniteNumberOrNull(plan?.totalBudgetLimitMinor),
    currency: plan?.currency,
    homeCurrency: plan?.currency,
    displayCurrency: plan?.currency,
    budgetGoals: Array.isArray(plan?.budgetGoals)
      ? plan.budgetGoals.map((g: any) => ({
          id: g.id ?? null,
          category: String(g.category ?? "Other")
            .trim()
            .toLowerCase(),
          limitMinor: toFiniteNumberOrNull(g.limitMinor),
        }))
      : null,
    savingsGoals: Array.isArray(plan?.savingsGoals)
      ? plan.savingsGoals.map((g: any) => ({
          id: g.id ?? null,
          name: String(g.name ?? "Other"),
          targetMinor: toFiniteNumberOrNull(g.targetMinor),
        }))
      : null,
  };

  return serverPlanDTOSchema.parse(dto);
}

// GET /api/plans/[id]/goals/budget - Get budget goals for a specific plan
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const planId = params.id;

  const actorUserId = requireActorUserId(request);
  if (!actorUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      select: { id: true, userId: true, budgetGoals: true },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if (plan.userId !== actorUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  const parsedBody = upsertBudgetGoalRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid request data", details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  const actorUserId = requireActorUserId(request);
  if (!actorUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const categoryKey = normalizeCategoryKey(parsedBody.data.category);
  const limitMinor = Math.trunc(Number(parsedBody.data.limitMinor) || 0);

  try {
    // Ensure plan exists + ownership
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      select: { id: true, userId: true },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if (plan.userId !== actorUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // If limit <= 0, treat as delete for back-compat convenience
    if (limitMinor <= 0) {
      await prisma.budgetGoal.deleteMany({
        where: {
          planId,
          category: { equals: categoryKey, mode: "insensitive" },
        },
      });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const matches = await prisma.budgetGoal.findMany({
      where: {
        planId,
        category: { equals: categoryKey, mode: "insensitive" },
      },
      select: { id: true, category: true },
      orderBy: { id: "asc" },
    });

    const keep = matches[0];
    const extras = matches.slice(1);

    if (extras.length) {
      await prisma.budgetGoal.deleteMany({
        where: { id: { in: extras.map((x) => x.id) } },
      });
    }

    if (keep?.id) {
      await prisma.budgetGoal.update({
        where: { id: keep.id },
        data: { limitMinor, category: categoryKey },
      });
    } else {
      await prisma.budgetGoal.create({
        data: { planId, category: categoryKey, limitMinor },
      });
    }

    const updated = await prisma.plan.findUnique({
      where: { id: planId },
      include: { budgetGoals: true, savingsGoals: true },
    });

    if (!updated) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const dto = toServerPlanDTO(updated);
    return NextResponse.json({ plan: dto }, { status: 201 });
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
  let parsed: PatchBudgetGoalsRequestDTO;
  try {
    parsed = patchBudgetGoalsRequestSchema.parse(body);
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid body", details: e.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const actorUserId = requireActorUserId(request);
  if (!actorUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await prisma.$transaction(async (tx: TxClient) => {
      const plan = await tx.plan.findUnique({
        where: { id: planId },
        select: { id: true, userId: true },
      });
      if (!plan) return { kind: "NOT_FOUND" } as const;

      if (plan.userId !== actorUserId) {
        return { kind: "FORBIDDEN" } as const;
      }

      const incoming = parsed.budgetGoals;

      // Normalize + dedupe by category (last write wins)
      const byCategory = new Map<string, number>();
      for (const g of incoming) {
        const category = normalizeCategoryKey(g.category);
        const limitMinor = Math.max(
          0,
          Math.trunc(Number((g as any).limitMinor) || 0),
        );
        if (!category) continue;
        byCategory.set(category, limitMinor);
      }

      const ops: Promise<unknown>[] = [];
      for (const [categoryKey, limitMinor] of byCategory.entries()) {
        if (limitMinor <= 0) {
          ops.push(
            tx.budgetGoal.deleteMany({
              where: {
                planId,
                category: { equals: categoryKey, mode: "insensitive" },
              },
            }),
          );
          continue;
        }

        ops.push(
          (async () => {
            const matches = await tx.budgetGoal.findMany({
              where: {
                planId,
                category: { equals: categoryKey, mode: "insensitive" },
              },
              select: { id: true },
              orderBy: { id: "asc" },
            });

            const keep = matches[0];
            const extras = matches.slice(1);

            if (extras.length) {
              await tx.budgetGoal.deleteMany({
                where: { id: { in: extras.map((x) => x.id) } },
              });
            }

            if (keep?.id) {
              await tx.budgetGoal.update({
                where: { id: keep.id },
                data: { limitMinor, category: categoryKey },
              });
              return;
            }

            await tx.budgetGoal.create({
              data: { planId, category: categoryKey, limitMinor },
            });
          })(),
        );
      }

      await Promise.all(ops);

      const updated = await tx.plan.findUnique({
        where: { id: planId },
        include: { budgetGoals: true, savingsGoals: true },
      });

      return { kind: "OK", plan: updated } as const;
    });

    if ((result as any)?.kind === "NOT_FOUND") {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if ((result as any)?.kind === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const plan = (result as any).plan;
    const dto = toServerPlanDTO(plan);
    return NextResponse.json({ plan: dto });
  } catch (error) {
    console.error("Patch budget goals error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
