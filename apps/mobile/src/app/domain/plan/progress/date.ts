function normalizeISODateOrNull(isoLike: any): string | null {
  const s = String(isoLike ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export function getTxISODate(tx: any): string | null {
  // Priority:
  // 1) tx.dateISO
  // 2) tx.occurredAtISO
  // 3) tx.occurredAt (Date or ISO string)
  // 4) tx.createdAtISO
  // 5) tx.createdAt
  const v =
    tx?.dateISO ??
    tx?.occurredAtISO ??
    tx?.occurredAt ??
    tx?.createdAtISO ??
    tx?.createdAt ??
    null;

  if (v == null) return null;
  if (v instanceof Date) return normalizeISODateOrNull(v.toISOString());
  return normalizeISODateOrNull(String(v));
}

