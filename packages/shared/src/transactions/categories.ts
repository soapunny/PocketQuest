// packages/shared/src/transactions/categories.ts

/**
 * Shared (client/server) category keys.
 *
 * IMPORTANT:
 * - These are canonical keys validated by the server.
 * - Mobile/web clients must send these keys to the API.
 * - UI labels live in the app layer (e.g. mobile `categoryLabels.ts`).
 */

import type { TxType } from "./types";

// Canonical EXPENSE category keys (server-validated)
export const EXPENSE_CATEGORY_KEYS = [
  "groceries",
  "rent",
  "utilities",
  "gas",
  "dining",
  "transport",
  "shopping",
  "entertainment",
  "health",
  "insurance",
  "education",
  "travel",
  "subscriptions",
  "misc",
  // Expense fallback category (replaces legacy "uncategorized")
  "other",
] as const;

export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORY_KEYS)[number];

// Canonical INCOME category keys (server-validated)
// NOTE: adjust this list to match the server allowlist.
export const INCOME_CATEGORY_KEYS = [
  "salary",
  "bonus",
  "interest",
  "refund",
  "gift",
  "other",
] as const;

export type IncomeCategoryKey = (typeof INCOME_CATEGORY_KEYS)[number];

export type CategoryKey = ExpenseCategoryKey | IncomeCategoryKey | "savings";

// Common aliases from legacy UI / user-facing labels -> canonical keys.
// Keep this minimal and stable.
const ALIASES: Record<string, string> = {
  // expense aliases
  uncategorized: "other",
  restaurant: "dining",
  transportation: "transport",
  medical: "health",
  miscellaneous: "misc",

  // income aliases
  paycheck: "salary",
  wages: "salary",
  other_income: "other",
};

export function isExpenseCategoryKey(k: string): k is ExpenseCategoryKey {
  return (EXPENSE_CATEGORY_KEYS as readonly string[]).includes(k);
}

export function isIncomeCategoryKey(k: string): k is IncomeCategoryKey {
  return (INCOME_CATEGORY_KEYS as readonly string[]).includes(k);
}

/**
 * Canonicalize a category key into the server-accepted canonical key.
 *
 * - trims whitespace
 * - lowercases
 * - folds known aliases
 * - returns "other" when empty (EXPENSE), "other" (INCOME), "savings" (SAVING)
 *
 * This does NOT validate that the final key is in the allowlist.
 * Validation should happen at the server boundary.
 */
export function canonicalCategoryKeyForServer(
  raw: string,
  type?: TxType
): string {
  const key = String(raw ?? "").trim();

  // If caller omitted category:
  // - EXPENSE default (legacy "uncategorized" -> "other")
  // - INCOME defaults to "other"
  // - SAVING uses stable literal "savings" (goal id is sent separately)
  if (!key) {
    if (type === "INCOME") return "other";
    if (type === "SAVING") return "savings";
    // EXPENSE default (legacy "uncategorized" -> "other")
    return "other";
  }

  const k0 = key.toLowerCase();
  const k = ALIASES[k0] ?? k0;

  // For SAVING transactions, category is a stable literal "savings"
  // (the goal ID is sent separately).
  if (type === "SAVING") return "savings";

  return k;
}
