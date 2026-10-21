import { Building2, CalendarDays, ChevronDown, Download, Globe, Link2, LogOut, Menu, MonitorPlay, Moon, Rocket, Settings2, Sparkles, Sun, Users, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { useAuth } from "../auth";
import { brandLogoUrl } from "../lib/app-path";
import { dateTime, longDate, shortDate } from "../lib/format";
import { useTheme } from "../theme";
import type { AppView, CommercialFront, DateRange } from "../types";
import { PeriodPicker } from "./PeriodPicker";
import { Popover } from "./ui/popover";
import { LayoutDashboard, Heart as Instagram } from "lucide-react";
import { commercialCategories, commercialFronts, frontsForCategory, isCommercialFront, type CommercialCategory } from "../lib/fronts";

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

const viewTitles: Record<Exclude<AppView, CommercialFront>, { eyebrow: string; title: string }> = {
  executive: { eyebrow: "Visão executiva", title: "Resultado consolidado das três frentes" },
  organic: { eyebrow: "Frente 3 · Orgânico", title: "Instagram e Facebook" },
  site: { eyebrow: "Site · Google Analytics 4", title: "Comportamento dos usuários no site" },
  crm: { eyebrow: "CRM Elo · Vendas", title: "Funil comercial e receita" },
  settings: { eyebrow: "Configurações", title: "Metas, compartilhamento e exportação" },
};

export function Shell({ view, onViewChange, range, comparisonEnabled, onPeriodApply, lastSync, readOnly, onPresent, onShare, children }: Props) {
  const activeCategory = isCommercialFront(view) ? commercialFronts[view].category : null;
  const [expanded, setExpanded] = useState<Record<CommercialCategory, boolean>>(() => ({ place: activeCategory === "place", expansion: activeCategory === "expansion" }));
  useEffect(() => {
    if (activeCategory) setExpanded((current) => ({ ...current, [activeCategory]: true }));
  }, [view, activeCategory]);
  const title = isCommercialFront(view)
    ? { eyebrow: `${commercialFronts[view].category === "place" ? "Place" : "Expansão"} · ${commercialFronts[view].short}`, title: commercialFronts[view].label }
    : viewTitles[view];
  const [periodOpen, setPeriodOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 980px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 980px)");
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const closeNavigation = useCallback(() => { setNavOpen(false); menuButton.current?.focus(); }, []);
  useEffect(() => {
    if (!mobile || !navOpen) return;
    sidebar.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeNavigation(); }
      if (event.key !== "Tab") return;
      const buttons = [...(sidebar.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])].filter((button) => !button.closest("[hidden]"));
      const first = buttons[0]; const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [mobile, navOpen, closeNavigation]);
  const periodAnchor = useRef<HTMLButtonElement>(null);
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const closePeriod = useCallback(() => setPeriodOpen(false), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const initials = (user?.email ?? "gt")[0]?.toUpperCase() ?? "G";
  const go = (v: AppView) => { onViewChange(v); if (mobile) closeNavigation(); else setNavOpen(false); };
  const item = (id: AppView, label: string, icon: React.ReactNode, dot?: string) => (
    <button type="button" className={`nav-item ${view === id ? "active" : ""}`} onClick={() => go(id)} aria-current={view === id ? "page" : undefined}>{icon}{label}{dot && <span className={`dot ${dot}`} />}</button>
  );

  return (
    <div className="shell">
      <div className="ambient" />
      <Suspense fallback={null}><AmbientField /></Suspense>
      {navOpen && <div className="scrim" onClick={closeNavigation} />}
      <aside ref={sidebar} id="dashboard-sidebar" className={`sidebar ${navOpen ? "open" : ""}`} inert={mobile && !navOpen}>
        <div className="sidebar-brand">
          <img src={brandLogoUrl} alt="Maria Gasolina" />
          <div><strong>Maria Gasolina Express</strong><span>Performance Center</span></div>
        </div>
        <nav className="sidebar-navigation" aria-label="Navegação principal">
        <div className="sidebar-group">
          <small>Visão</small>
          {item("executive", "Visão executiva", <LayoutDashboard size={17} />)}
        </div>
        <div className="sidebar-group">
          <small>Frentes</small>
          {commercialCategories.map((category) => {
            const Icon = category.icon;
            return <div className="nav-category-group" key={category.id}>
              <button type="button" className="nav-item nav-category" aria-expanded={expanded[category.id]} aria-controls={`nav-${category.id}`} onClick={() => setExpanded((current) => ({ ...current, [category.id]: !current[category.id] }))}>
                <Icon size={17} />{category.label}<ChevronDown size={15} className="nav-category-chevron" />
              </button>
              <div id={`nav-${category.id}`} className="nav-subgroup" role="group" aria-label={`Frentes de ${category.label}`} hidden={!expanded[category.id]}>
                {frontsForCategory(category.id).map((front) => {
                  const FrontIcon = front.icon;
                  return <div key={front.id}>{item(front.view, front.short, <FrontIcon size={16} />, front.dataAvailability === "unavailable" ? "pending" : front.category === "place" ? "condominium" : "franchise")}</div>;
                })}
              </div>
            </div>;
          })}
          {item("organic", "Orgânico", <Instagram size={17} />, "organic")}
          {item("site", "Site", <Globe size={17} />, "site")}
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
        </nav>
        <div className="sidebar-footer">
          <p>Dados sincronizados diariamente com Meta Ads, Google Ads, GA4 e Meta Graph API.</p>
          <div className="agency-tag"><b>GT+</b><span><strong>Gestão GT+</strong>Marketing de performance</span></div>
        </div>
      </aside>

      <header className="topbar">
        <button ref={menuButton} type="button" className="icon-button menu-button" onClick={() => setNavOpen(true)} aria-label="Abrir navegação" aria-expanded={navOpen} aria-controls="dashboard-sidebar"><Menu size={18} /></button>
        <div className="topbar-title"><small>{title.eyebrow}</small><strong>{title.title}</strong></div>
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
