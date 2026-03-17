// apps/server/src/domain/plan/plan.repository.ts
// Prisma access only. No business logic.

import { CurrencyCode, LanguageCode, PeriodType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { prismaHttpGuard } from "@/lib/prisma/prismaErrors";
import { ensureActivePlan } from "@/lib/plan/activePlan";

export type PlanTxClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

const PLAN_INCLUDE = { budgetGoals: true, savingsGoals: true } as const;

export async function findUserForPlanPrefs(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      timeZone: true,
      activePlanId: true,
      currency: true,
      language: true,
    },
  });
}

export async function findPlanByUniqueKey(
  userId: string,
  periodType: PeriodType,
  periodStart: Date,
) {
  return prisma.plan.findUnique({
    where: {
      userId_periodType_periodStart: { userId, periodType, periodStart },
    },
    include: PLAN_INCLUDE,
  });
}

export async function findPlanByIdWithGoals(planId: string) {
  return prisma.plan.findUnique({
    where: { id: planId },
    include: PLAN_INCLUDE,
  });
}

export async function findPlanExists(planId: string) {
  return prisma.plan.findUnique({
    where: { id: planId },
    select: { id: true },
  });
}

export async function findActivePlanWithGoals(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activePlanId: true },
  });
  if (!user?.activePlanId) return null;

  return prisma.plan.findUnique({
    where: { id: user.activePlanId },
    include: PLAN_INCLUDE,
  });
}

/**
 * Ensures user has an active plan (creates one if missing).
 * Used by switch-currency; keeps Prisma access in repository.
 */
export async function ensureActivePlanWithGoals(userId: string) {
  return prismaHttpGuard(() => ensureActivePlan(prisma, userId));
}

export async function findLatestPlanWithGoals(userId: string) {
  return prisma.plan.findFirst({
    where: { userId },
    orderBy: { periodStart: "desc" },
    include: PLAN_INCLUDE,
  });
}

export async function findPlansByStarts(
  userId: string,
  periodType: PeriodType,
  periodStarts: Date[],
) {
  if (periodStarts.length === 0) return [];

  return prisma.plan.findMany({
    where: {
      userId,
      periodType,
      periodStart: { in: periodStarts },
    },
    orderBy: { periodStart: "desc" },
    include: PLAN_INCLUDE,
  });
}

export async function setUserActivePlanId(userId: string, planId: string) {
  return prismaHttpGuard(() =>
    prisma.user.update({
    where: { id: userId },
    data: { activePlanId: planId },
  }),
  );
}

export type PlanUpsertCreateData = {
  userId: string;
  periodType: PeriodType;
  periodStart: Date;
  periodEnd: Date;
  periodAnchor?: Date | null;
  timeZone: string;
  currency: CurrencyCode;
  language: LanguageCode;
  totalBudgetLimitMinor: number;
};

export type PlanUpsertUpdateData = {
  periodEnd: Date;
  periodAnchor?: Date | null;
  timeZone?: string;
  currency?: CurrencyCode;
  language?: LanguageCode;
  totalBudgetLimitMinor?: number;
};

export async function upsertPlan(
  userId: string,
  periodType: PeriodType,
  periodStart: Date,
  createData: PlanUpsertCreateData,
  updateData: PlanUpsertUpdateData,
) {
  return prismaHttpGuard(() =>
    prisma.plan.upsert({
    where: {
      userId_periodType_periodStart: { userId, periodType, periodStart },
    },
    create: createData,
    update: updateData,
    include: PLAN_INCLUDE,
  }),
  );
}

export async function findPlanForOwnership(planId: string) {
  return prisma.plan.findUnique({
    where: { id: planId },
    select: { id: true, userId: true },
  });
}

export async function findPlanWithBudgetGoals(planId: string) {
  return prisma.plan.findUnique({
    where: { id: planId },
    select: { id: true, userId: true, budgetGoals: true },
  });
}

export async function findPlanWithSavingsGoals(planId: string) {
  return prisma.plan.findUnique({
    where: { id: planId },
    select: { id: true, userId: true, savingsGoals: true },
  });
}

