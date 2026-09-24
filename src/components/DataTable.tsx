import { ChevronDown, ChevronsUpDown, ChevronUp, ImageOff, PlayCircle } from "lucide-react";
import { useMemo, useState } from "react";
import type { DetailRow } from "../lib/detail-rows";
import { integer, money, percent } from "../lib/format";

type SortKey = "item_name" | "spend" | "impressions" | "clicks" | "results" | "ctr" | "cost_per_result";

interface Props {
  items: DetailRow[];
  totalCount?: number;
  emptyLabel?: string;
  /** Coluna de canal: só faz sentido quando Meta e Google dividem a tabela. */
  showChannel?: boolean;
  /** Tipo do recurso (título, imagem, vídeo…): só existe no nível de anúncio. */
  showAssetType?: boolean;
  defaultSortKey?: SortKey;
  defaultSortDirection?: "asc" | "desc";
}

const sortOptions: Array<{ key: SortKey; label: string }> = [
  { key: "spend", label: "Investimento" },
  { key: "results", label: "Resultados" },
  { key: "cost_per_result", label: "Custo por resultado" },
  { key: "ctr", label: "CTR" },
  { key: "clicks", label: "Cliques" },
  { key: "impressions", label: "Impressões" },
];

export function DataTable({
  items, totalCount, emptyLabel = "Nenhum dado neste período.", showChannel = false, showAssetType = false,
  defaultSortKey = "spend", defaultSortDirection = "desc",
}: Props) {
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: defaultSortKey, direction: defaultSortDirection });
  const [expanded, setExpanded] = useState<string | null>(null);
  const sorted = useMemo(() => [...items].sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const result = typeof av === "string" ? av.localeCompare(String(bv), "pt-BR") : Number(av) - Number(bv);
    return sort.direction === "asc" ? result : -result;
  }), [items, sort]);

  const changeSort = (key: SortKey) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
  }));

  // A coluna de tipo só aparece se houver de fato recurso PMax na lista.
  const withAssetType = showAssetType && items.some((item) => item.pmax);

  if (!items.length) return <div className="empty-state">{emptyLabel}</div>;

  return (
    <div className="table-wrap">
      <div className="table-toolbar">
        <label>
          <span>Ordenar por</span>
          <select value={sort.key} onChange={(event) => setSort({ key: event.target.value as SortKey, direction: event.target.value === "cost_per_result" ? "asc" : "desc" })}>
            {sortOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setSort((current) => ({ ...current, direction: current.direction === "asc" ? "desc" : "asc" }))}>
          {sort.direction === "asc" ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          {sort.direction === "asc" ? "Menor primeiro" : "Maior primeiro"}
        </button>
      </div>
      <div className="desktop-table">
        <table>
          <thead>
            <tr>
              <SortHead label="Nome" field="item_name" current={sort} onClick={changeSort} wide />
              {showChannel && <th>Canal</th>}
              {withAssetType && <th>Tipo</th>}
              <SortHead label="Investimento" field="spend" current={sort} onClick={changeSort} />
              <SortHead label="Impressões" field="impressions" current={sort} onClick={changeSort} />
              <SortHead label="Cliques" field="clicks" current={sort} onClick={changeSort} />
              <SortHead label="Resultados" field="results" current={sort} onClick={changeSort} />
              <SortHead label="CTR" field="ctr" current={sort} onClick={changeSort} />
              <SortHead label="Custo / resultado" field="cost_per_result" current={sort} onClick={changeSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => <DataRow key={item.key} item={item} showChannel={showChannel} showAssetType={withAssetType} />)}
          </tbody>
        </table>
      </div>
      <div className="mobile-rows">
        {sorted.map((item) => {
          const open = expanded === item.key;
          return (
            <article className="mobile-row" key={item.key}>
              <button onClick={() => setExpanded(open ? null : item.key)} aria-expanded={open}>
                <span>
                  <strong>{item.item_name}{item.pmax && <span className="chip pmax">PMax</span>}</strong>
                  <small>{item.subtitle ?? "—"}</small>
                </span>
                <span className="mobile-primary"><strong>{money(item.spend)}</strong>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
              </button>
              {open && <div className="mobile-details">
                {showChannel && <Metric label="Canal" value={item.channel === "meta_ads" ? "Meta" : "Google"} />}
                <Metric label="Impressões" value={integer(item.impressions)} />
                <Metric label="Cliques" value={integer(item.clicks)} />
                <Metric label="Resultados" value={integer(item.results)} />
                <Metric label="CTR" value={percent(item.ctr)} />
                <Metric label="Custo / resultado" value={money(item.cost_per_result)} />
                {item.pmax && item.field_type && <Metric label="Tipo" value={assetType(item.field_type)} />}
                {item.pmax && item.performance_label && <Metric label="Avaliação" value={labelPerformance(item.performance_label)} />}
              </div>}
            </article>
          );
        })}
      </div>
      <p className="table-count">Exibindo {items.length} de {totalCount ?? items.length}</p>
    </div>
  );
}

