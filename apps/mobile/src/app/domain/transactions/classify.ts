// apps/mobile/src/app/domain/transactions/classify.ts

export function isSavingsTx(tx: any): boolean {
  const cat = String(tx?.category || "").toLowerCase();
  if (tx?.type === "EXPENSE") return false;
  if (cat.includes("savings") || cat.includes("save")) return true;
  return tx?.type === "SAVING" || tx?.type === "SAVINGS";
}
