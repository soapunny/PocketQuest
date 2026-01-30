// apps/mobile/src/app/lib/currency.ts
// Currency helpers (formatting / minor unit utilities).
import type {
  Currency,
  CURRENCY_VALUES as CURRENCIES,
} from "../../../../../../packages/shared/src/money/types";

// Minor unit scale for each currency.
// e.g., 1 USD = 100 cents, 1 KRW = 1 won
export const MINOR_UNIT_SCALE: Record<Currency, number> = {
  USD: 100,
  KRW: 1,
};

export function isCurrency(v: unknown): v is Currency {
  return v === "USD" || v === "KRW";
}

export function minorUnitScale(currency: Currency): number {
  return MINOR_UNIT_SCALE[currency];
}

export function getCurrencySymbol(currency: Currency): string {
  return currency === "USD" ? "$" : "₩";
}
