// packages/shared/src/money/types.ts
import { z } from "zod";

export const CURRENCY_VALUES = ["USD", "KRW"] as const;
export type Currency = (typeof CURRENCY_VALUES)[number];

export const currencySchema = z.enum(
  CURRENCY_VALUES as unknown as [string, ...string[]]
);
