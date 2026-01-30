// apps/mobile/src/app/domain/money/input.ts

import type { Currency } from "../../../../../../packages/shared/src/money/types";

/**
 * Safe parse for numeric input strings.
 * - Strips commas/spaces.
 * - Allows digits and at most one dot for USD.
 * - Returns minor units (integer).
 */
export function parseInputToMinor(input: string, currency: Currency): number {
  const raw = (input ?? "").trim();
  if (!raw) return 0;

  // Keep digits and dot only (for USD). Remove commas/spaces/currency symbols.
  const cleaned = raw.replace(/[^0-9.\-]/g, "");

  // Avoid just '-' or '.'
  if (cleaned === "-" || cleaned === "." || cleaned === "-.") return 0;

  if (currency === "USD") {
    // Limit to one dot
    const parts = cleaned.split(".");
    const normalized =
      parts.length <= 2 ? cleaned : `${parts[0]}.${parts.slice(1).join("")}`;
    const n = Number(normalized);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }

  // KRW: integer only (strip dots just in case)
  const n = Number(cleaned.replace(/\./g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

export function formatAmountTextFromMinor(
  amountMinor: number,
  currency: Currency,
): string {
  const abs = Math.abs(amountMinor);
  if (currency === "KRW") return String(Math.round(abs));
  return (abs / 100).toFixed(2);
}

export function getPlaceholderForCurrency(currency: Currency) {
  return currency === "KRW" ? "0" : "0.00";
}
