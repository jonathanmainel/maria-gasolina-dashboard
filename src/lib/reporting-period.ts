import type { DateRange } from "../types";

export type PeriodPreset = "mtd" | "fixed";
export const reportingTimeZone = "America/Sao_Paulo";
const calendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: reportingTimeZone, year: "numeric", month: "2-digit", day: "2-digit",
});
const dayMs = 86_400_000;
const calendarTime = (day: string) => Date.parse(`${day}T00:00:00Z`);

export function reportingToday(now = new Date()): string {
  const parts = calendar.formatToParts(now);
  const value = (name: string) => parts.find(part => part.type === name)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function shiftReportingDay(day: string, days: number) {
  return new Date(calendarTime(day) + days * dayMs).toISOString().slice(0, 10);
}

export function nextReportingMidnight(now: number, today = reportingToday(new Date(now))) {
  // Find the first instant of the new civil day, including when a time-zone
  // offset changes at midnight. The search only runs when arming the timer.
  let before = now;
  let after = now + 26 * 60 * 60_000;
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (reportingToday(new Date(middle)) === today) before = middle;
    else after = middle;
  }
  return after;
}

export const monthToDate = (today: string): DateRange => ({ start: `${today.slice(0, 7)}-01`, end: today });
export const initialReportingRange = (now = new Date()): DateRange => monthToDate(reportingToday(now));
export const todayReportingRange = (today: string): DateRange => ({ start: today, end: today });
export const reportingDays = (range: DateRange) => (calendarTime(range.end) - calendarTime(range.start)) / dayMs + 1;

export function comparisonPeriod(range: DateRange, preset: PeriodPreset = "fixed") {
  const currentDays = reportingDays(range);
  const lastDayBeforeStart = shiftReportingDay(range.start, -1);
  const previous = preset === "mtd"
    ? {
        start: monthToDate(lastDayBeforeStart).start,
        end: shiftReportingDay(monthToDate(lastDayBeforeStart).start, Math.min(currentDays, Number(lastDayBeforeStart.slice(-2))) - 1),
      }
    : { start: shiftReportingDay(lastDayBeforeStart, 1 - currentDays), end: lastDayBeforeStart };
  return { previous, currentDays, previousDays: reportingDays(previous) };
}
