import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyticsDailyMetric, DailyMetric, Source } from "../types";
import { money, percent, shortDate } from "../lib/format";

interface Props { daily: DailyMetric[]; source: Source }

export function DashboardCharts({ daily, source }: Props) {
  const data = daily.filter((item) => item.source === source).map((item) => ({
    ...item,
    label: shortDate(item.date),
    ctr: item.impressions ? (item.clicks * 100) / item.impressions : 0,
    cpc: item.clicks ? item.spend / item.clicks : 0,
  }));

  const chartColor = source === "google_ads" ? "#324552" : "#1877f2";
  const gold = "#d7982b";

  return (
    <div className="charts-grid">
      <ChartCard title="Cliques e CTR">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 12, right: 12, left: -22, bottom: 0 }}>
            <CartesianGrid stroke="#eef1f3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#7a8991", fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "#9aa6ac", fontSize: 10 }} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #dfe4e7", fontSize: 12 }} />
            <Line dataKey="clicks" name="Cliques" type="monotone" stroke={chartColor} strokeWidth={2.5} dot={{ r: 3 }} />
            <Line dataKey="ctr" name="CTR (%)" type="monotone" stroke={gold} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Resultados">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 12, right: 12, left: -22, bottom: 0 }}>
            <CartesianGrid stroke="#eef1f3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#7a8991", fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "#9aa6ac", fontSize: 10 }} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #dfe4e7", fontSize: 12 }} />
            <Line dataKey="results" name="Resultados" type="monotone" stroke="#9d2a1e" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Investimento e CPC">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 12, right: 12, left: -14, bottom: 0 }}>
            <CartesianGrid stroke="#eef1f3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#7a8991", fontSize: 11 }} />
            <YAxis tickFormatter={(value) => `R$ ${value}`} tickLine={false} axisLine={false} tick={{ fill: "#9aa6ac", fontSize: 10 }} />
            <Tooltip formatter={(value, name) => name === "CPC" ? money(Number(value)) : money(Number(value))} contentStyle={{ borderRadius: 8, border: "1px solid #dfe4e7", fontSize: 12 }} />
            <Line dataKey="spend" name="Investimento" type="monotone" stroke={chartColor} strokeWidth={2.5} dot={{ r: 3 }} />
            <Line dataKey="cpc" name="CPC" type="monotone" stroke={gold} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

export function AnalyticsCharts({ daily }: { daily: AnalyticsDailyMetric[] }) {
  const data = daily.map((item) => ({ ...item, label: shortDate(item.date) }));

  return (
    <div className="charts-grid analytics-charts">
      <ChartCard title="Sessões e sessões engajadas">
        <AnalyticsLineChart data={data} lines={[
          { key: "sessions", name: "Sessões", color: "#e37400" },
          { key: "engaged_sessions", name: "Sessões engajadas", color: "#d7982b" },
        ]} />
      </ChartCard>
      <ChartCard title="Usuários">
        <AnalyticsLineChart data={data} lines={[
          { key: "active_users", name: "Usuários ativos", color: "#324552" },
          { key: "new_users", name: "Novos usuários", color: "#9d2a1e" },
        ]} />
      </ChartCard>
      <ChartCard title="Eventos do site">
        <AnalyticsLineChart data={data} lines={[
          { key: "page_views", name: "page_view", color: "#324552" },
          { key: "scrolls", name: "scroll", color: "#d7982b" },
          { key: "generate_leads", name: "form_submit", color: "#9d2a1e" },
        ]} />
      </ChartCard>
    </div>
  );
}

function AnalyticsLineChart({
  data,
  lines,
}: {
  data: Array<AnalyticsDailyMetric & { label: string }>;
  lines: Array<{ key: keyof AnalyticsDailyMetric; name: string; color: string }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 12, right: 12, left: -22, bottom: 0 }}>
        <CartesianGrid stroke="#eef1f3" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#7a8991", fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "#9aa6ac", fontSize: 10 }} />
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #dfe4e7", fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 10, color: "#7a8991" }} />
        {lines.map((line, index) => (
          <Line
            key={line.key}
            dataKey={line.key}
            name={line.name}
            type="monotone"
            stroke={line.color}
            strokeWidth={index === 0 ? 2.5 : 2}
            dot={index === 0 ? { r: 3 } : false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="chart-card">
      <div className="chart-title"><h3>{title}</h3><span>por dia</span></div>
      {children}
    </article>
  );
}

