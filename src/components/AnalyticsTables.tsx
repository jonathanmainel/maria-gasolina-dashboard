import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { compact, integer, percent } from "../lib/format";
import { ExpandableTableFooter, useExpandableRows } from "./ui/expandable-table";
import type { AnalyticsAcquisitionItem, AnalyticsEventItem, AnalyticsLandingPageItem } from "../types";

// Tabelas do GA4. Nomenclatura da interface: `generate_leads` é exibido como
// "Leads" e `lead_rate` como "Taxa de conversão" — decisão de produto do MVP,
// em que o Lead é o `form_submit` do GA4.

interface SharedProps {
  /**
   * Muda quando o conjunto deixa de ser o mesmo (período, por exemplo) e a
   * tabela precisa voltar ao Top 5. A ordenação já entra na chave sozinha.
   */
  resetToken?: string;
}

type SortDirection = "asc" | "desc";
type AcquisitionSortKey = "channel_group" | "source_medium" | "sessions" | "engaged_sessions" | "engagement_rate" | "new_users" | "generate_leads" | "lead_rate";
type EventSortKey = "event_name" | "event_count" | "daily_average" | "key_events" | "share_of_total";
type LandingSortKey = "landing_page" | "sessions" | "engaged_sessions" | "engagement_rate" | "new_users" | "views";

function compareValues(a: string | number | null, b: string | number | null, direction: SortDirection) {
  if (a === null && b === null) return 0;
  if (a === null) return direction === "asc" ? -1 : 1;
  if (b === null) return direction === "asc" ? 1 : -1;
  const result = typeof a === "string" && typeof b === "string"
    ? a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" })
    : Number(a) - Number(b);
  return direction === "asc" ? result : -result;
}

