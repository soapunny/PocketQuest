// apps/mobile/src/app/domain/categories/categoryMeta.ts

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

export type CategoryGroup =
  | "essentials"
  | "transport"
  | "lifestyle"
  | "health"
  | "finance"
  | "other";

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
