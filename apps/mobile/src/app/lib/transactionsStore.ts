import React, { createContext, useContext, useMemo, useState } from "react";

export type TxType = "EXPENSE" | "INCOME" | "SAVING";

export type Transaction = {
  id: string;
  type: TxType;
  amountCents: number;
  category: string;
  occurredAtISO: string;
  note?: string;
  itemTags?: string[];
};

type Store = {
  transactions: Transaction[];
  addTransaction: (tx: Omit<Transaction, "id">) => void;
};

const TransactionsContext = createContext<Store | null>(null);

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function TransactionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const addTransaction: Store["addTransaction"] = (tx) => {
    setTransactions((prev) => [{ ...tx, id: uid() }, ...prev]);
  };

  const value = useMemo(
    () => ({ transactions, addTransaction }),
    [transactions]
  );

  return React.createElement(TransactionsContext.Provider, { value }, children);
}

export function useTransactions() {
  const ctx = useContext(TransactionsContext);
  if (!ctx)
    throw new Error("useTransactions must be used within TransactionsProvider");
  return ctx;
}
