// packages/shared/src/money/types.ts
export const CURRENCY_VALUES = ["USD", "KRW"] as const;
export type Currency = (typeof CURRENCY_VALUES)[number];
