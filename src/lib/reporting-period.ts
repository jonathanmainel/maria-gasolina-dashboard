import type { DateRange } from "../types";

export function reportingToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (name: string) => parts.find(part => part.type === name)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function shiftReportingDay(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function initialReportingRange(now = new Date()): DateRange {
  const end = shiftReportingDay(reportingToday(now), -1);
  return { start: shiftReportingDay(end, -29), end };
}
export const todayReportingRange = (today: string): DateRange => ({ start: today, end: today });
