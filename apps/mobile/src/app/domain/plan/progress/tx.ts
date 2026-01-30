// apps/mobile/src/app/domain/plan/progress/tx.ts

import type { Currency } from "../../../../../../../packages/shared/src/money/types";
import { absMinor, convertMinor } from "../../money";

export function txToHomeMinor(tx: any, homeCurrency: Currency): number {
  const raw = String(tx?.currency ?? "").toUpperCase();
  const currency: Currency = raw === "KRW" ? "KRW" : "USD";

  // Prefer new field; fallback to legacy amountHomeMinor
  const amountMinorRaw =
    typeof tx?.amountMinor === "number"
      ? tx.amountMinor
      : typeof (tx as any)?.amountHomeMinor === "number"
        ? (tx as any).amountHomeMinor
        : 0;

  const absAmount = absMinor(amountMinorRaw);
  if (currency === homeCurrency) return absAmount;

  const fx = typeof tx?.fxUsdKrw === "number" ? tx.fxUsdKrw : NaN;
  // If FX missing/invalid, ignore tx in totals (avoid lying)
  if (!Number.isFinite(fx) || fx <= 0) return 0;

  return absMinor(convertMinor(absAmount, currency, homeCurrency, fx));
}

export function txToHomeAbsMinor(tx: any, homeCurrency: Currency): number {
  return absMinor(txToHomeMinor(tx, homeCurrency));
}
