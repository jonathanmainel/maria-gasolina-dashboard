import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compact, money, percent, shortDate } from "../lib/format";
import type { AnalyticsDailyMetric, DailyMetric, OverviewMetric, Source } from "../types";

const performanceMetrics: Array<{ id: OverviewMetric; label: string }> = [
  { id: "spend", label: "Investimento" },
  { id: "results", label: "Resultados" },
  { id: "cost_per_result", label: "Custo por resultado" },
];

const analyticsMetrics = [
  { id: "sessions", label: "Sessões" },
  { id: "active_users", label: "Usuários" },
  { id: "generate_leads", label: "Conversões" },
] as const;

interface PerformanceChartPoint {
  label: string;
  value?: number | null;
  google?: number | null;
  meta?: number | null;
}

function performanceValue(item: DailyMetric, metric: OverviewMetric) {
  if (metric === "cost_per_result") return item.results ? item.spend / item.results : null;
  return item[metric];
}

function formatPerformance(value: number, metric: OverviewMetric) {
  if (metric === "spend" || metric === "cost_per_result") return money(value);
  return compact(value);
}

export function PerformanceHeroChart({ daily, source }: { daily: DailyMetric[]; source?: Source }) {
  const [metric, setMetric] = useState<OverviewMetric>("spend");
  const data = useMemo<PerformanceChartPoint[]>(() => {
    if (source) {
      return daily.filter((item) => item.source === source).map((item) => ({
        label: shortDate(item.date),
        value: performanceValue(item, metric),
      }));
    }

    const grouped = new Map<string, { label: string; google: number | null; meta: number | null }>();
    daily.forEach((item) => {
      const entry = grouped.get(item.date) ?? { label: shortDate(item.date), google: null, meta: null };
      if (item.source === "google_ads") entry.google = performanceValue(item, metric);
      if (item.source === "meta_ads") entry.meta = performanceValue(item, metric);
      grouped.set(item.date, entry);
    });
    return [...grouped.values()];
  }, [daily, metric, source]);

  const singleColor = source === "meta_ads" ? "#d7982b" : "#9d2a1e";

  return (
    <article className="hero-chart-card">
      <div className="hero-chart-head">
        <div>
          <h2>{source ? "Evolução de performance" : "Evolução por canal"}</h2>
          <p>{source ? "Desempenho diário dentro do canal" : "Google Ads e Meta Ads no período selecionado"}</p>
        </div>
        <div className="metric-tabs" aria-label="Métrica do gráfico">
          {performanceMetrics.map((item) => (
            <button key={item.id} type="button" className={metric === item.id ? "active" : ""} onClick={() => setMetric(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="hero-chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 18, right: 16, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="googleFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9d2a1e" stopOpacity={0.2} /><stop offset="100%" stopColor="#9d2a1e" stopOpacity={0.02} /></linearGradient>
              <linearGradient id="metaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d7982b" stopOpacity={0.22} /><stop offset="100%" stopColor="#d7982b" stopOpacity={0.02} /></linearGradient>
              <linearGradient id="singleFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={singleColor} stopOpacity={0.22} /><stop offset="100%" stopColor={singleColor} stopOpacity={0.02} /></linearGradient>
            </defs>
            <CartesianGrid stroke="#e9eeef" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#71838c", fontSize: 11 }} dy={10} />
            <YAxis tickLine={false} axisLine={false} width={72} tick={{ fill: "#839198", fontSize: 10 }} tickFormatter={(value) => metric === "results" ? compact(Number(value)) : money(Number(value)).replace(",00", "")} />
            <Tooltip formatter={(value, name) => [formatPerformance(Number(value), metric), String(name)]} contentStyle={{ borderRadius: 12, border: "1px solid #dfe6e8", boxShadow: "0 12px 28px rgba(36,56,66,.12)", fontSize: 12 }} />
            {!source && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 16 }} />}
            {source ? (
              <Area type="monotone" dataKey="value" name={source === "google_ads" ? "Google Ads" : "Meta Ads"} stroke={singleColor} strokeWidth={3} fill="url(#singleFill)" activeDot={{ r: 5 }} />
            ) : (
              <>
                <Area type="monotone" dataKey="google" name="Google Ads" stroke="#9d2a1e" strokeWidth={3} fill="url(#googleFill)" activeDot={{ r: 5 }} connectNulls />
                <Area type="monotone" dataKey="meta" name="Meta Ads" stroke="#d7982b" strokeWidth={3} fill="url(#metaFill)" activeDot={{ r: 5 }} connectNulls />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

export function AnalyticsPerformanceChart({ daily }: { daily: AnalyticsDailyMetric[] }) {
  const [metric, setMetric] = useState<(typeof analyticsMetrics)[number]["id"]>("sessions");
  const data = daily.map((item) => ({ ...item, label: shortDate(item.date) }));

  return (
    <article className="hero-chart-card analytics-hero-chart">
      <div className="hero-chart-head">
        <div><h2>Evolução do site</h2><p>Aquisição, usuários e conversões registradas no GA4</p></div>
        <div className="metric-tabs" aria-label="Métrica do gráfico">
          {analyticsMetrics.map((item) => <button key={item.id} type="button" className={metric === item.id ? "active" : ""} onClick={() => setMetric(item.id)}>{item.label}</button>)}
        </div>
      </div>
      <div className="hero-chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 18, right: 16, left: 4, bottom: 0 }}>
            <defs><linearGradient id="analyticsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d7982b" stopOpacity={0.28} /><stop offset="100%" stopColor="#d7982b" stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid stroke="#e9eeef" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#71838c", fontSize: 11 }} dy={10} />
            <YAxis tickLine={false} axisLine={false} width={60} tick={{ fill: "#839198", fontSize: 10 }} tickFormatter={(value) => compact(Number(value))} />
            <Tooltip formatter={(value) => compact(Number(value))} contentStyle={{ borderRadius: 12, border: "1px solid #dfe6e8", boxShadow: "0 12px 28px rgba(36,56,66,.12)", fontSize: 12 }} />
            <Area type="monotone" dataKey={metric} name={analyticsMetrics.find((item) => item.id === metric)?.label} stroke="#d7982b" strokeWidth={3} fill="url(#analyticsFill)" activeDot={{ r: 5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

export function RateSummary({ current, previous }: { current: number | null; previous: number | null }) {
  return <span>{percent(current)}{previous != null && <small> antes {percent(previous)}</small>}</span>;
}
