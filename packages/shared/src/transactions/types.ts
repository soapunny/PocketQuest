// packages/shared/src/transactions/types.ts

import { z } from "zod";

import type { Currency } from "../money/types";
import { CURRENCY_VALUES } from "../money/types";

// 2.1 Common enum/union (const arrays + types)
export const RANGE_VALUES = [
  "THIS_MONTH",
  "LAST_MONTH",
  "THIS_YEAR",
  "ALL",
] as const;
export type Range = (typeof RANGE_VALUES)[number];

export const TX_TYPE_VALUES = ["EXPENSE", "INCOME", "SAVING"] as const;
export type TxType = (typeof TX_TYPE_VALUES)[number];

// 2.2 Domain model (client Transaction)
export type Transaction = {
  id: string;
  userId: string;
  type: TxType;

  // Canonical money fields
  amountMinor: number;
  currency: Currency;

  // Optional FX snapshot
  fxUsdKrw?: number | null;

  // Canonical category key (server-owned canonical keys)
  category: string;

  // App-standard timestamp used across the app (ISO string)
  occurredAtISO: string;

  // Server read contract uses `occurredAt` (ISO string). Keep optional in the domain model
  // because the client normalizes it into `occurredAtISO`.
  occurredAt?: string;
  occurredAtLocalISO?: string; // optional local-formatted string

  note?: string | null;
  savingsGoalId?: string | null;
  savingsGoalName?: string | null;

  // Back-compat: optional legacy cents
  amountCents?: number;
};

export type TransactionsSummary = {
  incomeMinor: number;
  expenseMinor: number;
  savingMinor: number;
  cashflowMinor: number;
  spendToIncomeRatio: number | null;
  counts: { income: number; expense: number; saving: number };
};

export type TransactionsFilterInfo = {
  range: Range;
  timeZone: string;
  periodStartUTC: string | null;
  periodEndUTC: string | null;
};

// 2.3 API DTOs
export type TransactionDTO = {
  id: string;
  userId: string;
  type: TxType;

  // Canonical money fields
  amountMinor: number;
  currency: Currency;

  // Optional FX snapshot
  fxUsdKrw?: number | null;

  category: string;

  // Server authoritative timestamp on reads
  occurredAt: string;
  occurredAtLocalISO?: string;

  note?: string | null;
  savingsGoalId?: string | null;
  savingsGoalName?: string | null;

  // Back-compat: optional legacy cents
  amountCents?: number;

  // Optional alias for forward-compat; client prefers occurredAtISO in domain model
  occurredAtISO?: string;
};

export type TransactionsListResponseDTO = {
  transactions: TransactionDTO[];
  filter: TransactionsFilterInfo;
  count: number;
  summary: TransactionsSummary | null;
};

export type CreateTransactionDTO = {
  type: TxType;
  amountMinor: number;
  currency?: Currency;
  fxUsdKrw?: number | null;
  category: string;
  savingsGoalId?: string;
  occurredAtISO: string;
  note?: string | null;
  amountCents?: number;
};

export type UpdateTransactionDTO = Partial<CreateTransactionDTO>;

export type CreateTransactionResponseDTO = { transaction: TransactionDTO };
export type DeleteTransactionResponseDTO = { success: boolean };

// 2.4 Zod schemas (basic shapes only, no server-only category enforcement)
export const rangeSchema = z.enum(
  RANGE_VALUES as unknown as [string, ...string[]],
);
export const currencySchema = z.enum(
  CURRENCY_VALUES as unknown as [string, ...string[]],
);
export const txTypeSchema = z.enum(
  TX_TYPE_VALUES as unknown as [string, ...string[]],
);

export const transactionCreateSchema = z.object({
  type: txTypeSchema,
  amountMinor: z.number().int().nonnegative(),
  currency: currencySchema.optional(),
  fxUsdKrw: z.number().optional().nullable(),
  category: z.string().min(1),
  savingsGoalId: z.string().min(1).optional(),
  occurredAtISO: z.string().datetime(),
  note: z.string().optional().nullable(),
  amountCents: z.number().optional(),
});

export const transactionUpdateSchema = z.object({
  type: txTypeSchema.optional(),
  amountMinor: z.number().int().nonnegative().optional(),
  currency: currencySchema.optional(),
  fxUsdKrw: z.number().optional().nullable(),
  category: z.string().optional(),
  savingsGoalId: z.string().min(1).optional(),
  occurredAtISO: z.string().datetime().optional(),
  note: z.string().optional().nullable(),
  amountCents: z.number().optional(),
});

export type CreateTransactionInput = z.infer<typeof transactionCreateSchema>;
export type UpdateTransactionInput = z.infer<typeof transactionUpdateSchema>;
