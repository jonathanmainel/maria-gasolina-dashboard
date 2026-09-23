import { Building2, CalendarDays, ChevronDown, Download, Link2, LogOut, Menu, MonitorPlay, Moon, Rocket, Settings2, Sparkles, Sun, Users, X } from "lucide-react";
import { lazy, Suspense, useCallback, useRef, useState, type PropsWithChildren } from "react";
import { useAuth } from "../auth";
import { brandLogoUrl } from "../lib/app-path";
import { dateTime, longDate, shortDate } from "../lib/format";
import { useTheme } from "../theme";
import type { AppView, DateRange } from "../types";
import { PeriodPicker } from "./PeriodPicker";
import { Popover } from "./ui/popover";
import { LayoutDashboard, Heart as Instagram } from "lucide-react";

const AmbientField = lazy(() => import("./three/AmbientField").then((m) => ({ default: m.AmbientField })));

interface Props extends PropsWithChildren {
  view: AppView;
  onViewChange: (view: AppView) => void;
  range: DateRange;
  comparisonEnabled: boolean;
  onPeriodApply: (range: DateRange, comparisonEnabled: boolean) => void;
  lastSync?: string;
  readOnly?: boolean;
  onPresent: () => void;
  onShare: () => void;
}

const viewTitles: Record<AppView, { eyebrow: string; title: string }> = {
  executive: { eyebrow: "Visão executiva", title: "Resultado consolidado das três frentes" },
  franchise: { eyebrow: "Frente 1 · Tráfego pago", title: "Expansão de franquias" },
  condominium: { eyebrow: "Frente 2 · Tráfego pago", title: "Captação de condomínios" },
  organic: { eyebrow: "Frente 3 · Orgânico", title: "Instagram e Facebook" },
  crm: { eyebrow: "CRM Elo · Vendas", title: "Funil comercial e receita" },
  settings: { eyebrow: "Configurações", title: "Metas, compartilhamento e exportação" },
};

export function Shell({ view, onViewChange, range, comparisonEnabled, onPeriodApply, lastSync, readOnly, onPresent, onShare, children }: Props) {
  const [periodOpen, setPeriodOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const periodAnchor = useRef<HTMLButtonElement>(null);
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const closePeriod = useCallback(() => setPeriodOpen(false), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const initials = (user?.email ?? "gt")[0]?.toUpperCase() ?? "G";
  const go = (v: AppView) => { onViewChange(v); setNavOpen(false); };
  const item = (id: AppView, label: string, icon: React.ReactNode, dot?: string) => (
    <button type="button" className={`nav-item ${view === id ? "active" : ""}`} onClick={() => go(id)} aria-current={view === id ? "page" : undefined}>{icon}{label}{dot && <span className={`dot ${dot}`} />}</button>
  );

  return (
    <div className="shell">
      <div className="ambient" />
      <Suspense fallback={null}><AmbientField /></Suspense>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <img src={brandLogoUrl} alt="Maria Gasolina" />
          <div><strong>Maria Gasolina Express</strong><span>Performance Center</span></div>
        </div>
        <div className="sidebar-group">
          <small>Visão</small>
          {item("executive", "Visão executiva", <LayoutDashboard size={17} />)}
        </div>
        <div className="sidebar-group">
          <small>Frentes</small>
          {item("franchise", "Franquias", <Rocket size={17} />, "franchise")}
          {item("condominium", "Condomínios", <Building2 size={17} />, "condominium")}
          {item("organic", "Orgânico", <Instagram size={17} />, "organic")}
        </div>
        <div className="sidebar-group">
          <small>Comercial</small>
          {item("crm", "CRM e vendas", <Users size={17} />, "crm")}
        </div>
        {!readOnly && (
          <div className="sidebar-group">
            <small>Sistema</small>
            {item("settings", "Metas e ajustes", <Settings2 size={17} />)}
          </div>
        )}
        <div className="sidebar-footer">
          <p>Dados sincronizados diariamente com Meta Ads, Google Ads, GA4 e Meta Graph API.</p>
          <div className="agency-tag"><b>GT+</b><span><strong>Gestão GT+</strong>Marketing de performance</span></div>
        </div>
      </aside>

      <header className="topbar">
        <button type="button" className="icon-button menu-button" onClick={() => setNavOpen(true)} aria-label="Abrir navegação"><Menu size={18} /></button>
        <div className="topbar-title"><small>{viewTitles[view].eyebrow}</small><strong>{viewTitles[view].title}</strong></div>
        <div className="topbar-actions">
          <div className="sync-pill"><i />{lastSync ? `Atualizado ${dateTime(lastSync).replace(/,/, " ·")}` : "Ainda não sincronizado"}</div>
          <div className="period-control">
            <button ref={periodAnchor} type="button" className="period-button" onClick={() => setPeriodOpen((o) => !o)} aria-expanded={periodOpen} aria-haspopup="dialog">
              <CalendarDays size={16} />
              <span><small>Período</small><strong className="period-long">{longDate(range.start)} — {longDate(range.end)}</strong><strong className="period-short">{shortDate(range.start)} — {shortDate(range.end)}</strong></span>
              <ChevronDown size={15} />
            </button>
            <Popover open={periodOpen} onClose={closePeriod} anchorRef={periodAnchor} label="Escolher período" width={760}>
              <PeriodPicker range={range} comparisonEnabled={comparisonEnabled} onApply={(r, c) => { onPeriodApply(r, c); setPeriodOpen(false); }} onClose={closePeriod} />
            </Popover>
          </div>
          <button type="button" className="icon-button" onClick={toggle} aria-label="Alternar tema" title={theme === "dark" ? "Modo claro" : "Modo escuro"}>{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button>
          <button type="button" className="icon-button" onClick={() => window.print()} aria-label="Exportar PDF" title="Exportar relatório em PDF"><Download size={17} /></button>
          {!readOnly && <button type="button" className="icon-button" onClick={onShare} aria-label="Compartilhar" title="Link somente leitura"><Link2 size={17} /></button>}
          <button type="button" className="icon-button accent" onClick={onPresent} aria-label="Modo apresentação" title="Apresentar em tela cheia"><MonitorPlay size={17} /></button>
          {!readOnly && (
            <div className="user-menu-wrap">
              <button ref={menuAnchor} type="button" className="avatar-button" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu do usuário" aria-expanded={menuOpen} aria-haspopup="dialog">{initials}</button>
              <Popover open={menuOpen} onClose={closeMenu} anchorRef={menuAnchor} label="Menu do usuário" width={230}>
                <div className="user-menu">
                  <p>{user?.email ?? "Demonstração local"}</p>
                  <button type="button" onClick={() => void signOut()}><LogOut size={15} />Sair da conta</button>
                </div>
              </Popover>
            </div>
          )}
        </div>
      </header>

      <main className="content"><div className="content-inner">{children}</div></main>
      <span hidden><Sparkles /><X /></span>
    </div>
  );
}
