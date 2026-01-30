import { minorUnitScale } from "./currency";
import type { Currency } from "../../../../../../packages/shared/src/money/types";

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