// Budget goal persistence (used inside transactions)
export async function deleteBudgetGoalsByCategory(
  tx: PlanTxClient,
  planId: string,
  categoryKey: string,
) {
  return tx.budgetGoal.deleteMany({
    where: {
      planId,
      category: { equals: categoryKey, mode: "insensitive" },
    },
  });
}

export async function findBudgetGoalsByCategory(
  tx: PlanTxClient,
  planId: string,
  categoryKey: string,
) {
  return tx.budgetGoal.findMany({
    where: {
      planId,
      category: { equals: categoryKey, mode: "insensitive" },
    },
    select: { id: true, category: true },
    orderBy: { id: "asc" },
  });
}

export async function updateBudgetGoal(
  tx: PlanTxClient,
  id: string,
  data: { limitMinor: number; category: string },
) {
  return tx.budgetGoal.update({
    where: { id },
    data,
  });
}

export async function createBudgetGoal(
  tx: PlanTxClient,
  data: { planId: string; category: string; limitMinor: number },
) {
  return tx.budgetGoal.create({ data });
}

export async function deleteBudgetGoalExtras(
  tx: PlanTxClient,
  ids: string[],
) {
  if (ids.length === 0) return;
  return tx.budgetGoal.deleteMany({ where: { id: { in: ids } } });
}

