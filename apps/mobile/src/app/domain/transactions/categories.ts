// apps/mobile/src/app/domain/transactions/categories.ts

/**
 * Transaction-level helpers related to category handling.
 *
 * Policy:
 * - Canonical category keys are defined and owned by `domain/categories`.
 * - This file must NOT define category lists or labels.
 * - Keep only transaction-specific helpers (validation / normalization).
 */

import type { TxType } from "../../../../../../packages/shared/src/transactions/types";

/**
 * Normalize any incoming category value into a canonical key shape.
 * - Trims whitespace
 * - Lowercases
 * - Falls back to "uncategorized"
 */
export function canonicalizeCategoryKey(input: unknown): string {
  if (typeof input !== "string") return "uncategorized";
  const key = input.trim().toLowerCase();
  return key || "uncategorized";
}

/**
 * Narrow helper for transaction type checks.
 * Useful for validation and conditional UI logic.
 */
export function isSavingType(type: TxType): boolean {
  return type === "SAVING";
}
