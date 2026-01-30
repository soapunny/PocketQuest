import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
} from "react";
import type {
  Transaction,
  TransactionDTO,
  TransactionsSummary,
  TransactionsFilterInfo,
  Range,
  TxType,
  CreateTransactionDTO,
  UpdateTransactionDTO,
} from "../../../../../packages/shared/src/transactions/types";
import type { Currency } from "../../../../../packages/shared/src/money/types";
import { transactionsApi } from "../api/transactionsApi";
import { useAuthStore } from "./authStore";
import { useBootStrap } from "../hooks/useBootStrap";

// Use shared transaction types (SSOT)

type Store = {
  transactions: Transaction[];
  range: Range;
  loading: boolean;
  error?: string | null;
  summary?: TransactionsSummary | null;
  filterInfo?: TransactionsFilterInfo | null;

  load: (range?: Range) => Promise<void>;
  setRange: (range: Range) => void;
  refresh: () => Promise<void>;

  createTransaction: (tx: CreateTransactionDTO) => Promise<void>;
  updateTransaction: (id: string, patch: UpdateTransactionDTO) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
};

const TransactionsContext = createContext<Store | null>(null);

function normalizeTx(tx: Transaction | TransactionDTO): Transaction {
  const anyTx = tx as any;

  const currency: Currency = anyTx?.currency === "KRW" ? "KRW" : "USD";

  const hasMinor = typeof anyTx?.amountMinor === "number";
  const hasCents = typeof anyTx?.amountCents === "number";

  let amountMinor: number;
  if (hasMinor) {
    amountMinor = Number(anyTx.amountMinor) || 0;
  } else if (hasCents) {
    amountMinor = Number(anyTx.amountCents) || 0;
  } else {
    amountMinor = 0;
  }

  // Mirror amountCents for USD for legacy reads.
  const amountCents = currency === "USD" ? amountMinor : undefined;

  // Normalize timestamps: server may return `occurredAt` on reads.
  const occurredAtISO =
    typeof anyTx?.occurredAtISO === "string" && anyTx.occurredAtISO
      ? String(anyTx.occurredAtISO)
      : typeof anyTx?.occurredAt === "string" && anyTx.occurredAt
        ? String(anyTx.occurredAt)
        : "";

  // Build a clean domain Transaction (id/userId required)
  return {
    id: String(anyTx?.id ?? ""),
    userId: String(anyTx?.userId ?? ""),
    type: (anyTx?.type ?? "EXPENSE") as TxType,

    amountMinor,
    currency,
    amountCents,

    fxUsdKrw: anyTx?.fxUsdKrw ?? null,

    category: String(anyTx?.category ?? ""),

    occurredAtISO,
    occurredAtLocalISO:
      typeof anyTx?.occurredAtLocalISO === "string"
        ? String(anyTx.occurredAtLocalISO)
        : undefined,

    note:
      anyTx?.note === undefined
        ? undefined
        : anyTx.note === null
          ? null
          : String(anyTx.note),

    savingsGoalId:
      anyTx?.savingsGoalId === undefined
        ? undefined
        : anyTx.savingsGoalId === null
          ? null
          : String(anyTx.savingsGoalId),

    savingsGoalName:
      anyTx?.savingsGoalName === undefined
        ? undefined
        : anyTx.savingsGoalName === null
          ? null
          : String(anyTx.savingsGoalName),

    // Keep server-read field optional for debugging/compat if present
    occurredAt:
      typeof anyTx?.occurredAt === "string"
        ? String(anyTx.occurredAt)
        : undefined,
  };
}

