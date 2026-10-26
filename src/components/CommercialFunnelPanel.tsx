import type { CommercialFront, CrmSummary } from "../types";
import { buildCrmSummary } from "../lib/crm";
import { commercialFronts } from "../lib/fronts";
import { dateTime } from "../lib/format";
import { Funnel, Panel } from "./ui/primitives";
export function CommercialFunnelPanel({ front, summary, fit = false, dense = true }: { front: CommercialFront; summary?: CrmSummary; fit?: boolean; dense?: boolean }) {
  const crm = summary ?? buildCrmSummary(front, null, null, { rows: [] });
  const meta = commercialFronts[front];
  const origin = crm.snapshot_origin === "example" ? "Dados de exemplo" : crm.snapshot_available ? "Entrada manual" : "Integração pendente";
  return <Panel className={fit ? "presentation-funnel" : ""} title={`Funil comercial · ${meta.short}`} description={crm.snapshot_origin === "example" ? "Snapshot ilustrativo · sem gravação operacional" : crm.snapshot_updated_at ? `Snapshot atualizado em ${dateTime(crm.snapshot_updated_at)}` : "Snapshot atual do Kanban · Implantação é pós-venda"} badge={<span className="badge sky">{origin}</span>} noTilt>
    {!crm.snapshot_available && <p className="manual-foot" role="status">Aguardando integração com CRM Elo.</p>}
    <Funnel stages={crm.stages} color={meta.color} format={value => new Intl.NumberFormat("pt-BR").format(value)} dense={dense} fitHeight={fit} />
  </Panel>;
}
