import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { delta } from "../lib/format";

interface Props {
  label: string;
  value: string;
  current?: number | null;
  previous?: number | null;
  previousValue?: string;
  accent?: "navy" | "red" | "gold";
  icon?: React.ReactNode;
  lowerIsBetter?: boolean;
}

export function KpiCard({ label, value, current, previous, previousValue, accent = "navy", icon, lowerIsBetter = false }: Props) {
  const change = delta(current, previous);
  const neutral = change == null;
  const increasing = (change ?? 0) >= 0;
  const favorable = lowerIsBetter ? (change ?? 0) <= 0 : increasing;
  const Icon = neutral ? Minus : increasing ? ArrowUpRight : ArrowDownRight;
  return (
    <article className={`kpi-card kpi-${accent}`}>
      <div className="kpi-topline" />
      {icon && <span className="kpi-icon">{icon}</span>}
      <div className="kpi-copy">
        <p>{label}</p>
        <div className="kpi-value-row">
          <strong>{value}</strong>
          <span className={`comparison ${neutral ? "neutral" : favorable ? "positive" : "negative"}`}>
            <Icon size={13} strokeWidth={2.4} />
            {neutral ? "sem comparação" : `${Math.abs(change!).toFixed(1).replace(".", ",")}%`}
          </span>
        </div>
        {previousValue && previous != null && previous !== 0 && <small>{previousValue} no período anterior</small>}
      </div>
    </article>
  );
}
