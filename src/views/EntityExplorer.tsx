import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable } from "../components/DataTable";
import { Panel, Segmented, Skeleton } from "../components/ui/primitives";
import { classifyFront, getEntities, getPmax } from "../lib/api";
import { integer } from "../lib/format";
import type { CursorPage, DateRange, EntityItem, Front, PmaxItem, PmaxLevel, Source } from "../types";

// Detalhamento abaixo da campanha, com a nomenclatura de cada plataforma:
// no Meta o nível intermediário é "conjunto de anúncios", no Google é "grupo de
// anúncios" — os dois nunca aparecem com o mesmo rótulo. Palavras-chave e
// Performance Max existem só no Google.
//
// Os dados vêm das RPCs de leitura já existentes (`get_dashboard_entities` e
// `get_dashboard_pmax`), que agregam o período no banco. Como elas não conhecem
// o conceito de frente, a atribuição usa o mesmo padrão de nomenclatura das
// campanhas, e o que não casa é declarado em vez de sumir da tela.

type Level = "group" | "ad" | "keyword" | "pmax_asset_group" | "pmax_asset";

interface LevelOption {
  id: Level;
  label: string;
  source: Source;
  emptyLabel: string;
}

function levelsFor(source: Source): LevelOption[] {
  if (source === "meta_ads") {
    return [
      { id: "group", label: "Conjuntos de anúncios", source, emptyLabel: "Nenhum conjunto de anúncios com dados neste período." },
      { id: "ad", label: "Anúncios", source, emptyLabel: "Nenhum anúncio com dados neste período." },
    ];
  }
  return [
    { id: "group", label: "Grupos de anúncios", source, emptyLabel: "Nenhum grupo de anúncios com dados neste período." },
    { id: "ad", label: "Anúncios", source, emptyLabel: "Nenhum anúncio com dados neste período." },
    { id: "keyword", label: "Palavras-chave", source, emptyLabel: "Nenhuma palavra-chave com dados neste período." },
    { id: "pmax_asset_group", label: "PMax · grupos de recursos", source, emptyLabel: "Nenhum grupo de recursos Performance Max neste período." },
    { id: "pmax_asset", label: "PMax · recursos", source, emptyLabel: "Nenhum recurso Performance Max neste período." },
  ];
}

const pmaxLevel = (level: Level): PmaxLevel | null =>
  level === "pmax_asset_group" ? "asset_group" : level === "pmax_asset" ? "asset" : null;

function matchesFront(item: EntityItem | PmaxItem, front: Front) {
  const names = [item.item_name, "parent_name" in item ? item.parent_name : item.campaign_name];
  return names.some((name) => classifyFront(name) === front);
}

export function EntityExplorer({ front, range }: { front: Front; range: DateRange }) {
  const [source, setSource] = useState<Source>("meta_ads");
  const options = levelsFor(source);
  const [level, setLevel] = useState<Level>("group");
  const active = options.find((option) => option.id === level) ?? options[0];
  const asPmax = pmaxLevel(active.id);

  const query = useQuery<CursorPage<EntityItem | PmaxItem>>({
    queryKey: ["entities", source, active.id, range.start, range.end],
    queryFn: async () => (asPmax ? getPmax(asPmax, range) : getEntities(source, active.id as "group" | "ad" | "keyword", range)),
    retry: 1,
  });

  const { items, skipped } = useMemo(() => {
    const all = (query.data?.items ?? []) as Array<EntityItem | PmaxItem>;
    const matching = all.filter((item) => matchesFront(item, front));
    return { items: matching, skipped: all.length - matching.length };
  }, [query.data, front]);

  const changeSource = (next: Source) => {
    setSource(next);
    // "Palavras-chave" e PMax não existem no Meta: volta ao nível comum aos dois.
    if (next === "meta_ads" && level !== "group" && level !== "ad") setLevel("group");
  };

  return (
    <Panel
      title="Detalhamento"
      description="Abaixo do nível de campanha, com a nomenclatura de cada plataforma"
      actions={<Segmented value={source} onChange={changeSource} options={[{ id: "meta_ads", label: "Meta Ads" }, { id: "google_ads", label: "Google Ads" }]} />}
      noTilt
    >
      <div className="seg seg-wrap" role="tablist" style={{ marginBottom: 14 }}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active.id === option.id}
            className={active.id === option.id ? "active" : ""}
            onClick={() => setLevel(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <Skeleton height={240} />
      ) : query.isError ? (
        <div className="inline-error"><AlertCircle size={17} />Não foi possível carregar este nível: {(query.error as Error)?.message ?? "erro desconhecido"}.</div>
      ) : (
        <>
          <DataTable items={items} kind={asPmax ? "pmax" : "entity"} totalCount={items.length} emptyLabel={active.emptyLabel} />
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
