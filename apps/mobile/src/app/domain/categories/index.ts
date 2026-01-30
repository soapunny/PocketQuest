// apps/mobile/src/app/domain/categories/index.ts
//
// Barrel exports for the Categories domain.
// Policy:
// - Keep this file as re-exports only (no logic).
// - Category canonical keys come from the server (Policy B).
// - UI-facing labels live in categoryLabels.ts (language-aware).
// - UI metadata (icon/color/order/group/txTypes) lives in categoryMeta.ts.

export * from "./categoryLabels";
export * from "./categoryMeta";
