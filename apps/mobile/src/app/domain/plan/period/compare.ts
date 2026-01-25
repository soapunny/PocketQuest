export function isISOInRange(
  dateISO: string,
  startISO: string,
  endISO: string,
): boolean {
  const d = String(dateISO ?? "").slice(0, 10);
  const s = String(startISO ?? "").slice(0, 10);
  const e = String(endISO ?? "").slice(0, 10);
  // half-open: [startISO, endISO)
  return d >= s && d < e;
}

