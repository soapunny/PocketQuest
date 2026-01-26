// apps/server/src/lib/categories.ts
// Central source of truth for category keys used by server validation.

// zod schemas for validating incoming category keys
import { z } from "zod";

export const EXPENSE_CATEGORY_KEYS = [
  "groceries",
  "dining",
  "rent",
  "utilities",
  "transportation",
  "shopping",
  "healthcare",
  "entertainment",
  "education",
  "subscriptions",
  "insurance",
  "travel",
  "gift",
  "misc_expense",
] as const;

export const INCOME_CATEGORY_KEYS = [
  "salary",
  "bonus",
  "interest",
  "investment",
  "refund",
  "gift_income",
  "misc_income",
] as const;

export const SAVING_CATEGORY_KEY = "savings" as const;

export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORY_KEYS)[number];
export type IncomeCategoryKey = (typeof INCOME_CATEGORY_KEYS)[number];
export type CategoryKey =
  | ExpenseCategoryKey
  | IncomeCategoryKey
  | typeof SAVING_CATEGORY_KEY;

export function isExpenseCategoryKey(x: string): x is ExpenseCategoryKey {
  return (EXPENSE_CATEGORY_KEYS as readonly string[]).includes(x);
}

export function isIncomeCategoryKey(x: string): x is IncomeCategoryKey {
  return (INCOME_CATEGORY_KEYS as readonly string[]).includes(x);
}

export function isCategoryKey(x: string): x is CategoryKey {
  return (
    isExpenseCategoryKey(x) ||
    isIncomeCategoryKey(x) ||
    x === SAVING_CATEGORY_KEY
  );
}

export const ALL_CATEGORY_KEYS = [
  ...EXPENSE_CATEGORY_KEYS,
  ...INCOME_CATEGORY_KEYS,
  SAVING_CATEGORY_KEY,
] as const;

type NonEmptyStringTuple = readonly [string, ...string[]];

type ZodEnumTuple = [string, ...string[]];

function zEnumFromKeys<T extends NonEmptyStringTuple>(keys: T) {
  // z.enum expects a *mutable* non-empty tuple type. Our keys are `readonly` via `as const`.
  // Cast through `unknown` to acknowledge the intentional conversion.
  return z.enum(keys as unknown as ZodEnumTuple);
}

export const expenseCategoryKeySchema = zEnumFromKeys(EXPENSE_CATEGORY_KEYS);
export const incomeCategoryKeySchema = zEnumFromKeys(INCOME_CATEGORY_KEYS);

export type ExpenseCategoryKeySchema = z.infer<typeof expenseCategoryKeySchema>;
export type IncomeCategoryKeySchema = z.infer<typeof incomeCategoryKeySchema>;
