// apps/mobile/src/app/domain/plan/period/periodLabels.ts

import type { PeriodLabelKey, PeriodType } from "./types";

export function getPeriodLabelKey(periodType: PeriodType): PeriodLabelKey {
  if (periodType === "BIWEEKLY") return "this_2_weeks";
  if (periodType === "MONTHLY") return "this_month";
  return "this_week";
}

export function periodLabelText(key: PeriodLabelKey): string {
  if (key === "this_2_weeks") return "This 2 weeks";
  if (key === "this_month") return "This month";
  return "This week";
}
