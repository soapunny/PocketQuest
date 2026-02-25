// apps/server/src/domain/transaction/transaction.repository.ts

import { prisma } from "@/lib/prisma";
import type { TxType } from "@pq/shared/transactions/types";
import type { TransactionWithSavingsGoalNameRow } from "@/domain/transaction/transaction.mapper";
import { Prisma } from "@prisma/client";
import { prismaHttpGuard } from "@/lib/prisma/prismaErrors";

/**
 * User timezone (for calendar boundaries + DTO rendering)
 */
export async function getUserTimeZone(userId: string): Promise<string | null> {
  return prismaHttpGuard(async () => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timeZone: true },
    });

    return user?.timeZone ?? null;
  });
}

/**
 * Prefer activePlanId; fallback to latest plan by periodStart desc.
 * (Used to validate savingsGoal ownership)
 */
export async function resolveUserPlanIdForGoals(
  userId: string,
): Promise<string | null> {
  return prismaHttpGuard(async () => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { activePlanId: true },
    });
    if (user?.activePlanId) return user.activePlanId;

    const latestPlan = await prisma.plan.findFirst({
      where: { userId },
      orderBy: { periodStart: "desc" },
      select: { id: true },
    });

    return latestPlan?.id ?? null;
  });
}

/**
 * Verify a savings goal belongs to the resolved plan.
 * Returns minimal info used in service/DTO messaging.
 */
export async function findSavingsGoalInPlan(params: {
  savingsGoalId: string;
  planId: string;
}): Promise<{ id: string; name: string } | null> {
  return prismaHttpGuard(async () => {
    const goal = await prisma.savingsGoal.findFirst({
      where: { id: params.savingsGoalId, planId: params.planId },
      select: { id: true, name: true },
    });

    return goal ?? null;
  });
}

/**
 * List transactions (optionally bounded by occurredAt range)
 */
export async function listTransactions(params: {
  userId: string;
  occurredAtFilter?: { gte?: Date; lt?: Date };
}): Promise<TransactionWithSavingsGoalNameRow[]> {
  return prismaHttpGuard(async () => {
    const where = {
      userId: params.userId,
      ...(params.occurredAtFilter
        ? { occurredAt: params.occurredAtFilter }
        : {}),
    } as const;

    const rows = (await prisma.transaction.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      select: {
        id: true,
        userId: true,
        type: true,
        amountMinor: true,
        currency: true,
        fxUsdKrw: true,
        category: true,
        savingsGoalId: true,
        occurredAt: true,
        note: true,
        savingsGoal: { select: { name: true } },
      },
    })) as TransactionWithSavingsGoalNameRow[];

    return rows;
  });
}

/**
 * Aggregate summary by TxType for the same filters used in list.
 * (Used when includeSummary=1)
 */
export async function aggregateTransactionsByType(params: {
  userId: string;
  occurredAtFilter?: { gte?: Date; lt?: Date };
  type: TxType;
}): Promise<{ sumMinor: number; count: number }> {
  return prismaHttpGuard(async () => {
    const where = {
      userId: params.userId,
      type: params.type,
      ...(params.occurredAtFilter
        ? { occurredAt: params.occurredAtFilter }
        : {}),
    } as const;

    const agg = await prisma.transaction.aggregate({
      where,
      _sum: { amountMinor: true },
      _count: true,
    });

    return {
      sumMinor: agg._sum.amountMinor ?? 0,
      count: agg._count,
    };
  });
}

/**
 * Create a transaction and return the same row shape used by list (includes savingsGoal.name).
 */
export async function createTransaction(params: {
  data: Prisma.TransactionUncheckedCreateInput;
}): Promise<TransactionWithSavingsGoalNameRow> {
  return prismaHttpGuard(async () => {
    const created = (await prisma.transaction.create({
      data: params.data,
      select: {
        id: true,
        userId: true,
        type: true,
        amountMinor: true,
        currency: true,
        fxUsdKrw: true,
        category: true,
        savingsGoalId: true,
        occurredAt: true,
        note: true,
        savingsGoal: { select: { name: true } },
      },
    })) as TransactionWithSavingsGoalNameRow;

    return created;
  });
}

// 1) 단건 조회 (유저 소유 확인 포함)
export async function findTransactionByIdForUser(params: {
  userId: string;
  id: string;
}): Promise<TransactionWithSavingsGoalNameRow | null> {
  return prismaHttpGuard(async () => {
    const row = (await prisma.transaction.findFirst({
      where: { id: params.id, userId: params.userId },
      select: {
        id: true,
        userId: true,
        type: true,
        amountMinor: true,
        currency: true,
        fxUsdKrw: true,
        category: true,
        savingsGoalId: true,
        occurredAt: true,
        note: true,
        savingsGoal: { select: { name: true } },
      },
    })) as TransactionWithSavingsGoalNameRow | null;

    return row;
  });
}

// 2) 단건 업데이트 (id로만 업데이트; 소유권은 service에서 find로 보장)
export async function updateTransactionById(params: {
  id: string;
  data: Prisma.TransactionUncheckedUpdateInput;
}): Promise<TransactionWithSavingsGoalNameRow> {
  return prismaHttpGuard(async () => {
    const row = (await prisma.transaction.update({
      where: { id: params.id },
      data: params.data,
      select: {
        id: true,
        userId: true,
        type: true,
        amountMinor: true,
        currency: true,
        fxUsdKrw: true,
        category: true,
        savingsGoalId: true,
        occurredAt: true,
        note: true,
        savingsGoal: { select: { name: true } },
      },
    })) as TransactionWithSavingsGoalNameRow;

    return row;
  });
}

// 3) 단건 삭제 (id로만 삭제; 소유권은 service에서 find로 보장)
export async function deleteTransactionById(params: {
  id: string;
}): Promise<void> {
  return prismaHttpGuard(async () => {
    await prisma.transaction.delete({ where: { id: params.id } });
  });
}
