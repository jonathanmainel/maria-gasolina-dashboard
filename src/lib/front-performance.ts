import { addDays, endOfMonth, format, parseISO, startOfWeek } from "date-fns";
import type { DateRange, FrontDaily } from "../types";
import { dailySeries, inRange, monthlySeries, weeklySeries } from "./metrics";
import { shortDate } from "./format";

export type FrontChartMode = "daily" | "weekly" | "monthly";
export interface FrontChartPoint {
  label: string;
  period: string;
  leads: number;
  spend: number;
  cpl: number | null;
}

const iso = (date: Date) => format(date, "yyyy-MM-dd");
const periodLabel = (start: string, end = start) => {
  const full = (date: string) => format(parseISO(date), "dd/MM/yyyy");
  return start === end ? full(start) : `${full(start)} a ${full(end)}`;
};

// Somente o gráfico principal comercial. Reutiliza os agregadores existentes,
// sem alterar os cards, a comparação ou o gráfico menor de leads por semana.
export function frontPerformanceSeries(rows: FrontDaily[], range: DateRange, mode: FrontChartMode): FrontChartPoint[] {
  const selected = inRange(rows, range);
  if (mode === "daily") return dailySeries(selected).map((day) => ({
    label: shortDate(day.date), period: periodLabel(day.date), leads: day.leads, spend: day.spend, cpl: day.cpl,
  }));
  if (mode === "monthly") return monthlySeries(selected).map((month) => {
    const first = `${month.key}-01`;
    const last = iso(endOfMonth(parseISO(first)));
    return { label: month.label, period: periodLabel(range.start > first ? range.start : first, range.end < last ? range.end : last), leads: month.leads, spend: month.spend, cpl: month.cpl };
  });

  // Datas sem hora permanecem no calendario local do dashboard; nao converter
  // para UTC. Cada registro entra uma vez na semana de segunda a domingo.
  // O filtro e aplicado antes de agrupar e os rotulos respeitam seus limites.
  const buckets = new Map<string, FrontDaily[]>();
  for (const row of selected) {
    const monday = iso(startOfWeek(parseISO(row.date), { weekStartsOn: 1 }));
    const bucket = buckets.get(monday) ?? [];
    bucket.push(row);
    buckets.set(monday, bucket);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([monday, bucket]) => {
    const sunday = iso(addDays(parseISO(monday), 6));
    const first = monday < range.start ? range.start : monday;
    const last = sunday > range.end ? range.end : sunday;
    // No maximo sete datas: reutiliza a soma e o CPL dos totais existentes.
    const [week] = weeklySeries(bucket);
    const label = first === last ? shortDate(first) : `${shortDate(first)}–${shortDate(last)}`;
    return { label, period: periodLabel(first, last), leads: week.leads, spend: week.spend, cpl: week.cpl };
  });
}
