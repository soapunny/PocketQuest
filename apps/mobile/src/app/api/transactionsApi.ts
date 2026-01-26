import { request } from "./http";
import type {
  Range,
  Currency,
  TxType,
  TransactionDTO,
  TransactionsListResponseDTO,
  CreateTransactionDTO,
  UpdateTransactionDTO,
  CreateTransactionResponseDTO,
  DeleteTransactionResponseDTO,
} from "../../../../../packages/shared/src/transactions/types";

export const transactionsApi = {
  getList: async (params: {
    token: string;
    range: Range;
    includeSummary?: boolean;
  }) => {
    const { token, range, includeSummary } = params;

    const qs = new URLSearchParams();
    if (range) qs.set("range", range);
    if (includeSummary) qs.set("includeSummary", "1");

    const path = `/api/transactions?${qs.toString()}`;

    return request<TransactionsListResponseDTO>(path, {
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  create: async (token: string, data: CreateTransactionDTO) => {
    return request<CreateTransactionResponseDTO>("/api/transactions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  update: async (token: string, id: string, data: UpdateTransactionDTO) => {
    return request<CreateTransactionResponseDTO>(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },

  delete: async (token: string, id: string) => {
    return request<DeleteTransactionResponseDTO>(`/api/transactions/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  },
};
