// apps/mobile/src/app/domain/money/format.ts

import type { Currency } from "../../../../../../packages/shared/src/money/types";
import { getCurrencySymbol, minorUnitScale } from "../money";

/**
 * Format an amount in minor units to a user-facing string.
 * - USD -> $12.34
 * - KRW -> ₩12345
 */
export function formatMoney(amountMinor: number, currency: Currency): string {
  const scale = minorUnitScale(currency);
  const sign = amountMinor < 0 ? "-" : "";
  const abs = Math.abs(amountMinor);

  if (currency === "USD") {
    const dollars = abs / scale;
    // Always show 2 decimals for USD.
    return `${sign}${getCurrencySymbol(currency)}${dollars.toFixed(2)}`;
  }

  // KRW: integer formatting (no decimals)
  // Use locale formatting for readability.
  const formatted = abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${sign}${getCurrencySymbol(currency)}${formatted}`;
}

/**
 * Like formatMoney(), but returns just the number string (no symbol).
 * Useful for inputs.
 */
export function formatMoneyNumber(
  amountMinor: number,
  currency: Currency,
): string {
  const scale = minorUnitScale(currency);
  const sign = amountMinor < 0 ? "-" : "";
  const abs = Math.abs(amountMinor);

  if (currency === "USD") {
    const dollars = abs / scale;
    return `${sign}${dollars.toFixed(2)}`;
  }

  return `${sign}${abs}`;
}

export function formatMoneyNoSymbol(minor: number, currency: Currency) {
  const s = formatMoney(minor, currency);
  if (currency === "KRW") return s.replace(/^₩\s?/, "");
  return s.replace(/^\$\s?/, "");
}

/**
 * For displaying ratios like Spent / Limit.
 */
export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Compute a percent (0..100) from a ratio. Can optionally cap at 100.
 */
export function ratioToPercent(ratio: number, capAt100 = true): number {
  const pct = Math.round((Number.isFinite(ratio) ? ratio : 0) * 100);
  if (!capAt100) return pct;
  return Math.max(0, Math.min(100, pct));
}
