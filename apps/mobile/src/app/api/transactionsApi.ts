// apps/mobile/src/app/api/transactionsApi.ts

import { request } from "./http";
import { canonicalCategoryKeyForServer } from "../../../../../packages/shared/src/transactions/categories";
import type {
  Range,
  TxType,
  TransactionsListResponseDTO,
  CreateTransactionDTO,
  UpdateTransactionDTO,
  CreateTransactionResponseDTO,
  DeleteTransactionResponseDTO,
} from "../../../../../packages/shared/src/transactions/types";

function normalizeCreateDTO(input: CreateTransactionDTO): CreateTransactionDTO {
  const type = input.type;
  return {
    ...input,
    category: canonicalCategoryKeyForServer(
      String((input as any).category ?? ""),
      type
    ),
    // savingsGoalId must only be sent for SAVING
    savingsGoalId: type === "SAVING" ? (input as any).savingsGoalId : undefined,
  };
}

function normalizeUpdateDTO(input: UpdateTransactionDTO): UpdateTransactionDTO {
  // Update DTOs are often partial. Only normalize fields that are actually provided.
  const type = (input as any).type as TxType | undefined;
  const hasCategory = Object.prototype.hasOwnProperty.call(
    input as any,
    "category"
  );
  const hasSavingsGoalId = Object.prototype.hasOwnProperty.call(
    input as any,
    "savingsGoalId"
  );

  const out: any = { ...input };

  // Only normalize category when the caller includes `category` in the patch.
  if (hasCategory) {
    // If type is missing, we can't safely infer defaults; just lowercase/trim.
    if (!type) {
      out.category = String((input as any).category ?? "")
        .trim()
        .toLowerCase();
    } else {
      out.category = canonicalCategoryKeyForServer(
        String((input as any).category ?? ""),
        type
      );
    }
  }

  // Only include savingsGoalId when the caller includes it in the patch.
  // - SAVING: keep as provided
  // - non-SAVING: allow caller to clear with null (server expects null, not undefined)
  if (hasSavingsGoalId) {
    if (type === "SAVING") out.savingsGoalId = (input as any).savingsGoalId;
    else out.savingsGoalId = (input as any).savingsGoalId;
  }

  return out as UpdateTransactionDTO;
}

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
      body: JSON.stringify(normalizeCreateDTO(data)),
    });
  },

  update: async (token: string, id: string, data: UpdateTransactionDTO) => {
    return request<CreateTransactionResponseDTO>(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(normalizeUpdateDTO(data)),
    });
  },

  delete: async (token: string, id: string) => {
    return request<DeleteTransactionResponseDTO>(`/api/transactions/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  },
};
