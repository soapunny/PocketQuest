// apps/server/src/domain/transaction/transaction.mapper.ts

import { toZonedTime } from "date-fns-tz";
import { format } from "date-fns";

import type { TxType, TransactionDTO } from "@pq/shared/transactions/types";
import type { Currency } from "@pq/shared/money/types";

export type TransactionWithSavingsGoalNameRow = {
  id: string;
  userId: string;
  type: TxType;
  amountMinor: number;
  currency: Currency;
  fxUsdKrw: number | null;
  category: string;
  savingsGoalId: string | null;
  occurredAt: Date;
  note: string | null;
  savingsGoal?: { name: string } | null;
};

export function toTransactionDTO(
  t: TransactionWithSavingsGoalNameRow,
  timeZone: string,
): TransactionDTO {
  const zoned = toZonedTime(t.occurredAt, timeZone);
  const occurredAtLocalISO = format(zoned, "yyyy-MM-dd'T'HH:mm:ss");

  const savingsGoalName = t.savingsGoal?.name ?? null;

  return {
    id: t.id,
    userId: t.userId,
    type: t.type,
    amountMinor: t.amountMinor,
    currency: t.currency,
    fxUsdKrw: t.fxUsdKrw ?? null,
    category: t.category,
    savingsGoalId: t.savingsGoalId ?? null,
    occurredAt: t.occurredAt.toISOString(),
    occurredAtLocalISO,
    note: t.note ?? null,
    savingsGoalName,
  };
}
