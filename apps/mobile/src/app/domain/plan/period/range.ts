import type { PeriodRange, PeriodType } from "./types";

export function normalizeISODate(isoLike: string): string {
  const s = String(isoLike ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`Invalid ISO date (expected YYYY-MM-DD): ${isoLike}`);
  }
  return s;
}

function pickFirst(plan: any, keys: string[]): any {
  for (const k of keys) {
    const v = plan?.[k];
    if (typeof v === "string" && v.trim()) return v;
    if (v instanceof Date) return v;
  }
  return null;
}

export function getPlanPeriodRange(plan: any): PeriodRange {
  const periodType = plan?.periodType as PeriodType | undefined;
  if (!periodType) {
    throw new Error("Missing plan.periodType");
  }

  const startRaw = pickFirst(plan, [
    "periodStartISO",
    "periodStartLocalISO",
    "periodStartDateISO",
    "periodStartLocal",
    "periodStartDate",
    "periodStart",
  ]);

  const endRaw = pickFirst(plan, [
    "periodEndISO",
    "periodEndLocalISO",
    "periodEndDateISO",
    "periodEndLocal",
    "periodEndDate",
    "periodEnd",
  ]);

  if (!startRaw || !endRaw) {
    throw new Error("Missing period start/end on plan");
  }

  const startISO =
    startRaw instanceof Date ? normalizeISODate(startRaw.toISOString()) : normalizeISODate(String(startRaw));
  const endISO =
    endRaw instanceof Date ? normalizeISODate(endRaw.toISOString()) : normalizeISODate(String(endRaw));

  return { startISO, endISO, periodType };
}

export function getActivePeriodRangeFromBootstrap(bootstrap: any): PeriodRange {
  const plan =
    bootstrap?.activePlan ??
    bootstrap?.plan ??
    bootstrap?.data?.activePlan ??
    bootstrap?.data?.plan ??
    null;

  if (!plan) {
    throw new Error("Missing active plan in bootstrap payload");
  }

  return getPlanPeriodRange(plan);
}

