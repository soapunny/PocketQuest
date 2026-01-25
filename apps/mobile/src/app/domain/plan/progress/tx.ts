import type { Currency } from "../../money/currency";
import { convertMinor } from "../../money/currency";

export function isSavingsTx(tx: any): boolean {
  const cat = String(tx?.category || "").toLowerCase();
  if (tx?.type === "EXPENSE") return false;
  if (cat.includes("savings") || cat.includes("save")) return true;
  return tx?.type === "SAVING" || tx?.type === "SAVINGS";
}

export function absMinor(n: any): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.abs(v);
}

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

