import { CalendarDays, ChevronDown, Filter, LogOut } from "lucide-react";
import { useState, type PropsWithChildren } from "react";
import { useAuth } from "../auth";
import { brandLogoUrl } from "../lib/app-path";
import { dateTime, longDate } from "../lib/format";
import type { CampaignScope, DashboardView, DateRange } from "../types";
import { PeriodPicker } from "./PeriodPicker";

interface Props extends PropsWithChildren {
  range: DateRange;
  comparisonEnabled: boolean;
  onPeriodApply: (range: DateRange, comparisonEnabled: boolean) => void;
  lastSync?: string;
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
  campaignScope: CampaignScope;
  onCampaignScopeChange: (scope: CampaignScope) => void;
}

const views: Array<{ id: DashboardView; label: string }> = [
  { id: "overview", label: "Visão Geral" },
  { id: "google", label: "Google Ads" },
  { id: "meta", label: "Meta Ads" },
  { id: "analytics", label: "Google Analytics" },
];

export function DashboardShell({ range, comparisonEnabled, onPeriodApply, lastSync, view, onViewChange, campaignScope, onCampaignScopeChange, children }: Props) {
  const [periodOpen, setPeriodOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, signOut } = useAuth();

  return (
    <div className="app-shell executive-shell">
      <header className="top-header executive-header">
        <div className="client-identity">
          <img src={brandLogoUrl} alt="Maria Gasolina" />
          <strong>Maria Gasolina Express</strong>
        </div>

        <nav className="view-tabs" aria-label="Visões do dashboard">
          {views.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? "active" : ""}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => onViewChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="header-controls">
          <div className="period-control">
            <button className="period-button" type="button" onClick={() => setPeriodOpen((value) => !value)} aria-expanded={periodOpen}>
              <CalendarDays size={18} />
              <span><small>Período</small><strong>{longDate(range.start)} a {longDate(range.end)}</strong></span>
              <ChevronDown size={16} />
            </button>
            {periodOpen && (
              <PeriodPicker
                range={range}
                comparisonEnabled={comparisonEnabled}
                onClose={() => setPeriodOpen(false)}
                onApply={(nextRange, nextComparison) => {
                  onPeriodApply(nextRange, nextComparison);
                  setPeriodOpen(false);
                }}
              />
            )}
          </div>

          <label className="campaign-scope-control">
            <Filter size={17} aria-hidden="true" />
            <span><small>Campanhas</small>
              <select
                aria-label="Finalidade da campanha"
                value={campaignScope}
                onChange={(event) => onCampaignScopeChange(event.target.value as CampaignScope)}
              >
                <option value="all">Todos os dados</option>
                <option value="franchise">Franquia</option>
                <option value="condominium">Condomínios</option>
              </select>
            </span>
            <ChevronDown size={15} aria-hidden="true" />
          </label>

          <div className="sync-label"><span>Atualizado em</span><strong>{dateTime(lastSync)}</strong></div>

          <div className="user-menu-wrap">
            <button className="avatar-button" type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen}>
              <span>{(user?.email?.[0] ?? "M").toUpperCase()}</span><ChevronDown size={14} />
            </button>
            {menuOpen && <div className="user-menu">
              <p>{user?.email ?? "Visualização de demonstração"}</p>
              <button type="button" onClick={() => void signOut()}><LogOut size={16} />Sair</button>
            </div>}
          </div>
        </div>
      </header>
      <main className={`dashboard-content ${comparisonEnabled ? "" : "comparison-hidden"}`}>{children}</main>
    </div>
  );
}