// Savings goal persistence (used inside transactions)
export async function findSavingsGoalsByName(
  tx: PlanTxClient,
  planId: string,
  name: string,
) {
  return tx.savingsGoal.findMany({
    where: {
      planId,
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
}

export async function findSavingsGoalById(
  tx: PlanTxClient,
  id: string,
  planId: string,
) {
  return tx.savingsGoal.findFirst({
    where: { id, planId },
    select: { id: true },
  });
}

export async function findSavingsGoalByIdAny(tx: PlanTxClient, id: string) {
  return tx.savingsGoal.findUnique({
    where: { id },
    select: { id: true, planId: true, name: true },
  });
}

export async function countSavingsGoals(tx: PlanTxClient, planId: string) {
  return tx.savingsGoal.count({ where: { planId } });
}

export async function updateSavingsGoal(
  tx: PlanTxClient,
  id: string,
  data: { name: string; targetMinor: number },
) {
  return tx.savingsGoal.update({
    where: { id },
    data,
  });
}

export async function createSavingsGoal(
  tx: PlanTxClient,
  data: {
    planId: string;
    name: string;
    targetMinor: number;
    id?: string;
  },
) {
  return tx.savingsGoal.create({
    data:
      data.id != null
        ? { planId: data.planId, name: data.name, targetMinor: data.targetMinor, id: data.id }
        : { planId: data.planId, name: data.name, targetMinor: data.targetMinor },
  });
}

export async function deleteSavingsGoalExtras(
  tx: PlanTxClient,
  planId: string,
  ids: string[],
) {
  if (ids.length === 0) return;
  return tx.savingsGoal.deleteMany({
    where: { planId, id: { in: ids } },
  });
}

export async function deleteSavingsGoalsNotIn(
  tx: PlanTxClient,
  planId: string,
  keepIds: string[],
) {
  return tx.savingsGoal.deleteMany({
    where: { planId, id: { notIn: keepIds } },
  });
}

export async function findSavingsGoalsForPlan(
  tx: PlanTxClient,
  planId: string,
) {
  return tx.savingsGoal.findMany({
    where: { planId },
    select: { id: true, name: true },
  });
}

export async function findPlanByIdWithGoalsTx(
  tx: PlanTxClient,
  planId: string,
) {
  return tx.plan.findUnique({
    where: { id: planId },
    include: PLAN_INCLUDE,
  });
}

export async function findPlanForOwnershipTx(tx: PlanTxClient, planId: string) {
  return tx.plan.findUnique({
    where: { id: planId },
    select: { id: true, userId: true },
  });
}

export async function executeTransaction<T>(
  fn: (tx: PlanTxClient) => Promise<T>,
): Promise<T> {
  return prismaHttpGuard(() => prisma.$transaction(fn));
}

export async function findUserWithActivePlan(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: { activePlan: true },
  });
}

export async function findBudgetGoalsForPlan(tx: PlanTxClient, planId: string) {
  return tx.budgetGoal.findMany({ where: { planId } });
}

export async function findSavingsGoalsForPlanFull(
  tx: PlanTxClient,
  planId: string,
) {
  return tx.savingsGoal.findMany({ where: { planId } });
}

export async function findPlanByUniqueKeyTx(
  tx: PlanTxClient,
  userId: string,
  periodType: PeriodType,
  periodStart: Date,
) {
  return tx.plan.findUnique({
    where: {
      userId_periodType_periodStart: { userId, periodType, periodStart },
    },
  });
}

export async function createPlanInTx(
  tx: PlanTxClient,
  data: {
    userId: string;
    periodType: PeriodType;
    periodStart: Date;
    periodEnd: Date;
    periodAnchor?: Date | null;
    timeZone?: string;
    currency: CurrencyCode;
    language: LanguageCode;
    totalBudgetLimitMinor: number;
  },
) {
  return tx.plan.create({
    data: {
      ...data,
      timeZone: data.timeZone ?? "America/New_York",
    },
    include: PLAN_INCLUDE,
  });
}

export async function createBudgetGoalsInTx(
  tx: PlanTxClient,
  planId: string,
  goals: Array<{ category: string; limitMinor: number }>,
) {
  if (goals.length === 0) return;
  return tx.budgetGoal.createMany({
    data: goals.map((g) => ({
      planId,
      category: g.category,
      limitMinor: g.limitMinor,
    })),
  });
}

export async function createSavingsGoalsInTx(
  tx: PlanTxClient,
  planId: string,
  goals: Array<{ name: string; targetMinor: number }>,
) {
  if (goals.length === 0) return;
  return tx.savingsGoal.createMany({
    data: goals.map((g) => ({
      planId,
      name: g.name,
      targetMinor: g.targetMinor,
    })),
  });
}

export async function setUserActivePlanIdTx(
  tx: PlanTxClient,
  userId: string,
  planId: string,
) {
  return tx.user.update({
    where: { id: userId },
    data: { activePlanId: planId },
  });
}

export async function upsertPlanForSwitchCurrency(
  tx: PlanTxClient,
  params: {
    userId: string;
    periodType: PeriodType;
    periodStart: Date;
    periodEnd: Date;
    periodAnchor: Date | null;
    timeZone: string;
    language: LanguageCode;
    currency: CurrencyCode;
    totalBudgetLimitMinor: number;
  },
) {
  return tx.plan.upsert({
    where: {
      userId_periodType_periodStart: {
        userId: params.userId,
        periodType: params.periodType,
        periodStart: params.periodStart,
      },
    },
    create: {
      userId: params.userId,
      periodType: params.periodType,
      periodAnchor: params.periodAnchor,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      timeZone: params.timeZone,
      language: params.language,
      currency: params.currency,
      totalBudgetLimitMinor: params.totalBudgetLimitMinor,
    },
    update: {
      currency: params.currency,
      periodAnchor: params.periodAnchor,
      periodEnd: params.periodEnd,
      timeZone: params.timeZone,
      language: params.language,
    },
  });
}

export async function updatePlanTotalBudgetTx(
  tx: PlanTxClient,
  planId: string,
  totalBudgetLimitMinor: number,
) {
  return tx.plan.update({
    where: { id: planId },
    data: { totalBudgetLimitMinor },
  });
}

export async function upsertBudgetGoalByCategoryTx(
  tx: PlanTxClient,
  planId: string,
  category: string,
  limitMinor: number,
) {
  return tx.budgetGoal.upsert({
    where: {
      planId_category: { planId, category },
    },
    create: { planId, category, limitMinor },
    update: { limitMinor },
  });
}

export async function upsertSavingsGoalByNameTx(
  tx: PlanTxClient,
  planId: string,
  name: string,
  targetMinor: number,
) {
  return tx.savingsGoal.upsert({
    where: {
      planId_name: { planId, name },
    },
    create: { planId, name, targetMinor },
    update: { targetMinor },
  });
}

