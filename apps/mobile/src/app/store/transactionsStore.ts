import React, { createContext, useContext, useMemo, useState } from "react";
import type { Currency } from "../domain/money/currency";

// EXPENSE: normal spending that counts against Budget
// INCOME: money coming in (paycheck, gift, bonus)
// SAVING: money moved into savings goals (not an expense)
export type TxType = "EXPENSE" | "INCOME" | "SAVING";

export type Transaction = {
  id: string;
  type: TxType;

  // New: multi-currency money storage
  // Store in MINOR units:
  // - USD: cents
  // - KRW: won
  amountMinor: number;
  currency: Currency;

  // Optional FX rate snapshot: 1 USD = fxUsdKrw KRW
  // Only needed when converting between USD/KRW for reporting.
  fxUsdKrw?: number;

  // Back-compat: older code may still read amountCents.
  // Keep it optional and mirror USD cents.
  amountCents?: number;

  category: string;
  occurredAtISO: string;
  note?: string;
  itemTags?: string[];
};

type Store = {
  transactions: Transaction[];
  addTransaction: (tx: Omit<Transaction, "id">) => void;
  updateTransaction: (
    id: string,
    patch: Partial<Omit<Transaction, "id">>,
  ) => void;
  deleteTransaction: (id: string) => void;
};

const TransactionsContext = createContext<Store | null>(null);

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function normalizeTx(tx: Omit<Transaction, "id">): Omit<Transaction, "id"> {
  // If old callers pass amountCents only, treat as USD cents.
  const hasMinor = typeof (tx as any).amountMinor === "number";
  const hasCents = typeof (tx as any).amountCents === "number";

  const currency: Currency = (tx as any).currency === "KRW" ? "KRW" : "USD";

  let amountMinor: number;
  if (hasMinor) {
    amountMinor = Number((tx as any).amountMinor) || 0;
  } else if (hasCents) {
    amountMinor = Number((tx as any).amountCents) || 0;
  } else {
    amountMinor = 0;
  }

  // Mirror amountCents for USD for legacy reads.
  const amountCents = currency === "USD" ? amountMinor : undefined;

  return {
    ...tx,
    currency,
    amountMinor,
    amountCents,
  };
}

export function TransactionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const addTransaction: Store["addTransaction"] = (tx) => {
    const occurredAtISO = tx.occurredAtISO
      ? new Date(tx.occurredAtISO).toISOString()
      : new Date().toISOString();

    const normalized = normalizeTx({ ...tx, occurredAtISO });
    setTransactions((prev) => [{ ...normalized, id: uid() }, ...prev]);
  };

  const updateTransaction: Store["updateTransaction"] = (id, patch) => {
    setTransactions((prev) =>
      prev.map((tx) => {
        if (tx.id !== id) return tx;

        const nextOccurredAtISO = patch.occurredAtISO
          ? new Date(patch.occurredAtISO).toISOString()
          : tx.occurredAtISO;

        // Build a candidate tx (without id) so we can normalize currency/amount fields.
        const candidate: Omit<Transaction, "id"> = {
          ...tx,
          ...patch,
          occurredAtISO: nextOccurredAtISO,
        } as any;

        const normalized = normalizeTx(candidate);

        return {
          ...normalized,
          id: tx.id,
        };
      }),
    );
  };

  const deleteTransaction: Store["deleteTransaction"] = (id) => {
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
  };

  const value = useMemo(
    () => ({
      transactions,
      addTransaction,
      updateTransaction,
      deleteTransaction,
    }),
    [transactions],
  );

  return React.createElement(TransactionsContext.Provider, { value }, children);
}

export function isExpense(tx: Transaction) {
  return tx.type === "EXPENSE";
}

export function isIncome(tx: Transaction) {
  return tx.type === "INCOME";
}

export function isSaving(tx: Transaction) {
  return tx.type === "SAVING";
}

export function useTransactions() {
  const ctx = useContext(TransactionsContext);
  if (!ctx)
    throw new Error("useTransactions must be used within TransactionsProvider");
  return ctx;
}
