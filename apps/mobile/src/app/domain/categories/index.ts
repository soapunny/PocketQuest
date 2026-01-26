// apps/mobile/src/app/domain/categories/index.ts
//
// Barrel exports for the Categories domain.
// Policy:
// - Keep this file as re-exports only (no logic).
// - Category canonical keys come from the server (Policy B).
// - UI-facing labels live in categoryLabels.ts (language-aware).
// - UI metadata (icon/color/order/group/txTypes) lives in categoryMeta.ts.

export { categoryLabelText } from "./categoryLabels";

export {
  CATEGORY_META,
  DEFAULT_CATEGORY_META,
  getCategoryMeta,
  getSelectableCategoryKeysByTxType,
  EXPENSE_CATEGORY_KEYS,
  INCOME_CATEGORY_KEYS,
  SAVING_CATEGORY_KEYS,
} from "./categoryMeta";

export type { CategoryGroup, TxType, CategoryMeta } from "./categoryMeta";
