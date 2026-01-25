// apps/mobile/src/app/lib/currency.ts
// Centralized currency helpers for PocketQuest.
// We store money in MINOR units:
// - USD: cents
// - KRW: won

export type Currency = "USD" | "KRW";

export const CURRENCIES: readonly Currency[] = ["USD", "KRW"] as const;

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

export function currencySymbol(currency: Currency): string {
  return currency === "USD" ? "$" : "₩";
}

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
    return `${sign}${currencySymbol(currency)}${dollars.toFixed(2)}`;
  }

  // KRW: integer formatting (no decimals)
  // Use locale formatting for readability.
  const formatted = abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${sign}${currencySymbol(currency)}${formatted}`;
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

/**
 * Convert between currencies using a USD<->KRW fx rate.
 * fxUsdKrw means: 1 USD = fxUsdKrw KRW
 *
 * We only support USD <-> KRW for now.
 */
export function convertMinor(
  amountMinor: number,
  from: Currency,
  to: Currency,
  fxUsdKrw: number,
): number {
  if (from === to) return amountMinor;

  if (!Number.isFinite(fxUsdKrw) || fxUsdKrw <= 0) {
    throw new Error("convertMinor: fxUsdKrw must be a positive number");
  }

  // Convert to a floating "major" amount first, then to target minor.
  const fromScale = minorUnitScale(from);
  const toScale = minorUnitScale(to);

  // amount in major units
  const major = amountMinor / fromScale;

  let convertedMajor: number;
  if (from === "USD" && to === "KRW") {
    convertedMajor = major * fxUsdKrw;
  } else if (from === "KRW" && to === "USD") {
    convertedMajor = major / fxUsdKrw;
  } else {
    // Future-proof: if we add more currencies later.
    throw new Error(`convertMinor: unsupported pair ${from} -> ${to}`);
  }

  // Return integer minor units.
  return Math.round(convertedMajor * toScale);
}

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

  const scale = minorUnitScale(currency);

  if (currency === "USD") {
    // Limit to one dot
    const parts = cleaned.split(".");
    const normalized =
      parts.length <= 2 ? cleaned : `${parts[0]}.${parts.slice(1).join("")}`;
    const n = Number(normalized);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * scale);
  }

  // KRW: integer only
  const n = Number(cleaned.replace(/\./g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
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
