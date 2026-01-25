export type PeriodType = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

export type PeriodRange = {
  startISO: string; // YYYY-MM-DD (local date)
  endISO: string; // YYYY-MM-DD (exclusive, local date)
  periodType: PeriodType;
};

export type PeriodLabelKey = "this_week" | "this_2_weeks" | "this_month";

