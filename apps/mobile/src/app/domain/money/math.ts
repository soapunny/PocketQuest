// apps/mobile/src/app/domain/money/math.ts

export function absMinor(n: any): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.abs(v);
}
