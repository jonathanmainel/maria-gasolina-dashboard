import { useQuery } from "@tanstack/react-query";
import { Activity, AlertCircle, Eye, MousePointerClick, Target } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useMemo, type ReactNode } from "react";
import { useAuth } from "../auth";
import { ExpandableTableFooter, useExpandableRows } from "../components/ui/expandable-table";
import { Kpi, Panel, Skeleton } from "../components/ui/primitives";
import { TableViewport } from "../components/ui/table-viewport";
import { CLIENT_SLUG, getRetaguardaOrganic, getRetaguardaPaid, isDemoMode } from "../lib/api";
import { integer } from "../lib/format";
import { historyDates, type PaidMetrics } from "../lib/retaguarda";
import type { DateRange } from "../types";
import { RetaguardaFinance } from "./RetaguardaFinance";

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 });
const googleConversions = (value: number | null) => value === null ? "—" : numberFormat.format(value);
type SourceStatus = { isPending: boolean; isError: boolean; refetch: () => Promise<unknown> };

export function RetaguardaView({ range, readOnly = false }: { range: DateRange; readOnly?: boolean }) {
  const { session } = useAuth();
  const key = ["retaguarda", CLIENT_SLUG, session?.user.id, range.start, range.end];
  const google = useQuery({ queryKey: [...key, "google_ads"], queryFn: () => getRetaguardaPaid("google_ads", range), retry: 1 });
  const meta = useQuery({ queryKey: [...key, "meta_ads"], queryFn: () => getRetaguardaPaid("meta_ads", range), retry: 1 });
  const organic = useQuery({ queryKey: [...key, "ga4"], queryFn: () => getRetaguardaOrganic(range), retry: 1 });

  const googleData = google.isSuccess ? google.data : undefined;
  const metaData = meta.isSuccess ? meta.data : undefined;
  const organicData = organic.isSuccess ? organic.data : undefined;
  const hasHistory = Boolean(googleData?.days.size || metaData?.days.size || organicData?.days.size);
  const pending = google.isPending || meta.isPending || organic.isPending;
  const failed = google.isError || meta.isError || organic.isError;
  const dates = useMemo(() => hasHistory ? historyDates(range) : [], [hasHistory, range]);
  const rows = useExpandableRows(dates, `${range.start}|${range.end}`, 7);

  return (
    <div className="view-enter retaguarda-view">
      <div className="view-head">
        <div>
          <span className="eyebrow"><i style={{ background: "var(--gold)" }} />Marketing</span>
          <h1>Retaguarda</h1>
          <p>Acompanhamento diário de mídia paga e tráfego orgânico.</p>
        </div>
        <a className="secondary-button" href="#acompanhamento-diario">Ver acompanhamento diário</a>
      </div>

      <RetaguardaFinance range={range} readOnly={readOnly} />

      <div className="section-title"><h2>Resultados do período</h2></div>
      <div className="panel-stack">
        <SourcePanel title="Google Ads" description="Dados de campanha do Google Ads" status={google} empty={!googleData?.days.size}>
          <PaidCards metrics={googleData?.total} platform="google_ads" />
        </SourcePanel>
        <SourcePanel title="Meta Ads" description="Dados de campanha do Meta Ads" status={meta} empty={!metaData?.days.size}>
          <PaidCards metrics={metaData?.total} platform="meta_ads" />
        </SourcePanel>
        <SourcePanel title="Tráfego orgânico" description="Google Analytics 4" status={organic} empty={!organicData?.days.size}>
          <Kpi label="Sessões orgânicas (GA4)" value={organicData?.total ?? null} format={integer} accent="gold" icon={<Activity size={16} />} hideDelta foot={organicData?.channelLabels.join(" · ")} />
        </SourcePanel>
      </div>

      <div className="section-title" id="acompanhamento-diario">
        <div>
          <h2>Acompanhamento diário</h2>
          <p>O traço (—) indica dado indisponível. Os totais somam os valores disponíveis no período.</p>
        </div>
      </div>
      {hasHistory ? (
        <div className="table-wrap retaguarda-history">
          <TableViewport label="Colunas do acompanhamento diário">
            <table aria-label="Acompanhamento diário de marketing">
              <colgroup span={1} />
              <colgroup span={3} />
              <colgroup span={3} />
              <colgroup span={1} />
              <thead>
                <tr>
                  <th rowSpan={2} scope="col">Data</th>
                  <th colSpan={3} scope="colgroup">Google Ads</th>
                  <th colSpan={3} scope="colgroup">Meta Ads</th>
                  <th scope="colgroup">GA4</th>
                </tr>
                <tr>
                  <th scope="col">Impressões</th><th scope="col">Cliques</th><th scope="col">Conversões</th>
                  <th scope="col">Impressões</th><th scope="col">Cliques</th><th scope="col">Leads</th>
                  <th scope="col">Sessões orgânicas</th>
                </tr>
              </thead>
              <tbody>
                {rows.visibleRows.map((day) => (
                  <tr key={day}>
                    <th scope="row"><time dateTime={day}>{format(parseISO(day), "dd/MM/yyyy")}</time></th>
                    <PaidCells metrics={googleData?.days.get(day)} conversionFormat={googleConversions} />
                    <PaidCells metrics={metaData?.days.get(day)} conversionFormat={integer} />
                    <td>{integer(organicData?.days.get(day))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total do período</th>
                  <PaidCells metrics={googleData?.total} conversionFormat={googleConversions} />
                  <PaidCells metrics={metaData?.total} conversionFormat={integer} />
                  <td>{integer(organicData?.total)}</td>
                </tr>
              </tfoot>
            </table>
          </TableViewport>
          <ExpandableTableFooter rows={rows} summary="dias no período" />
        </div>
      ) : pending ? (
        <div role="status" aria-label="Carregando acompanhamento diário"><Skeleton height={200} /></div>
      ) : (
        <div className="empty-state">{failed ? "Histórico diário indisponível. Consulte o estado das fontes acima." : "Nenhum dado de mídia paga ou aquisição orgânica neste período."}</div>
      )}
    </div>
  );
}

function SourcePanel({ title, description, status, empty, children }: { title: string; description: string; status: SourceStatus; empty: boolean; children: ReactNode }) {
  return (
    <Panel title={title} description={description} noTilt>
      {status.isPending ? (
        <div role="status" aria-label={`Carregando dados de ${title}`}><Skeleton height={126} /></div>
      ) : status.isError ? (
        <div className="inline-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>Não foi possível carregar os dados de {title}.</span>
          <button type="button" className="secondary-button" onClick={() => void status.refetch()}>Tentar novamente</button>
        </div>
      ) : empty ? (
        <div className="empty-state">{isDemoMode ? "Dados reais disponíveis na versão autenticada." : "Nenhum registro desta fonte no período."}</div>
      ) : children}
    </Panel>
  );
}

function PaidCards({ metrics, platform }: { metrics: PaidMetrics | undefined; platform: "google_ads" | "meta_ads" }) {
  const google = platform === "google_ads";
  const accent = google ? "green" : "sky";
  return (
    <div className="grid grid-3">
      <Kpi label="Impressões" value={metrics?.impressions ?? null} format={integer} accent={accent} icon={<Eye size={16} />} hideDelta />
      <Kpi label="Cliques" value={metrics?.clicks ?? null} format={integer} accent={accent} icon={<MousePointerClick size={16} />} hideDelta />
      <Kpi label={google ? "Conversões" : "Leads"} value={metrics?.conversions ?? null} format={google ? googleConversions : integer} accent={accent} icon={<Target size={16} />} hideDelta />
    </div>
  );
}

function PaidCells({ metrics, conversionFormat }: { metrics: PaidMetrics | undefined; conversionFormat: (value: number | null) => string }) {
  return (
    <>
      <td>{integer(metrics?.impressions)}</td>
      <td>{integer(metrics?.clicks)}</td>
      <td>{conversionFormat(metrics?.conversions ?? null)}</td>
    </>
  );
}
