// apps/mobile/src/app/lib/period.ts
export type PeriodType = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

export type PeriodRange = {
  startISO: string; // YYYY-MM-DD
  endISO: string; // YYYY-MM-DD (inclusive)
  label: string; // "week" | "2 weeks" | "month"
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, days: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

function startOfISOWeekMonday(d: Date) {
  // Monday=1 ... Sunday=0 in JS. Convert so Monday is start.
  const day = d.getDay(); // 0..6, 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // go back to Monday
  return addDays(startOfDay(d), diff);
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0); // last day of month
}

export function getPeriodRange(
  periodType: PeriodType,
  today: Date = new Date(),
  // BIWEEKLY anchor: a Monday date string like "2025-01-06"
  anchorISO: string = "2025-01-06"
): PeriodRange {
  const t = startOfDay(today);

  if (periodType === "MONTHLY") {
    const s = startOfMonth(t);
    const e = endOfMonth(t);
    return { startISO: toISODate(s), endISO: toISODate(e), label: "month" };
  }

  if (periodType === "WEEKLY") {
    const s = startOfISOWeekMonday(t);
    const e = addDays(s, 6);
    return { startISO: toISODate(s), endISO: toISODate(e), label: "week" };
  }

  // BIWEEKLY
  const anchor = new Date(anchorISO + "T00:00:00");
  const startAnchor = startOfISOWeekMonday(anchor);
  const diffMs = startOfDay(t).getTime() - startAnchor.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const periodIndex = Math.floor(diffDays / 14);
  const s = addDays(startAnchor, periodIndex * 14);
  const e = addDays(s, 13);
  return { startISO: toISODate(s), endISO: toISODate(e), label: "2 weeks" };
}

export function isISODateInRange(
  dateISO: string,
  startISO: string,
  endISO: string
) {
  // dateISO could be "YYYY-MM-DD" or full ISO; normalize
  const d = dateISO.slice(0, 10);
  return d >= startISO && d <= endISO;
}

export function periodLabelText(label: string) {
  // simple English label for now
  if (label === "2 weeks") return "This 2 weeks";
  if (label === "month") return "This month";
  return "This week";
}
