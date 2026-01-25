// apps/mobile/src/app/domain/categories/index.ts

// apps/mobile/src/app/domain/categories/index.ts
//
// Barrel exports for the Categories domain.
// Policy:
// - Keep this file as re-exports only (no logic).
// - Category canonical keys come from the server (Policy B).
// - UI-facing labels live in categoryLabels.ts (language-aware).
// - UI metadata (icon/color/order, etc.) lives in categoryMeta.ts.

export { categoryLabelText } from "./categoryLabels";
export {
  getCategoryMeta,
  CATEGORY_META,
  DEFAULT_CATEGORY_META,
  type CategoryMeta,
} from "./categoryMeta";

// Optional shared types/helpers (only if they exist).
// If these files don't exist yet, it's safe to remove these exports.
// export type { CategoryKey } from "./categoryKeys";
// export { isCategoryKey, normalizeCategoryKey } from "./categoryKeys";
