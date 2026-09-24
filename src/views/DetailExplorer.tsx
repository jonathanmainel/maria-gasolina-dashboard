import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { CampaignTable } from "../components/CampaignTable";
import { DataTable } from "../components/DataTable";
import { Panel, Skeleton } from "../components/ui/primitives";
import { getEntities, getPmax } from "../lib/api";
import {
  buildDetailRows, campaignToRow, includesPmax, levelsFor, matchesFront, resolveLevel, sourcesFor,
  type ChannelFilter, type DetailLevel, type DetailRow,
} from "../lib/detail-rows";
import { integer } from "../lib/format";
import type { CampaignRow, DateRange, EntityLevel, Front } from "../types";

// Bloco único de detalhamento. O canal vem do filtro do topo da página — não há
// seletor de plataforma aqui dentro, então é estruturalmente impossível ver
// "Google Ads" no topo e "Meta Ads" no detalhamento.

interface Props {
  front: Front;
  range: DateRange;
  channelFilter: ChannelFilter;
  campaigns: CampaignRow[];
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

  const sources = sourcesFor(channelFilter);
  const withPmax = includesPmax(level, channelFilter);

  const query = useQuery<DetailRow[]>({
    queryKey: ["detail", channelFilter, level, range.start, range.end],
    enabled: !isCampaign,
    queryFn: async () => {
      const entityLevel = level as EntityLevel;
      const [pages, pmax] = await Promise.all([
        Promise.all(sources.map((source) => getEntities(source, entityLevel, range))),
        withPmax ? getPmax(level === "group" ? "asset_group" : "asset", range) : null,
      ]);
      return buildDetailRows(pages.map((page) => page.items), pmax?.items ?? []);
    },
    retry: 1,
  });

  const campaignRows = useMemo(() => campaigns.map(campaignToRow), [campaigns]);

  const { items, skipped } = useMemo(() => {
    // Campanhas já chegam filtradas por frente e canal na página.
    if (isCampaign) return { items: campaignRows, skipped: 0 };
    const all = query.data ?? [];
    const matching = all.filter((row) => matchesFront(row, front));
    return { items: matching, skipped: all.length - matching.length };
  }, [isCampaign, campaignRows, query.data, front]);

  return (
    <Panel
      title="Detalhamento"
      description="Campanhas e os níveis abaixo delas, no canal e no período selecionados no topo"
      badge={<span className="badge ghost">{integer(items.length)} {active.id === "campaign" ? "campanhas" : "itens"}</span>}
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
        <CampaignTable campaigns={campaigns} emptyLabel={active.emptyLabel} />
      ) : query.isLoading ? (
        <Skeleton height={240} />
      ) : query.isError ? (
        <div className="inline-error"><AlertCircle size={17} />Não foi possível carregar este nível: {(query.error as Error)?.message ?? "erro desconhecido"}.</div>
      ) : (
        <>
          <DataTable items={items} emptyLabel={active.emptyLabel} showChannel={channelFilter === "all"} showAssetType={level === "ad"} />
          {skipped > 0 && (
            <p className="manual-foot">
              {integer(skipped)} item(ns) desta lista não têm a frente identificada pelo nome e ficaram de fora deste recorte.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
