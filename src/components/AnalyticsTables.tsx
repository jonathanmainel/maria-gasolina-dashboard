import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import { compact, percent } from "../lib/format";
import type { AnalyticsAcquisitionItem, AnalyticsEventItem } from "../types";

interface SharedProps {
  totalCount?: number;
}

type SortDirection = "asc" | "desc";
type AcquisitionSortKey = "channel_group" | "source_medium" | "sessions" | "engaged_sessions" | "engagement_rate" | "views" | "generate_leads" | "lead_rate";
type EventSortKey = "event_name" | "event_count" | "daily_average" | "key_events" | "share_of_total";

function compareValues(a: string | number | null, b: string | number | null, direction: SortDirection) {
  if (a === null && b === null) return 0;
  if (a === null) return direction === "asc" ? -1 : 1;
  if (b === null) return direction === "asc" ? 1 : -1;
  const result = typeof a === "string" && typeof b === "string"
    ? a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" })
    : Number(a) - Number(b);
  return direction === "asc" ? result : -result;
}

export function AnalyticsAcquisitionTable({ items, totalCount }: SharedProps & { items: AnalyticsAcquisitionItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: AcquisitionSortKey; direction: SortDirection }>({ key: "sessions", direction: "desc" });
  const sorted = useMemo(() => [...items].sort((a, b) => compareValues(a[sort.key], b[sort.key], sort.direction)), [items, sort]);
  const changeSort = (key: AcquisitionSortKey) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
  }));
  if (!items.length) return <div className="empty-state">Nenhuma origem ou mídia encontrada neste período.</div>;

  return (
    <div className="table-wrap analytics-table" data-testid="ga4-acquisition-table">
      <div className="desktop-table">
        <table>
          <thead><tr>
            <SortHead label="Canal" field="channel_group" current={sort} onClick={changeSort} wide />
            <SortHead label="Origem / mídia" field="source_medium" current={sort} onClick={changeSort} wide />
            <SortHead label="Sessões" field="sessions" current={sort} onClick={changeSort} />
            <SortHead label="Sessões engajadas" field="engaged_sessions" current={sort} onClick={changeSort} />
            <SortHead label="Taxa de engajamento" field="engagement_rate" current={sort} onClick={changeSort} />
            <SortHead label="Visualizações" field="views" current={sort} onClick={changeSort} />
            <SortHead label="Conversões" field="generate_leads" current={sort} onClick={changeSort} />
            <SortHead label="Taxa de conversão" field="lead_rate" current={sort} onClick={changeSort} />
          </tr></thead>
          <tbody>{sorted.map((item) => <tr key={`${item.channel_group}:${item.source_medium}`}>
            <td className="name-cell"><strong>{item.channel_group}</strong></td>
            <td className="name-cell">{item.source_medium}</td>
            <td>{compact(item.sessions)}</td><td>{compact(item.engaged_sessions)}</td>
            <td>{percent(item.engagement_rate)}</td><td>{compact(item.views)}</td><td>{compact(item.generate_leads)}</td><td>{percent(item.lead_rate)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="mobile-rows">{sorted.map((item) => {
        const key = `${item.channel_group}:${item.source_medium}`;
        const open = expanded === key;
        return <article className="mobile-row" key={key}>
          <button type="button" onClick={() => setExpanded(open ? null : key)} aria-expanded={open}>
            <span><strong>{item.source_medium}</strong><small>{item.channel_group}</small></span>
            <span className="mobile-primary"><strong>{compact(item.sessions)} sessões</strong>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
          </button>
          {open && <div className="mobile-details"><Metric label="Sessões engajadas" value={compact(item.engaged_sessions)} /><Metric label="Taxa de engajamento" value={percent(item.engagement_rate)} /><Metric label="Visualizações" value={compact(item.views)} /><Metric label="Conversões" value={compact(item.generate_leads)} /><Metric label="Taxa de conversão" value={percent(item.lead_rate)} /></div>}
        </article>;
      })}</div>
      <p className="table-count">Exibindo {items.length} de {totalCount ?? items.length}</p>
    </div>
  );
}

export function AnalyticsEventsTable({ items, totalCount }: SharedProps & { items: AnalyticsEventItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: EventSortKey; direction: SortDirection }>({ key: "event_count", direction: "desc" });
  const sorted = useMemo(() => [...items].sort((a, b) => compareValues(a[sort.key], b[sort.key], sort.direction)), [items, sort]);
  const changeSort = (key: EventSortKey) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
  }));
  if (!items.length) return <div className="empty-state">Nenhum evento encontrado neste período.</div>;

  return (
    <div className="table-wrap analytics-table" data-testid="ga4-events-table">
      <div className="desktop-table">
        <table>
          <thead><tr>
            <SortHead label="Evento" field="event_name" current={sort} onClick={changeSort} wide />
            <SortHead label="Quantidade" field="event_count" current={sort} onClick={changeSort} />
            <SortHead label="Média diária" field="daily_average" current={sort} onClick={changeSort} />
            <SortHead label="Eventos principais" field="key_events" current={sort} onClick={changeSort} />
            <SortHead label="Participação no total" field="share_of_total" current={sort} onClick={changeSort} />
          </tr></thead>
          <tbody>{sorted.map((item) => <tr key={item.event_name}>
            <td className="name-cell"><strong>{item.event_name}</strong></td><td>{compact(item.event_count)}</td>
            <td>{compact(item.daily_average)}</td><td>{compact(item.key_events)}</td><td>{percent(item.share_of_total)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="mobile-rows">{sorted.map((item) => {
        const open = expanded === item.event_name;
        return <article className="mobile-row" key={item.event_name}>
          <button type="button" onClick={() => setExpanded(open ? null : item.event_name)} aria-expanded={open}>
            <span><strong>{item.event_name}</strong><small>Evento do site</small></span>
            <span className="mobile-primary"><strong>{compact(item.event_count)}</strong>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
          </button>
          {open && <div className="mobile-details"><Metric label="Média diária" value={compact(item.daily_average)} /><Metric label="Eventos principais" value={compact(item.key_events)} /><Metric label="Participação" value={percent(item.share_of_total)} /></div>}
        </article>;
      })}</div>
      <p className="table-count">Exibindo {items.length} de {totalCount ?? items.length}</p>
    </div>
  );
}

function SortHead<K extends string>({ label, field, current, onClick, wide }: {
  label: string;
  field: K;
  current: { key: K; direction: SortDirection };
  onClick: (field: K) => void;
  wide?: boolean;
}) {
  const active = current.key === field;
  const nextDirection = active && current.direction === "desc" ? "crescente" : "decrescente";
  return (
    <th className={wide ? "wide" : ""} aria-sort={active ? (current.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onClick(field)} aria-label={`Ordenar por ${label}, ordem ${nextDirection}`}>
        {label}<ChevronsUpDown size={13} className={active ? "active-sort" : ""} />
      </button>
    </th>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

