import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { CampaignTable } from "../components/CampaignTable";
import { DataTable } from "../components/DataTable";
import { Panel, Skeleton } from "../components/ui/primitives";
import { getAllEntities, getAllPmax, getClientId } from "../lib/api";
import { getMetaCreativePreviews } from "../lib/creative-previews";
import {
  buildAncestry, buildDetailRows, levelsFor, lookupsFor, planFor, resolveLevel, sliceByFront,
  type ChannelFilter, type DetailLevel, type DetailRow,
} from "../lib/detail-rows";
import { integer } from "../lib/format";
import type { CampaignRow, DateRange, EntityItem, Front } from "../types";

// Bloco único de detalhamento. O canal vem do filtro do topo da página — não há
// seletor de plataforma aqui dentro, então é estruturalmente impossível ver
// "Google Ads" no topo e "Meta Ads" no detalhamento.

interface Props {
  front: Front;
  range: DateRange;
  channelFilter: ChannelFilter;
  campaigns: CampaignRow[];
}

interface LevelData {
  rows: DetailRow[];
  truncated: boolean;
}

export function DetailExplorer({ front, range, channelFilter, campaigns }: Props) {
  const [requested, setRequested] = useState<DetailLevel>("campaign");
  // O nível vive no render, não no estado: trocar de canal com uma aba
  // incompatível aberta (Palavras-chave → Meta Ads) cai em Campanhas sem
  // depender de efeito colateral.
  const level = resolveLevel(requested, channelFilter);
  const options = levelsFor(channelFilter);
  const active = options.find((option) => option.id === level) ?? options[0];
  const isCampaign = level === "campaign";

  const query = useQuery<LevelData>({
    queryKey: ["detail", channelFilter, level, range.start, range.end],
    enabled: !isCampaign,
    refetchInterval: level === "ad" ? 5 * 60 * 1000 : false,
    queryFn: async () => {
      const detailLevel = level as Exclude<DetailLevel, "campaign">;
      const plan = planFor(detailLevel, channelFilter);
      const lookups = lookupsFor(detailLevel, plan);
      // Todas as páginas antes de recortar por frente: a RPC ordena por
      // investimento, e cortar na primeira página esconderia itens da frente.
      const [entities, pmax, ancestors] = await Promise.all([
        Promise.all(plan.entitySources.map((source) => getAllEntities(source, detailLevel, range))),
        plan.pmax ? getAllPmax(plan.pmax, range) : null,
        Promise.all(lookups.map((lookup) => getAllEntities(lookup.source, lookup.level, range).then((page) => ({ ...lookup, page })))),
      ]);
      const pick = (lvl: "group" | "campaign"): EntityItem[] => ancestors.filter((a) => a.level === lvl).flatMap((a) => a.page.items);
      const ancestry = buildAncestry(pick("group"), pick("campaign"));
      const rows = buildDetailRows(entities.map((page) => page.items), pmax?.items ?? [], ancestry);
      if (detailLevel === "ad" && plan.entitySources.includes("meta_ads")) {
        const metaIds = rows.filter((row) => row.level === "ad" && row.channel === "meta_ads" && !row.pmax).map((row) => row.item_id);
        if (metaIds.length) {
          const previews = await getClientId().then((id) => getMetaCreativePreviews(metaIds, id)).catch(() => new Map());
          for (const row of rows) {
            if (row.level === "ad" && row.channel === "meta_ads" && !row.pmax) {
              row.image_url = previews.get(row.item_id)?.preview_url ?? null;
            }
          }
        }
      }
      return {
        rows,
        truncated: [...entities, ...(pmax ? [pmax] : []), ...ancestors.map((a) => a.page)].some((page) => page.truncated),
      };
    },
    retry: 1,
  });

  const { items, outside } = useMemo(() => {
    // Campanhas já chegam filtradas por frente e canal na página.
    if (isCampaign) return { items: [], outside: 0 };
    return sliceByFront(query.data?.rows ?? [], front);
  }, [isCampaign, query.data, front]);

  const count = isCampaign ? campaigns.length : items.length;
  // Trocar nível, canal, frente ou período substitui o dataset da tabela: o
  // Top 5 tem de voltar, em vez de deixar 90 linhas abertas de outra análise.
  const resetToken = `${level}|${channelFilter}|${front}|${range.start}|${range.end}`;

  return (
    <Panel
      className="detail-panel"
      title="Detalhamento"
      description="Campanhas e os níveis abaixo delas, no canal e no período selecionados no topo"
      badge={<span className="badge ghost">{integer(count)} {isCampaign ? "campanhas" : "itens"}</span>}
      noTilt
    >
      <div className="seg seg-wrap seg-scroll" role="tablist" style={{ marginBottom: 14 }}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active.id === option.id}
            className={active.id === option.id ? "active" : ""}
            onClick={() => setRequested(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isCampaign ? (
        <CampaignTable campaigns={campaigns} emptyLabel={active.emptyLabel} resetToken={resetToken} />
      ) : query.isLoading ? (
        <Skeleton height={240} />
      ) : query.isError ? (
        <div className="inline-error"><AlertCircle size={17} />Não foi possível carregar este nível: {(query.error as Error)?.message ?? "erro desconhecido"}.</div>
      ) : (
        <>
          <DataTable items={items} emptyLabel={active.emptyLabel} showChannel={channelFilter === "all"} showAssetType={level === "ad"} resetToken={resetToken} />
          {outside > 0 && (
            <p className="manual-foot">
              {integer(outside)} item(ns) pertencem a campanhas sem FRANQ ou COND no nome e ficaram fora das duas frentes.
            </p>
          )}
          {query.data?.truncated && (
            <p className="manual-foot">A lista atingiu o limite de leitura e pode estar incompleta. Reduza o período para ver todos os itens.</p>
          )}
        </>
      )}
    </Panel>
  );
}