function DataRow({ item, showChannel, showAssetType }: { item: DetailRow; showChannel: boolean; showAssetType: boolean }) {
  return (
    <tr>
      <td className="name-cell">
        <div className="entity-name">
          {item.pmax && <AssetPreview item={item} />}
          <span>
            <strong>{item.item_name}{item.pmax && <span className="chip pmax">PMax</span>}</strong>
            <small>{item.subtitle ?? "—"}</small>
          </span>
        </div>
      </td>
      {showChannel && <td><span className={`chip ${item.channel === "meta_ads" ? "meta" : "google"}`}>{item.channel === "meta_ads" ? "Meta" : "Google"}</span></td>}
      {showAssetType && (
        <td>
          {item.field_type ? <span className="asset-type">{assetType(item.field_type)}</span> : <span className="asset-type muted">—</span>}
          {item.performance_label && <small className="performance-label">{labelPerformance(item.performance_label)}</small>}
        </td>
      )}
      <td>{money(item.spend)}</td>
      <td>{integer(item.impressions)}</td>
      <td>{integer(item.clicks)}</td>
      <td>{integer(item.results)}</td>
      <td>{percent(item.ctr)}</td>
      <td>{money(item.cost_per_result)}</td>
    </tr>
  );
}

function AssetPreview({ item }: { item: DetailRow }) {
  if (item.image_url) return <img className="asset-preview" src={item.image_url} alt="" />;
  if (item.youtube_video_id) return <div className="asset-preview asset-placeholder"><PlayCircle size={19} /></div>;
  if (item.text_content) return <div className="asset-preview asset-text">Aa</div>;
  return <div className="asset-preview asset-placeholder"><ImageOff size={17} /></div>;
}

function SortHead({ label, field, current, onClick, wide }: { label: string; field: SortKey; current: { key: SortKey; direction: "asc" | "desc" }; onClick: (field: SortKey) => void; wide?: boolean }) {
  return <th className={wide ? "wide" : ""}><button onClick={() => onClick(field)}>{label}<ChevronsUpDown size={13} className={current.key === field ? "active-sort" : ""} /></button></th>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

/** Tipos reais vindos do backend (HEADLINE, SQUARE_MARKETING_IMAGE…) em rótulo legível. */
function assetType(value: string) {
  const labels: Record<string, string> = {
    HEADLINE: "Título",
    LONG_HEADLINE: "Título longo",
    DESCRIPTION: "Descrição",
    YOUTUBE_VIDEO: "Vídeo",
    MARKETING_IMAGE: "Imagem",
    SQUARE_MARKETING_IMAGE: "Imagem quadrada",
    PORTRAIT_MARKETING_IMAGE: "Imagem retrato",
    LOGO: "Logo",
    LANDSCAPE_LOGO: "Logo horizontal",
    BUSINESS_NAME: "Nome do negócio",
    CALL_TO_ACTION_SELECTION: "Call to action",
  };
  return labels[value] ?? value.replaceAll("_", " ").toLowerCase();
}

function labelPerformance(value?: string | null) {
  const labels: Record<string, string> = { BEST: "Melhor", GOOD: "Bom", LOW: "Baixo", LEARNING: "Aprendendo", EXCELLENT: "Excelente", POOR: "Baixo" };
  return value ? labels[value] ?? value : "Sem avaliação";
}
