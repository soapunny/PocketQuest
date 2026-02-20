// apps/server/src/domain/transaction/transaction.service.ts

import type { Prisma } from "@prisma/client";
import {
  getMonthlyPeriodStartUTC,
  getNextMonthlyPeriodStartUTC,
  getPreviousMonthlyPeriodStartUTC,
  getYearPeriodStartUTC,
  getNextYearPeriodStartUTC,
} from "@/lib/plan/periodRules";
import { DEFAULT_TIME_ZONE } from "@/lib/plan/defaults";

import {
  type Range,
  type TransactionsSummary,
  type TransactionsListResponseDTO,
  type CreateTransactionDTO,
  type CreateTransactionResponseDTO,
  type TxType,
  expenseCategoryKeySchema,
  incomeCategoryKeySchema,
} from "@pq/shared/transactions/types";

import {
  EXPENSE_CATEGORY_KEYS,
  INCOME_CATEGORY_KEYS,
  canonicalCategoryKeyForServer,
} from "@pq/shared/transactions/categories";

import {
  toTransactionDTO,
  type TransactionWithSavingsGoalNameRow,
} from "@/domain/transaction/transaction.mapper";

import { HttpError } from "@/lib/http/httpError";

import {
  getUserTimeZone,
  resolveUserPlanIdForGoals as resolveUserPlanIdForGoalsRepo,
  findSavingsGoalInPlan,
  listTransactions,
  aggregateTransactionsByType,
  createTransaction,
} from "@/domain/transaction/transaction.repository";

const SAVING_CATEGORY_KEY = "savings" as const;

function computeOccurredAtFilter(
  range: Range,
  timeZone: string,
): {
  occurredAtFilter?: { gte?: Date; lt?: Date };
  periodStartUTC?: Date;
  periodEndUTC?: Date;
} {
  let periodStartUTC: Date | undefined;
  let periodEndUTC: Date | undefined;
  let occurredAtFilter: { gte?: Date; lt?: Date } | undefined;

  if (range === "THIS_MONTH") {
    const start = getMonthlyPeriodStartUTC(timeZone);
    const end = getNextMonthlyPeriodStartUTC(timeZone);
    occurredAtFilter = { gte: start, lt: end };
    periodStartUTC = start;
    periodEndUTC = end;
  } else if (range === "LAST_MONTH") {
    const thisStart = getMonthlyPeriodStartUTC(timeZone);
    const prevStart = getPreviousMonthlyPeriodStartUTC(timeZone);
    occurredAtFilter = { gte: prevStart, lt: thisStart };
    periodStartUTC = prevStart;
    periodEndUTC = thisStart;
  } else if (range === "THIS_YEAR") {
    const yearStart = getYearPeriodStartUTC(timeZone);
    const nextYearStart = getNextYearPeriodStartUTC(timeZone);
    occurredAtFilter = { gte: yearStart, lt: nextYearStart };
    periodStartUTC = yearStart;
    periodEndUTC = nextYearStart;
  } else {
    occurredAtFilter = undefined;
    periodStartUTC = undefined;
    periodEndUTC = undefined;
  }

  return { occurredAtFilter, periodStartUTC, periodEndUTC };
}

async function assertSavingsGoalOwnership(params: {
  userId: string;
  savingsGoalId: string;
}): Promise<{ id: string; name: string }> {
  const planId = await resolveUserPlanIdForGoalsRepo(params.userId);
  if (!planId) {
    throw new HttpError(404, "Plan not found");
  }

  const goal = await findSavingsGoalInPlan({
    savingsGoalId: params.savingsGoalId,
    planId,
  });

  if (!goal) {
    throw new HttpError(403, "savingsGoalId does not belong to you");
  }

  return goal;
}

