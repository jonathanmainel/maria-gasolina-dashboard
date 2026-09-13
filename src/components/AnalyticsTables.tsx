import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { compact, percent } from "../lib/format";
import type { AnalyticsAcquisitionItem, AnalyticsEventItem } from "../types";

interface SharedProps {
  totalCount?: number;
}

export function AnalyticsAcquisitionTable({ items, totalCount }: SharedProps & { items: AnalyticsAcquisitionItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!items.length) return <div className="empty-state">Nenhuma origem ou mídia encontrada neste período.</div>;

  return (
    <div className="table-wrap analytics-table" data-testid="ga4-acquisition-table">
      <div className="desktop-table">
        <table>
          <thead><tr><th className="wide">Canal</th><th className="wide">Origem / mídia</th><th>Sessões</th><th>Sessões engajadas</th><th>Taxa de engajamento</th><th>Leads</th><th>Taxa de leads</th></tr></thead>
          <tbody>{items.map((item) => <tr key={`${item.channel_group}:${item.source_medium}`}>
            <td className="name-cell"><strong>{item.channel_group}</strong></td>
            <td className="name-cell">{item.source_medium}</td>
            <td>{compact(item.sessions)}</td><td>{compact(item.engaged_sessions)}</td>
            <td>{percent(item.engagement_rate)}</td><td>{compact(item.generate_leads)}</td><td>{percent(item.lead_rate)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="mobile-rows">{items.map((item) => {
        const key = `${item.channel_group}:${item.source_medium}`;
        const open = expanded === key;
        return <article className="mobile-row" key={key}>
          <button type="button" onClick={() => setExpanded(open ? null : key)} aria-expanded={open}>
            <span><strong>{item.source_medium}</strong><small>{item.channel_group}</small></span>
            <span className="mobile-primary"><strong>{compact(item.sessions)} sessões</strong>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
          </button>
          {open && <div className="mobile-details"><Metric label="Sessões engajadas" value={compact(item.engaged_sessions)} /><Metric label="Taxa de engajamento" value={percent(item.engagement_rate)} /><Metric label="Leads" value={compact(item.generate_leads)} /><Metric label="Taxa de leads" value={percent(item.lead_rate)} /></div>}
        </article>;
      })}</div>
      <p className="table-count">Exibindo {items.length} de {totalCount ?? items.length}</p>
    </div>
  );
}

export function AnalyticsEventsTable({ items, totalCount }: SharedProps & { items: AnalyticsEventItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!items.length) return <div className="empty-state">Nenhum evento encontrado neste período.</div>;

  return (
    <div className="table-wrap analytics-table" data-testid="ga4-events-table">
      <div className="desktop-table">
        <table>
          <thead><tr><th className="wide">Evento</th><th>Quantidade</th><th>Média diária</th><th>Eventos principais</th><th>Participação no total</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.event_name}>
            <td className="name-cell"><strong>{item.event_name}</strong></td><td>{compact(item.event_count)}</td>
            <td>{compact(item.daily_average)}</td><td>{compact(item.key_events)}</td><td>{percent(item.share_of_total)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="mobile-rows">{items.map((item) => {
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

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

