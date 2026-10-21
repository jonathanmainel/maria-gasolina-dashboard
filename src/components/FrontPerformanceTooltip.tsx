import { integer, money } from "../lib/format";
import type { FrontChartPoint } from "../lib/front-performance";

interface Props {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: FrontChartPoint }>;
}

// O CPL vem dos mesmos totais agrupados da série, sem uma terceira curva.
export function FrontPerformanceTooltip({ active, payload }: Props) {
  const point = payload?.find((entry) => entry.payload)?.payload;
  if (!active || !point) return null;
  return <div className="chart-tip" role="tooltip" aria-label="Leads e investimento do período">
    <strong>{point.period}</strong>
    <div><span><i style={{ background: "var(--gold)" }} />Leads</span><b>{integer(point.leads)}</b></div>
    <div><span><i style={{ background: "var(--green)" }} />Investimento</span><b>{money(point.spend)}</b></div>
    <div><span>CPL</span><b>{money(point.leads > 0 ? point.cpl : null)}</b></div>
  </div>;
}