export function TransactionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [range, setRangeState] = useState<Range>("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<TransactionsSummary | null>(null);
  const [filterInfo, setFilterInfo] = useState<TransactionsFilterInfo | null>(
    null,
  );

  const { token } = useAuthStore();
  const { runBootstrap } = useBootStrap();

  const load = useCallback(
    async (nextRange?: Range) => {
      const r = nextRange ?? range;
      setError(null);

      if (!token) {
        setTransactions([]);
        setSummary(null);
        setFilterInfo(null);
        setRangeState(r);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const resp = await transactionsApi.getList({
          token,
          range: r,
          includeSummary: true,
        });

        const list = (resp.transactions ?? []) as TransactionDTO[];
        setTransactions(list.map((t) => normalizeTx(t)));
        setSummary((resp.summary ?? null) as TransactionsSummary | null);
        setFilterInfo((resp.filter ?? null) as TransactionsFilterInfo | null);
        setRangeState(r);
      } catch (e: any) {
        setError(
          e?.message ? String(e.message) : "Failed to load transactions",
        );
      } finally {
        setLoading(false);
      }
    },
    [range, token],
  );

  const refresh = useCallback(async () => {
    await load(range);
  }, [load, range]);

  const setRange = useCallback(
    (r: Range) => {
      void load(r);
    },
    [load],
  );

  useEffect(() => {
    // When logging out: immediately clear sensitive state.
    if (!token) {
      setTransactions([]);
      setSummary(null);
      setFilterInfo(null);
      setLoading(false);
      setError(null);
      return;
    }

    // When logging in (token becomes available): load current range.
    void load(range);
  }, [token]);

  const createTransaction = useCallback(
    async (tx: CreateTransactionDTO) => {
      setLoading(true);
      setError(null);
      if (!token) {
        const e = new Error("Missing auth token");
        setError(e.message);
        setLoading(false);
        throw e;
      }
      try {
        const payload: CreateTransactionDTO = {
          ...tx,
          currency: tx.currency ?? "USD",
        };
        await transactionsApi.create(token, payload);
        await refresh();
        await runBootstrap();
      } catch (e: any) {
        setError(e?.message ? String(e.message) : "Create failed");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [token, refresh, runBootstrap],
  );

  const updateTransaction = useCallback(
    async (id: string, patch: UpdateTransactionDTO) => {
      setLoading(true);
      setError(null);
      if (!token) {
        const e = new Error("Missing auth token");
        setError(e.message);
        setLoading(false);
        throw e;
      }
      try {
        const normalizedPatch: UpdateTransactionDTO = { ...patch };
        if (
          typeof patch.amountMinor === "number" ||
          typeof patch.currency === "string"
        ) {
          const current = transactions.find((t) => t.id === id) as any;
          const base: Transaction = {
            ...(current ?? {
              id,
              userId: "",
              type: "EXPENSE",
              amountMinor: 0,
              currency: "USD",
              category: "",
              occurredAtISO: "",
            }),
            ...patch,
          };
          const normalized = normalizeTx(base);
          normalizedPatch.amountMinor = normalized.amountMinor;
          normalizedPatch.currency = normalized.currency;
        }

        await transactionsApi.update(token, id, normalizedPatch);
        await refresh();
        await runBootstrap();
      } catch (e: any) {
        setError(e?.message ? String(e.message) : "Update failed");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [token, refresh, runBootstrap, transactions],
  );

  const deleteTransaction = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      if (!token) {
        const e = new Error("Missing auth token");
        setError(e.message);
        setLoading(false);
        throw e;
      }
      try {
        await transactionsApi.delete(token, id);
        await refresh();
        await runBootstrap();
      } catch (e: any) {
        setError(e?.message ? String(e.message) : "Delete failed");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [token, refresh, runBootstrap],
  );

  const value = useMemo(
    () => ({
      transactions,
      range,
      loading,
      error,
      summary,
      filterInfo,
      load,
      setRange,
      refresh,
      createTransaction,
      updateTransaction,
      deleteTransaction,
    }),
    [
      transactions,
      range,
      loading,
      error,
      summary,
      filterInfo,
      load,
      setRange,
      refresh,
      createTransaction,
      updateTransaction,
      deleteTransaction,
    ],
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
