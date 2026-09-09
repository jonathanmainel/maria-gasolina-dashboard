import { ChevronDown, ChevronsUpDown, ChevronUp, ImageOff, PlayCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { integer, money, percent } from "../lib/format";
import type { EntityItem, PmaxItem } from "../types";

type SortKey = "item_name" | "spend" | "impressions" | "clicks" | "results" | "ctr" | "cpc" | "cost_per_result";

interface Props {
  items: (EntityItem | PmaxItem)[];
  kind?: "entity" | "pmax";
  totalCount?: number;
  emptyLabel?: string;
}

export function DataTable({ items, kind = "entity", totalCount, emptyLabel = "Nenhum dado neste período." }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "spend", direction: "desc" });
  const [expanded, setExpanded] = useState<string | null>(null);
  const sorted = useMemo(() => [...items].sort((a, b) => {
    const av = a[sort.key] ?? (sort.key === "item_name" ? "" : -Infinity);
    const bv = b[sort.key] ?? (sort.key === "item_name" ? "" : -Infinity);
    const result = typeof av === "string" ? av.localeCompare(String(bv), "pt-BR") : Number(av) - Number(bv);
    return sort.direction === "asc" ? result : -result;
  }), [items, sort]);

  const changeSort = (key: SortKey) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
  }));

  if (!items.length) return <div className="empty-state">{emptyLabel}</div>;

  return (
    <div className="table-wrap">
      <div className="desktop-table">
        <table>
          <thead>
            <tr>
              <SortHead label={kind === "pmax" ? "Recurso" : "Nome"} field="item_name" current={sort} onClick={changeSort} wide />
              {kind === "pmax" && <th>Tipo / avaliação</th>}
              <SortHead label="Investimento" field="spend" current={sort} onClick={changeSort} />
              <SortHead label="Impressões" field="impressions" current={sort} onClick={changeSort} />
              <SortHead label="Cliques" field="clicks" current={sort} onClick={changeSort} />
              <SortHead label="Resultados" field="results" current={sort} onClick={changeSort} />
              <SortHead label="CTR" field="ctr" current={sort} onClick={changeSort} />
              <SortHead label="Custo / resultado" field="cost_per_result" current={sort} onClick={changeSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => <DataRow key={item.item_id} item={item} pmax={kind === "pmax"} />)}
          </tbody>
        </table>
      </div>
      <div className="mobile-rows">
        {sorted.map((item) => {
          const open = expanded === item.item_id;
          return (
            <article className="mobile-row" key={item.item_id}>
              <button onClick={() => setExpanded(open ? null : item.item_id)} aria-expanded={open}>
                <span><strong>{item.item_name}</strong><small>{"parent_name" in item ? item.parent_name ?? item.item_status ?? "Ativo" : item.asset_group_name ?? item.item_status ?? "Ativo"}</small></span>
                <span className="mobile-primary"><strong>{money(item.spend)}</strong>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
              </button>
              {open && <div className="mobile-details">
                <Metric label="Impressões" value={integer(item.impressions)} />
                <Metric label="Cliques" value={integer(item.clicks)} />
                <Metric label="Resultados" value={integer(item.results)} />
                <Metric label="CTR" value={percent(item.ctr)} />
                <Metric label="Custo / resultado" value={money(item.cost_per_result)} />
                {kind === "pmax" && <Metric label="Avaliação" value={labelPerformance((item as PmaxItem).performance_label ?? (item as PmaxItem).ad_strength)} />}
              </div>}
            </article>
          );
        })}
      </div>
      <p className="table-count">Exibindo {items.length} de {totalCount ?? items.length}</p>
    </div>
  );
}

function DataRow({ item, pmax }: { item: EntityItem | PmaxItem; pmax: boolean }) {
  const asset = pmax ? item as PmaxItem : null;
  return (
    <tr>
      <td className="name-cell">
        <div className="entity-name">
          {asset && <AssetPreview item={asset} />}
          <span><strong>{item.item_name}</strong><small>{("parent_name" in item ? item.parent_name : asset?.asset_group_name) ?? item.item_status ?? "Ativo"}</small></span>
        </div>
      </td>
      {asset && <td><span className={`performance-chip perf-${(asset.performance_label ?? asset.ad_strength ?? "unknown").toLowerCase()}`}>{asset.field_type ? asset.field_type.replaceAll("_", " ") : "GRUPO"}</span><small className="performance-label">{labelPerformance(asset.performance_label ?? asset.ad_strength)}</small></td>}
      <td>{money(item.spend)}</td>
      <td>{integer(item.impressions)}</td>
      <td>{integer(item.clicks)}</td>
      <td>{integer(item.results)}</td>
      <td>{percent(item.ctr)}</td>
      <td>{money(item.cost_per_result)}</td>
    </tr>
  );
}

function AssetPreview({ item }: { item: PmaxItem }) {
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

function labelPerformance(value?: string | null) {
  const labels: Record<string, string> = { BEST: "Melhor", GOOD: "Bom", LOW: "Baixo", LEARNING: "Aprendendo", EXCELLENT: "Excelente", POOR: "Baixo" };
  return value ? labels[value] ?? value : "Sem avaliação";
}
