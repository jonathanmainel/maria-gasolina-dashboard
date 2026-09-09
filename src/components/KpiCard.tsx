import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { delta } from "../lib/format";

interface Props {
  label: string;
  value: string;
  current?: number | null;
  previous?: number | null;
  previousValue?: string;
  accent?: "navy" | "red" | "gold";
}

export function KpiCard({ label, value, current, previous, previousValue, accent = "navy" }: Props) {
  const change = delta(current, previous);
  const neutral = change == null;
  const positive = (change ?? 0) >= 0;
  const Icon = neutral ? Minus : positive ? ArrowUpRight : ArrowDownRight;
  return (
    <article className={`kpi-card kpi-${accent}`}>
      <div className="kpi-topline" />
      <p>{label}</p>
      <div className="kpi-value-row">
        <strong>{value}</strong>
        <span className={`comparison ${neutral ? "neutral" : positive ? "positive" : "negative"}`}>
          <Icon size={13} strokeWidth={2.4} />
          {neutral ? "sem comparação" : `${Math.abs(change!).toFixed(1).replace(".", ",")}%`}
        </span>
      </div>
      {previousValue && previous != null && previous !== 0 && <small>{previousValue} no período anterior</small>}
    </article>
  );
}
