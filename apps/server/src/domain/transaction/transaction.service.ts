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
  type UpdateTransactionDTO,
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
  toPrismaCurrencyCode,
  toPrismaTxType,
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
  findTransactionByIdForUser,
  updateTransactionById,
  deleteTransactionById,
} from "@/domain/transaction/transaction.repository";

const SAVING_CATEGORY_KEY = "savings" as const;

async function normalizeAndValidateCategory(params: {
  userId: string;
  type: TxType;
  categoryRaw: unknown;
  savingsGoalIdRaw: unknown;
}): Promise<{ category: string; savingsGoalId: string | null }> {
  const { userId, type } = params;

  // Canonicalize category to server-accepted keys (aliases/casing)
  let category = canonicalCategoryKeyForServer(
    String(params.categoryRaw ?? "").trim(),
    type,
  );

  // Defense-in-depth: INCOME must never be "uncategorized" (legacy key).
  if (type === "INCOME" && category === "uncategorized") {
    category = "other";
  }

  const savingsGoalId =
    typeof params.savingsGoalIdRaw === "string"
      ? params.savingsGoalIdRaw.trim()
      : "";

  // SAVING rules
  if (type === "SAVING") {
    if (!savingsGoalId) {
      throw new HttpError(400, "savingsGoalId is required for SAVING");
    }

    await assertSavingsGoalOwnership({ userId, savingsGoalId });
    return { category: SAVING_CATEGORY_KEY, savingsGoalId };
  }

  // non-saving: ignore any provided savingsGoalId and validate canonical category key
  if (type === "EXPENSE") {
    const ok = expenseCategoryKeySchema.safeParse(category);
    if (!ok.success) {
      throw new HttpError(400, "Invalid expense category", {
        allowed: EXPENSE_CATEGORY_KEYS,
      });
    }
    category = ok.data;
  }

  if (type === "INCOME") {
    const ok = incomeCategoryKeySchema.safeParse(category);
    if (!ok.success) {
      throw new HttpError(400, "Invalid income category", {
        allowed: INCOME_CATEGORY_KEYS,
      });
    }
    category = ok.data;
  }

  return { category, savingsGoalId: null };
}

function parseOccurredAt(occurredAtISO: string): Date {
  const d = new Date(occurredAtISO);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(400, "Invalid occurredAtISO");
  }
  return d;
}

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

  const transactionRows = await listTransactions({ userId, occurredAtFilter });

  const transactionDTOs = transactionRows.map((t) =>
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
    transactions: transactionDTOs,
    filter: {
      range,
      timeZone,
      periodStartUTC: periodStartUTC ? periodStartUTC.toISOString() : null,
      periodEndUTC: periodEndUTC ? periodEndUTC.toISOString() : null,
    },
    count: transactionDTOs.length,
    summary,
  };
}

export async function createTransactionForUser(params: {
  userId: string;
  data: CreateTransactionDTO;
}): Promise<CreateTransactionResponseDTO> {
  const { userId, data } = params;

  const timeZone = (await getUserTimeZone(userId)) || DEFAULT_TIME_ZONE;

  const occurredAt = parseOccurredAt(data.occurredAtISO);

  const norm = await normalizeAndValidateCategory({
    userId,
    type: data.type,
    categoryRaw: data.category,
    savingsGoalIdRaw: data.savingsGoalId,
  });

  const category = norm.category;
  const savingsGoalId = norm.savingsGoalId;

  // IMPORTANT: Prisma expects enums for currency/type in create input.
  // We keep this typed as Prisma.TransactionUncheckedCreateInput for repo compatibility.
  const createData: Prisma.TransactionUncheckedCreateInput = {
    userId,
    type: toPrismaTxType(data.type),
    amountMinor: data.amountMinor,
    currency: toPrismaCurrencyCode(data.currency ?? "USD"),
    fxUsdKrw: data.fxUsdKrw ?? null,
    category,
    savingsGoalId,
    occurredAt,
    note: data.note ?? null,
  };

  const created = (await createTransaction({
    data: createData,
  })) as TransactionWithSavingsGoalNameRow;

  return { transaction: toTransactionDTO(created, timeZone) };
}

export async function getTransactionByIdForUser(params: {
  userId: string;
  id: string;
}): Promise<{ transaction: ReturnType<typeof toTransactionDTO> }> {
  const timeZone = (await getUserTimeZone(params.userId)) || DEFAULT_TIME_ZONE;

  const tx = await findTransactionByIdForUser({
    userId: params.userId,
    id: params.id,
  });

  if (!tx) throw new HttpError(404, "Not found");

  return { transaction: toTransactionDTO(tx, timeZone) };
}

export async function updateTransactionForUser(params: {
  userId: string;
  id: string;
  data: UpdateTransactionDTO;
}): Promise<{ transaction: ReturnType<typeof toTransactionDTO> }> {
  const timeZone = (await getUserTimeZone(params.userId)) || DEFAULT_TIME_ZONE;

  const existing = await findTransactionByIdForUser({
    userId: params.userId,
    id: params.id,
  });
  if (!existing) throw new HttpError(404, "Not found");

  // ---- 변경사항이 있으면 덮어쓰기, 없으면 기존 값 유지 ----
  const nextType = params.data.type ?? existing.type;
  const nextAmountMinor = params.data.amountMinor ?? existing.amountMinor;
  const nextCurrency = params.data.currency ?? existing.currency;
  const nextFxUsdKrw =
    params.data.fxUsdKrw !== undefined
      ? params.data.fxUsdKrw
      : existing.fxUsdKrw;
  const nextNote =
    params.data.note !== undefined ? params.data.note : existing.note;
  const nextOccurredAt = params.data.occurredAtISO
    ? parseOccurredAt(params.data.occurredAtISO)
    : existing.occurredAt;
  const nextCategoryRaw = params.data.category ?? existing.category;
  const nextSavingsGoalIdRaw =
    params.data.savingsGoalId !== undefined
      ? params.data.savingsGoalId
      : existing.savingsGoalId;

  const norm = await normalizeAndValidateCategory({
    userId: params.userId,
    type: nextType as TxType,
    categoryRaw: nextCategoryRaw,
    savingsGoalIdRaw: nextSavingsGoalIdRaw,
  });

  const category = norm.category;
  const savingsGoalId = norm.savingsGoalId;

  // ---- prisma update input ----
  const updateData: Prisma.TransactionUncheckedUpdateInput = {
    type: toPrismaTxType(nextType as TxType),
    amountMinor: nextAmountMinor,
    currency: toPrismaCurrencyCode(nextCurrency as "USD" | "KRW"),
    fxUsdKrw: nextFxUsdKrw ?? null,
    category,
    savingsGoalId,
    occurredAt: nextOccurredAt,
    note: nextNote ?? null,
  };

  const updated = await updateTransactionById({
    id: params.id,
    data: updateData,
  });

  return { transaction: toTransactionDTO(updated, timeZone) };
}

export async function deleteTransactionForUser(params: {
  userId: string;
  id: string;
}): Promise<{ success: true }> {
  const existing = await findTransactionByIdForUser({
    userId: params.userId,
    id: params.id,
  });
  if (!existing) throw new HttpError(404, "Not found");

  await deleteTransactionById({ id: params.id });

  return { success: true };
}
