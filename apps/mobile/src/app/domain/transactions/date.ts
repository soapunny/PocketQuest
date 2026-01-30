// apps/mobile/src/app/domain/transactions/date.ts

export function getTxISODate(tx: unknown): string {
  return String(
    (tx as any).occurredAtISO ??
      (tx as any).occurredAtLocalISO ?? // 너희가 쓰는 쪽 우선순위에 맞춰 조정
      (tx as any).dateISO ??
      (tx as any).createdAtISO ??
      (tx as any).createdAt ??
      "",
  );
}
