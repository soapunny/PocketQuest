import { canonicalCategoryKeyForServer } from "../../../../../../packages/shared/src/transactions/categories";
// apps/mobile/src/app/domain/categories/categoryLabels.ts

/**
 * Convert canonical category keys (server-defined) into
 * human-readable, localized labels for display.
 *
 * - Server always sends canonical keys (e.g. "groceries", "rent")
 * - Client maps keys -> labels based on language
 * - Unknown keys fall back to a humanized version of the key
 */
export function categoryLabelText(
  categoryKey: string,
  language: string | null | undefined,
): string {
  const key = (categoryKey ?? "").trim();
  if (!key) return language === "ko" ? "미분류" : "Uncategorized";

  const k = key.toLowerCase();

  // Canonical keys -> English labels
  const en: Record<string, string> = {
    uncategorized: "Uncategorized",
    groceries: "Groceries",
    rent: "Rent",
    utilities: "Utilities",
    gas: "Gas",
    dining: "Dining",
    restaurant: "Dining",
    transport: "Transport",
    transportation: "Transport",
    shopping: "Shopping",
    entertainment: "Entertainment",
    health: "Health",
    medical: "Medical",
    insurance: "Insurance",
    education: "Education",
    travel: "Travel",
    subscriptions: "Subscriptions",
    misc: "Misc",
  };

  // Canonical keys -> Korean labels
  const ko: Record<string, string> = {
    uncategorized: "미분류",
    groceries: "식료품",
    rent: "월세",
    utilities: "공과금",
    gas: "주유",
    dining: "외식",
    restaurant: "외식",
    transport: "교통",
    transportation: "교통",
    shopping: "쇼핑",
    entertainment: "오락",
    health: "건강",
    medical: "의료",
    insurance: "보험",
    education: "교육",
    travel: "여행",
    subscriptions: "구독",
    misc: "기타",
  };

  const dict = language === "ko" ? ko : en;
  const mapped = dict[k];
  if (mapped) return mapped;

  // Fallback: make it human-friendly (e.g. "car_repair" -> "Car repair")
  const human = k.replace(/[_-]+/g, " ").trim();
  if (!human) return language === "ko" ? "미분류" : "Uncategorized";
  return human.charAt(0).toUpperCase() + human.slice(1);
}

export { canonicalCategoryKeyForServer };