export function AnalyticsAcquisitionTable({ items, resetToken = "", orderBy = "sessions" }: SharedProps & {
  items: AnalyticsAcquisitionItem[];
  /** Ordenação vinda do seletor da seção: quem traz tráfego x quem traz leads. */
  orderBy?: "sessions" | "generate_leads";
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: AcquisitionSortKey; direction: SortDirection }>({ key: orderBy, direction: "desc" });
  useEffect(() => { setSort({ key: orderBy, direction: "desc" }); }, [orderBy]);
  const sorted = useMemo(() => [...items].sort((a, b) => compareValues(a[sort.key], b[sort.key], sort.direction)), [items, sort]);
  const rows = useExpandableRows(sorted, `${resetToken}|${sort.key}|${sort.direction}`);
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
            <SortHead label="Novos usuários" field="new_users" current={sort} onClick={changeSort} />
            <SortHead label="Leads" field="generate_leads" current={sort} onClick={changeSort} />
            <SortHead label="Taxa de conversão" field="lead_rate" current={sort} onClick={changeSort} />
          </tr></thead>
          <tbody>{rows.visibleRows.map((item) => <tr key={`${item.channel_group}:${item.source_medium}`}>
            <td className="name-cell"><strong>{item.channel_group}</strong></td>
            <td className="name-cell">{item.source_medium}</td>
            <td>{integer(item.sessions)}</td><td>{integer(item.engaged_sessions)}</td>
            <td>{percent(item.engagement_rate)}</td><td>{integer(item.new_users)}</td><td>{integer(item.generate_leads)}</td><td>{percent(item.lead_rate)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="mobile-rows">{rows.visibleRows.map((item) => {
        const key = `${item.channel_group}:${item.source_medium}`;
        const open = expanded === key;
        return <article className="mobile-row" key={key}>
          <button type="button" onClick={() => setExpanded(open ? null : key)} aria-expanded={open}>
            <span><strong>{item.source_medium}</strong><small>{item.channel_group}</small></span>
            <span className="mobile-primary"><strong>{integer(item.sessions)} sessões</strong>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
          </button>
          {open && <div className="mobile-details"><Metric label="Sessões engajadas" value={integer(item.engaged_sessions)} /><Metric label="Taxa de engajamento" value={percent(item.engagement_rate)} /><Metric label="Novos usuários" value={integer(item.new_users)} /><Metric label="Leads" value={integer(item.generate_leads)} /><Metric label="Taxa de conversão" value={percent(item.lead_rate)} /></div>}
        </article>;
      })}</div>
      <ExpandableTableFooter rows={rows} />
    </div>
  );
}

/**
 * Landing pages: sem coluna de conversões. A RPC devolve `primary_conversions`
 * null enquanto a conversão primária não estiver marcada na propriedade, e uma
 * coluna de "—" em toda a tabela seria pior do que não ter a coluna.
 */
export function AnalyticsLandingPagesTable({ items, resetToken = "" }: SharedProps & { items: AnalyticsLandingPageItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: LandingSortKey; direction: SortDirection }>({ key: "sessions", direction: "desc" });
  const sorted = useMemo(() => [...items].sort((a, b) => compareValues(a[sort.key], b[sort.key], sort.direction)), [items, sort]);
  const rows = useExpandableRows(sorted, `${resetToken}|${sort.key}|${sort.direction}`);
  const changeSort = (key: LandingSortKey) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
  }));
  if (!items.length) return <div className="empty-state">Nenhuma landing page encontrada neste período.</div>;

  return (
    <div className="table-wrap analytics-table" data-testid="ga4-landing-pages-table">
      <div className="desktop-table">
        <table>
          <thead><tr>
            <SortHead label="Página" field="landing_page" current={sort} onClick={changeSort} wide />
            <SortHead label="Sessões" field="sessions" current={sort} onClick={changeSort} />
            <SortHead label="Sessões engajadas" field="engaged_sessions" current={sort} onClick={changeSort} />
            <SortHead label="Taxa de engajamento" field="engagement_rate" current={sort} onClick={changeSort} />
            <SortHead label="Novos usuários" field="new_users" current={sort} onClick={changeSort} />
            <SortHead label="Visualizações" field="views" current={sort} onClick={changeSort} />
          </tr></thead>
          <tbody>{rows.visibleRows.map((item) => <tr key={item.landing_page}>
            <td className="name-cell"><strong>{item.landing_page}</strong></td>
            <td>{integer(item.sessions)}</td><td>{integer(item.engaged_sessions)}</td>
            <td>{percent(item.engagement_rate)}</td><td>{integer(item.new_users)}</td><td>{integer(item.views)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="mobile-rows">{rows.visibleRows.map((item) => {
        const open = expanded === item.landing_page;
        return <article className="mobile-row" key={item.landing_page}>
          <button type="button" onClick={() => setExpanded(open ? null : item.landing_page)} aria-expanded={open}>
            <span><strong>{item.landing_page}</strong><small>Landing page</small></span>
            <span className="mobile-primary"><strong>{integer(item.sessions)} sessões</strong>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
          </button>
          {open && <div className="mobile-details"><Metric label="Sessões engajadas" value={integer(item.engaged_sessions)} /><Metric label="Taxa de engajamento" value={percent(item.engagement_rate)} /><Metric label="Novos usuários" value={integer(item.new_users)} /><Metric label="Visualizações" value={integer(item.views)} /></div>}
        </article>;
      })}</div>
      <ExpandableTableFooter rows={rows} />
    </div>
  );
}

export function AnalyticsEventsTable({ items, resetToken = "" }: SharedProps & { items: AnalyticsEventItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: EventSortKey; direction: SortDirection }>({ key: "event_count", direction: "desc" });
  const sorted = useMemo(() => [...items].sort((a, b) => compareValues(a[sort.key], b[sort.key], sort.direction)), [items, sort]);
  const rows = useExpandableRows(sorted, `${resetToken}|${sort.key}|${sort.direction}`);
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
            <SortHead label="Participação no total" field="share_of_total" current={sort} onClick={changeSort} />
            <SortHead label="Key events" field="key_events" current={sort} onClick={changeSort} />
          </tr></thead>
          <tbody>{rows.visibleRows.map((item) => <tr key={item.event_name}>
            <td className="name-cell"><strong>{item.event_name}</strong></td><td>{integer(item.event_count)}</td>
            <td>{compact(item.daily_average)}</td><td>{percent(item.share_of_total)}</td><td>{integer(item.key_events)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="mobile-rows">{rows.visibleRows.map((item) => {
        const open = expanded === item.event_name;
        return <article className="mobile-row" key={item.event_name}>
          <button type="button" onClick={() => setExpanded(open ? null : item.event_name)} aria-expanded={open}>
            <span><strong>{item.event_name}</strong><small>Evento do site</small></span>
            <span className="mobile-primary"><strong>{integer(item.event_count)}</strong>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
          </button>
          {open && <div className="mobile-details"><Metric label="Média diária" value={compact(item.daily_average)} /><Metric label="Participação" value={percent(item.share_of_total)} /><Metric label="Key events" value={integer(item.key_events)} /></div>}
        </article>;
      })}</div>
      <ExpandableTableFooter rows={rows} />
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
