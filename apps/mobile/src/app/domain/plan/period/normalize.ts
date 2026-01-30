// apps/mobile/src/app/domain/plan/period/normalize.ts

export function getPlanPeriodType(
  plan: unknown,
): "WEEKLY" | "BIWEEKLY" | "MONTHLY" {
  if (!plan || typeof plan !== "object") return "MONTHLY";
  const v = (plan as { periodType?: unknown }).periodType;
  if (v === "WEEKLY" || v === "BIWEEKLY" || v === "MONTHLY") return v;
  return "MONTHLY";
}
