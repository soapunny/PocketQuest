// apps/mobile/src/app/domain/plan/period/types.ts

import type { PeriodType } from "../../../../../../../packages/shared/src/plans/types";

export type { PeriodType };

export type PeriodRange = {
  startISO: string; // YYYY-MM-DD (local date)
  endISO: string; // YYYY-MM-DD (exclusive, local date)
  periodType: PeriodType;
};

export type PeriodLabelKey = "this_week" | "this_2_weeks" | "this_month";
