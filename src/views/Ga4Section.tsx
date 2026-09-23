import { useQuery } from "@tanstack/react-query";
import { Activity, AlertCircle, MousePointerClick, Target, UserPlus, Users } from "lucide-react";
import { AnalyticsAcquisitionTable, AnalyticsEventsTable } from "../components/AnalyticsTables";
import { Kpi, Panel, Skeleton } from "../components/ui/primitives";
import { getGa4 } from "../lib/api";
import { compact, integer, percent } from "../lib/format";
import type { DateRange } from "../types";

// GA4 no dashboard v2: sessões, usuários, novos usuários, eventos e key events,
// mais as tabelas de aquisição e de eventos. Tudo vem das RPCs de leitura que já
// existiam (`get_dashboard_overview`, `get_dashboard_ga4_acquisition`,
// `get_dashboard_ga4_events`). Os resultados do GA4 ficam nesta seção separada,
// e não somados aos de Meta/Google Ads, porque os modelos de atribuição são
// diferentes — misturar os dois números confundiria a leitura.

export function Ga4Section({ range }: { range: DateRange }) {
  const query = useQuery({ queryKey: ["ga4", range.start, range.end], queryFn: () => getGa4(range), retry: 1 });
  const current = query.data?.current ?? null;
  const previous = query.data?.previous ?? null;
  const hasData = Boolean(current?.has_data);

  return (
    <>
      <div className="section-title" style={{ marginTop: 22 }}>
        <div>
          <h2>Site · Google Analytics 4</h2>
          <p>Comportamento no site no mesmo período. Atribuição própria do GA4, separada dos resultados de Meta Ads e Google Ads.</p>
        </div>
        <span className="badge sky">GA4</span>
      </div>

      {query.isLoading ? (
        <div className="grid grid-6"><Skeleton height={120} /><Skeleton height={120} /><Skeleton height={120} /><Skeleton height={120} /><Skeleton height={120} /><Skeleton height={120} /></div>
      ) : query.isError ? (
        <div className="inline-error"><AlertCircle size={17} />Não foi possível carregar o GA4: {(query.error as Error)?.message ?? "erro desconhecido"}.</div>
      ) : !hasData ? (
        <div className="empty-state">Nenhum dado do GA4 sincronizado para este período.</div>
      ) : (
        <>
          <div className="grid grid-6">
            <Kpi label="Sessões" value={current!.sessions} previous={previous?.sessions} format={integer} accent="sky" icon={<Activity size={16} />} />
            <Kpi label="Usuários" value={current!.active_users} previous={previous?.active_users} format={integer} accent="navy" icon={<Users size={16} />} />
            <Kpi label="Novos usuários" value={current!.new_users} previous={previous?.new_users} format={integer} accent="violet" icon={<UserPlus size={16} />} />
            <Kpi label="Sessões engajadas" value={current!.engaged_sessions} previous={previous?.engaged_sessions} format={integer} accent="green" icon={<MousePointerClick size={16} />} />
            <Kpi label="Eventos" value={current!.events} previous={previous?.events} format={compact} accent="gold" icon={<Activity size={16} />} />
            <Kpi label="Conversões (key events)" value={current!.conversions} previous={previous?.conversions} format={integer} accent="red" icon={<Target size={16} />} foot={current!.lead_rate != null ? `taxa de conversão ${percent(current!.lead_rate)}` : undefined} />
          </div>
          <div className="grid grid-wide" style={{ marginTop: 14 }}>
            <Panel title="Aquisição" description="De onde vieram as sessões do período" noTilt>
              <AnalyticsAcquisitionTable items={query.data!.acquisition} />
            </Panel>
            <Panel title="Eventos" description="Eventos registrados no site" noTilt>
              <AnalyticsEventsTable items={query.data!.events} />
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