export async function getTransactionsForUser(params: {
  userId: string;
  range: Range;
  includeSummary: boolean;
}): Promise<TransactionsListResponseDTO> {
  const { userId, range, includeSummary } = params;

  const timeZone = (await getUserTimeZone(userId)) || DEFAULT_TIME_ZONE;

  const { occurredAtFilter, periodStartUTC, periodEndUTC } =
    computeOccurredAtFilter(range, timeZone);

  const transactions = await listTransactions({ userId, occurredAtFilter });

  const transactionsDTO = transactions.map((t) =>
    toTransactionDTO(t, timeZone),
  );

  let summary: TransactionsSummary | null = null;

  if (includeSummary) {
    const [incomeAgg, expenseAgg, savingAgg] = await Promise.all([
      aggregateTransactionsByType({
        userId,
        occurredAtFilter,
        type: "INCOME",
      }),
      aggregateTransactionsByType({
        userId,
        occurredAtFilter,
        type: "EXPENSE",
      }),
      aggregateTransactionsByType({
        userId,
        occurredAtFilter,
        type: "SAVING",
      }),
    ]);

    const incomeMinor = incomeAgg.sumMinor;
    const expenseMinor = expenseAgg.sumMinor;
    const savingMinor = savingAgg.sumMinor;
    const cashflowMinor = incomeMinor - expenseMinor - savingMinor;
    const spendToIncomeRatio =
      incomeMinor > 0 ? expenseMinor / incomeMinor : null;

    summary = {
      incomeMinor,
      expenseMinor,
      savingMinor,
      cashflowMinor,
      spendToIncomeRatio,
      counts: {
        income: incomeAgg.count,
        expense: expenseAgg.count,
        saving: savingAgg.count,
      },
    };
  }

  return {
    transactions: transactionsDTO,
    filter: {
      range,
      timeZone,
      periodStartUTC: periodStartUTC ? periodStartUTC.toISOString() : null,
      periodEndUTC: periodEndUTC ? periodEndUTC.toISOString() : null,
    },
    count: transactionsDTO.length,
    summary,
  };
}

export async function createTransactionForUser(params: {
  userId: string;
  data: CreateTransactionDTO;
}): Promise<CreateTransactionResponseDTO> {
  const { userId, data } = params;

  const timeZone = (await getUserTimeZone(userId)) || DEFAULT_TIME_ZONE;

  // normalize inputs
  const categoryRaw = String(data.category ?? "").trim();
  let savingsGoalId =
    typeof data.savingsGoalId === "string"
      ? data.savingsGoalId.trim()
      : undefined;
  if (savingsGoalId === "") savingsGoalId = undefined;

  // Canonicalize category to server-accepted keys (aliases/casing)
  const txType: TxType = data.type;
  let category = canonicalCategoryKeyForServer(categoryRaw, txType);

  // Defense-in-depth: INCOME must never be "uncategorized" (legacy key).
  if (txType === "INCOME" && category === "uncategorized") {
    category = "other";
  }

  // SAVING rules
  if (data.type === "SAVING") {
    if (!savingsGoalId) {
      throw new HttpError(400, "savingsGoalId is required for SAVING");
    }

    await assertSavingsGoalOwnership({ userId, savingsGoalId });

    // Override category regardless of client input (canonical saving key)
    category = SAVING_CATEGORY_KEY;
  } else {
    // non-saving: ignore any provided savingsGoalId and validate canonical category key
    savingsGoalId = undefined;

    if (data.type === "EXPENSE") {
      const ok = expenseCategoryKeySchema.safeParse(category);
      if (!ok.success) {
        throw new HttpError(400, "Invalid expense category", {
          allowed: EXPENSE_CATEGORY_KEYS,
        });
      }
      category = ok.data;
    }

    if (data.type === "INCOME") {
      const ok = incomeCategoryKeySchema.safeParse(category);
      if (!ok.success) {
        throw new HttpError(400, "Invalid income category", {
          allowed: INCOME_CATEGORY_KEYS,
        });
      }
      category = ok.data;
    }
  }

  const occurredAt = new Date(data.occurredAtISO);

  // IMPORTANT: Prisma expects enums for currency/type in create input.
  // We keep this typed as Prisma.TransactionUncheckedCreateInput for repo compatibility.
  const createData: Prisma.TransactionUncheckedCreateInput = {
    userId,
    // Prisma enum fields: keep as-is; TS compatibility depends on your Prisma enum names.
    // If TS complains here, add a small mapper (toPrismaTxType/toPrismaCurrency) instead of `as any`.
    type: data.type as any,
    amountMinor: data.amountMinor,
    currency: (data.currency ?? "USD") as any,
    fxUsdKrw: data.fxUsdKrw ?? null,
    category,
    savingsGoalId: data.type === "SAVING" ? (savingsGoalId as string) : null,
    occurredAt,
    note: data.note ?? null,
  };

  const created = (await createTransaction({
    data: createData,
  })) as TransactionWithSavingsGoalNameRow;

  return { transaction: toTransactionDTO(created, timeZone) };
}
