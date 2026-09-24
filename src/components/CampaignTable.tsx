import { useMemo, useState } from "react";
import { integer, money, percent } from "../lib/format";
import type { CampaignRow } from "../types";

// Tabela de campanhas — o primeiro nível do detalhamento. Mesma estrutura que
// vivia solta na página; aqui ela só ganhou estado próprio de ordenação.

type SortKey = keyof Pick<CampaignRow, "spend" | "leads" | "cpl" | "ctr" | "clicks" | "impressions" | "name">;

const PMAX = /performance ?max|pmax/i;

const statusLabel: Record<CampaignRow["status"], string> = {
  ACTIVE: "Ativa",
  LEARNING: "Aprendizado",
  REMOVED: "Removida",
  PAUSED: "Pausada",
};

export function CampaignTable({ campaigns, emptyLabel = "Nenhuma campanha com dados neste período." }: { campaigns: CampaignRow[]; emptyLabel?: string }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "leads", dir: "desc" });

  const sorted = useMemo(() => [...campaigns].sort((a, b) => {
    const av = a[sort.key]; const bv = b[sort.key];
    if (av == null) return 1; if (bv == null) return -1;
    const r = typeof av === "string" ? av.localeCompare(String(bv), "pt-BR") : Number(av) - Number(bv);
    return sort.dir === "asc" ? r : -r;
  }), [campaigns, sort]);

  const toggleSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
  const th = (key: SortKey, label: string, wide = false) => (
    <th className={wide ? "wide" : ""}>
      <button type="button" className={sort.key === key ? "active-sort" : ""} onClick={() => toggleSort(key)}>
        {label}{sort.key === key ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );

  if (!campaigns.length) return <div className="empty-state">{emptyLabel}</div>;

  return (
    <div className="table-wrap">
      <div className="desktop-table">
        <table>
          <thead><tr>{th("name", "Campanha", true)}<th>Canal</th><th>Status</th>{th("spend", "Investimento")}{th("impressions", "Impressões")}{th("clicks", "Cliques")}{th("ctr", "CTR")}{th("leads", "Leads")}{th("cpl", "CPL")}</tr></thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id}>
                <td className="name-cell">
                  <div className="entity-name">
                    <span>
                      <strong>{c.name}{PMAX.test(c.name) && <span className="chip pmax">PMax</span>}</strong>
                      <small>{c.objective}</small>
                    </span>
                  </div>
                </td>
                <td><span className={`chip ${c.channel === "meta_ads" ? "meta" : "google"}`}>{c.channel === "meta_ads" ? "Meta" : "Google"}</span></td>
                <td><span className={`status ${c.status}`}><i />{statusLabel[c.status]}</span></td>
                <td>{money(c.spend)}</td><td>{integer(c.impressions)}</td><td>{integer(c.clicks)}</td><td>{percent(c.ctr)}</td><td><b style={{ color: "var(--text)" }}>{integer(c.leads)}</b></td><td>{money(c.cpl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-rows">
        {sorted.map((c) => (
          <div className="mobile-row" key={c.id}>
            <div className="mobile-primary"><strong>{c.name}</strong><b>{integer(c.leads)} leads</b></div>
            <div className="mobile-details"><span>Invest. <b>{money(c.spend)}</b></span><span>CPL <b>{money(c.cpl)}</b></span><span>CTR <b>{percent(c.ctr)}</b></span><span>Cliques <b>{integer(c.clicks)}</b></span></div>
          </div>
        ))}
      </div>
      <p className="table-count">{campaigns.length} campanhas · {integer(campaigns.reduce((s, c) => s + c.leads, 0))} leads</p>
    </div>
  );
}
