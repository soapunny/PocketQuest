// apps/mobile/src/app/domain/categories/categoryMeta.ts

/**
 * UI metadata for canonical category keys.
 *
 * Policy:
 * - Server sends canonical category keys (e.g. "groceries", "rent") (Policy B).
 * - Client uses meta purely for UI (icon/color/order/group). No business logic.
 * - Unknown keys must be handled gracefully via DEFAULT_CATEGORY_META.
 *
 * Notes:
 * - `icon` is an abstract icon name (map it to your icon library elsewhere).
 * - `colorToken` is a design token string (avoid hardcoded hex in domain when possible).
 */

import type { TxType } from "../../../../../../packages/shared/src/transactions/types";

export type CategoryGroup =
  | "essentials"
  | "transport"
  | "lifestyle"
  | "health"
  | "finance"
  | "other"
  | "income"
  | "savings";

export type CategoryMeta = {
  /** Canonical key from server (lowercase). */
  key: string;

  /** Icon identifier (library-agnostic). */
  icon: string;

  /** Design token (e.g. "blue-500"). */
  colorToken: string;

  /** Sorting priority (lower comes first). */
  order: number;

  /** Optional grouping for UI sections/filters. */
  group: CategoryGroup;

  /**
   * Which transaction types this category is allowed for.
   * If omitted, treat as EXPENSE-safe (backward compatible with existing meta map).
   */
  txTypes?: readonly TxType[];
};

export const DEFAULT_CATEGORY_META: CategoryMeta = {
  key: "uncategorized",
  icon: "tag",
  colorToken: "gray-500",
  order: 9999,
  group: "other",
};

/**
 * Canonical metadata map.
 * Keep keys lowercase. If you later introduce categoryKey normalization,
 * do it BEFORE calling `getCategoryMeta`.
 */
export const CATEGORY_META: Readonly<Record<string, CategoryMeta>> =
  Object.freeze({
    uncategorized: {
      key: "uncategorized",
      icon: "tag",
      colorToken: "gray-500",
      order: 9999,
      group: "other",
    },

    // Income
    paycheck: {
      key: "paycheck",
      icon: "cash",
      colorToken: "emerald-500",
      order: 5,
      group: "income",
      txTypes: ["INCOME"],
    },
    gift: {
      key: "gift",
      icon: "gift",
      colorToken: "fuchsia-500",
      order: 6,
      group: "income",
      txTypes: ["INCOME"],
    },
    bonus: {
      key: "bonus",
      icon: "sparkles",
      colorToken: "amber-500",
      order: 7,
      group: "income",
      txTypes: ["INCOME"],
    },
    interest: {
      key: "interest",
      icon: "percent",
      colorToken: "lime-500",
      order: 8,
      group: "income",
      txTypes: ["INCOME"],
    },

    // Savings (transaction category; savings goal is a separate concept)
    saving: {
      key: "saving",
      icon: "target",
      colorToken: "teal-500",
      order: 9,
      group: "savings",
      txTypes: ["SAVING"],
    },

    // Essentials
    groceries: {
      key: "groceries",
      icon: "shopping-cart",
      colorToken: "green-500",
      order: 10,
      group: "essentials",
    },
    rent: {
      key: "rent",
      icon: "home",
      colorToken: "indigo-500",
      order: 20,
      group: "essentials",
    },
    utilities: {
      key: "utilities",
      icon: "bolt",
      colorToken: "yellow-500",
      order: 30,
      group: "essentials",
    },

    // Transport
    gas: {
      key: "gas",
      icon: "fuel",
      colorToken: "orange-500",
      order: 40,
      group: "transport",
    },
    transport: {
      key: "transport",
      icon: "bus",
      colorToken: "blue-500",
      order: 50,
      group: "transport",
    },
    transportation: {
      key: "transportation",
      icon: "bus",
      colorToken: "blue-500",
      order: 51,
      group: "transport",
    },

    // Lifestyle
    dining: {
      key: "dining",
      icon: "utensils",
      colorToken: "rose-500",
      order: 60,
      group: "lifestyle",
    },
    restaurant: {
      key: "restaurant",
      icon: "utensils",
      colorToken: "rose-500",
      order: 61,
      group: "lifestyle",
    },
    shopping: {
      key: "shopping",
      icon: "bag",
      colorToken: "pink-500",
      order: 70,
      group: "lifestyle",
    },
    entertainment: {
      key: "entertainment",
      icon: "film",
      colorToken: "purple-500",
      order: 80,
      group: "lifestyle",
    },
    travel: {
      key: "travel",
      icon: "plane",
      colorToken: "cyan-500",
      order: 90,
      group: "lifestyle",
    },
    subscriptions: {
      key: "subscriptions",
      icon: "repeat",
      colorToken: "violet-500",
      order: 100,
      group: "lifestyle",
    },

    // Health
    health: {
      key: "health",
      icon: "heart",
      colorToken: "red-500",
      order: 110,
      group: "health",
    },
    medical: {
      key: "medical",
      icon: "stethoscope",
      colorToken: "red-500",
      order: 111,
      group: "health",
    },

    // Finance
    insurance: {
      key: "insurance",
      icon: "shield",
      colorToken: "teal-500",
      order: 120,
      group: "finance",
    },
    education: {
      key: "education",
      icon: "book",
      colorToken: "sky-500",
      order: 130,
      group: "other",
    },

    // Other
    misc: {
      key: "misc",
      icon: "dots-horizontal",
      colorToken: "gray-500",
      order: 9000,
      group: "other",
    },
  } satisfies Record<string, CategoryMeta>);

/**
 * Get UI metadata for a canonical category key.
 * - Always returns a safe value (never undefined).
 * - Trims and lowercases defensively to tolerate minor inconsistencies.
 */
export function getCategoryMeta(categoryKey: unknown): CategoryMeta {
  const raw = typeof categoryKey === "string" ? categoryKey : "";
  const key = raw.trim().toLowerCase();
  return (
    CATEGORY_META[key] ?? {
      ...DEFAULT_CATEGORY_META,
      key: key || "uncategorized",
    }
  );
}

/**
 * Get selectable canonical category keys for a given transaction type.
 * - Ordered by `order`
 * - Backward compatible: meta entries without `txTypes` are treated as EXPENSE-only
 * - Excludes "uncategorized" (fallback-only)
 */
export function getSelectableCategoryKeysByTxType(txType: TxType): string[] {
  const entries = Object.values(CATEGORY_META);

  const filtered = entries.filter((m) => {
    if (m.key === "uncategorized") return false;

    const allowed = m.txTypes;
    if (!allowed) return txType === "EXPENSE";
    return allowed.includes(txType);
  });

  filtered.sort((a, b) => a.order - b.order);

  // Ensure uniqueness and stable output
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of filtered) {
    const k = m.key;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

// Derived canonical key lists for common UI pickers.
// NOTE: These are convenience exports; the source of truth remains CATEGORY_META.
export const EXPENSE_CATEGORY_KEYS =
  getSelectableCategoryKeysByTxType("EXPENSE");
export const INCOME_CATEGORY_KEYS = getSelectableCategoryKeysByTxType("INCOME");
export const SAVING_CATEGORY_KEYS = getSelectableCategoryKeysByTxType("SAVING");
