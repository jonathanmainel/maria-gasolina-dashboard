import { BarChart3, CalendarDays, ChevronDown, Home, LayoutDashboard, LogOut, Menu, PanelsTopLeft, Settings, Users, X } from "lucide-react";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import SiGoogleads from "@icons-pack/react-simple-icons/icons/SiGoogleads";
import SiMeta from "@icons-pack/react-simple-icons/icons/SiMeta";
import { useAuth } from "../auth";
import { dateTime, longDate } from "../lib/format";
import type { DateRange } from "../types";

interface Props extends PropsWithChildren {
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
  lastSync?: string;
}

const navigation = [
  { id: "resumo", label: "Resumo", icon: LayoutDashboard },
  { id: "google-ads", label: "Google Ads", icon: SiGoogleads },
  { id: "performance-max", label: "Performance Max", icon: BarChart3 },
  { id: "meta-ads", label: "Meta Ads", icon: SiMeta },
];

export function DashboardShell({ range, onRangeChange, lastSync, children }: Props) {
  const [periodOpen, setPeriodOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [draft, setDraft] = useState(range);
  const periodRef = useRef<HTMLDivElement>(null);
  const { user, signOut } = useAuth();

  useEffect(() => setDraft(range), [range]);

  const applyPeriod = () => {
    if (draft.start <= draft.end) {
      onRangeChange(draft);
      setPeriodOpen(false);
    }
  };

  const goTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileOpen(false);
  };

  return (
    <div className="app-shell">
      <aside className={`side-rail ${mobileOpen ? "open" : ""}`}>
        <div className="brand-mark"><img src="/brand/maria-gasolina.svg" alt="Maria Gasolina" /></div>
        <nav aria-label="Seções do dashboard">
          {navigation.map(({ id, label, icon: Icon }, index) => (
            <button key={id} className={index === 0 ? "active" : ""} onClick={() => goTo(id)} title={label} aria-label={label}>
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <button className="rail-settings" title="Configurações" aria-label="Configurações"><Settings size={20} /></button>
      </aside>
      {mobileOpen && <button className="mobile-overlay" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}

      <header className="top-header">
        <div className="client-identity">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={21} /></button>
          <img src="/brand/maria-gasolina.svg" alt="" />
          <div><strong>Maria Gasolina Express</strong><span>Relatório de mídia</span></div>
        </div>

        <div className="period-control" ref={periodRef}>
          <button className="period-button" onClick={() => setPeriodOpen((value) => !value)} aria-expanded={periodOpen}>
            <CalendarDays size={17} />
            <span><small>Período analisado</small><strong>{longDate(range.start)} a {longDate(range.end)}</strong></span>
            <ChevronDown size={16} />
          </button>
          {periodOpen && <div className="period-popover">
            <div className="popover-heading"><strong>Escolher período</strong><button onClick={() => setPeriodOpen(false)} aria-label="Fechar"><X size={17} /></button></div>
            <label>Data inicial<input type="date" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></label>
            <label>Data final<input type="date" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></label>
            <p>A comparação será feita automaticamente com os dias imediatamente anteriores.</p>
            <button className="primary-button" onClick={applyPeriod}>Aplicar período</button>
          </div>}
        </div>

        <div className="header-actions">
          <div className="sync-label"><span>Última atualização</span><strong>{dateTime(lastSync)}</strong></div>
          <div className="user-menu-wrap">
            <button className="avatar-button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen}>
              <span>{(user?.email?.[0] ?? "M").toUpperCase()}</span><ChevronDown size={14} />
            </button>
            {menuOpen && <div className="user-menu">
              <p>{user?.email ?? "Visualização de demonstração"}</p>
              <button onClick={() => void signOut()}><LogOut size={16} />Sair</button>
            </div>}
          </div>
        </div>
      </header>
      <main className="dashboard-content">{children}</main>
    </div>
  );
}
