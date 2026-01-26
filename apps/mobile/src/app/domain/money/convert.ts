import { Currency, minorUnitScale } from "./currency";

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
  fxUsdKrw: number
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
