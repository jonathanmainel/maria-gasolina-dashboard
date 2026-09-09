import { BarChart3, CalendarDays, ChevronDown, LayoutDashboard, LogOut, Menu, Settings } from "lucide-react";
import { useEffect, useState, type PropsWithChildren } from "react";
import SiGoogleads from "@icons-pack/react-simple-icons/icons/SiGoogleads";
import SiMeta from "@icons-pack/react-simple-icons/icons/SiMeta";
import { useAuth } from "../auth";
import { brandLogoUrl } from "../lib/app-path";
import { dateTime, longDate } from "../lib/format";
import type { DateRange } from "../types";
import { PeriodPicker } from "./PeriodPicker";

interface Props extends PropsWithChildren {
  range: DateRange;
  comparisonEnabled: boolean;
  onPeriodApply: (range: DateRange, comparisonEnabled: boolean) => void;
  lastSync?: string;
}

const navigation = [
  { id: "resumo", label: "Resumo", icon: LayoutDashboard },
  { id: "google-ads", label: "Google Ads", icon: SiGoogleads },
  { id: "performance-max", label: "Performance Max", icon: BarChart3 },
  { id: "meta-ads", label: "Meta Ads", icon: SiMeta },
];

export function DashboardShell({ range, comparisonEnabled, onPeriodApply, lastSync, children }: Props) {
  const [periodOpen, setPeriodOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(navigation[0].id);
  const { user, signOut } = useAuth();

  useEffect(() => {
    let animationFrame: number | undefined;
    let lastScrollY = window.scrollY;

    const updateActiveSection = () => {
      const marker = window.innerWidth <= 760 ? 128 : 104;
      const isScrollingUp = window.scrollY < lastScrollY;
      const sectionIds = navigation
        .filter(({ id }) => document.getElementById(id))
        .map(({ id }) => id);

      const candidate = sectionIds
        .filter((id) => document.getElementById(id)!.getBoundingClientRect().top <= marker)
        .at(-1) ?? sectionIds[0];

      lastScrollY = window.scrollY;
      if (!candidate) return;

      setActiveSection((current) => {
        if (current === candidate) return current;

        const currentIndex = sectionIds.indexOf(current);
        const candidateIndex = sectionIds.indexOf(candidate);

        if (isScrollingUp && candidateIndex < currentIndex) {
          const currentSection = document.getElementById(current);
          if (currentSection && currentSection.getBoundingClientRect().top < marker + 32) return current;
        }

        return candidate;
      });
    };

    const handleScroll = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = undefined;
        updateActiveSection();
      });
    };

    updateActiveSection();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", updateActiveSection);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateActiveSection);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  const goTo = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileOpen(false);
  };

  return (
    <div className="app-shell">
      <aside className={`side-rail ${mobileOpen ? "open" : ""}`}>
        <div className="brand-mark"><img src={brandLogoUrl} alt="Maria Gasolina" /></div>
        <nav aria-label="Seções do dashboard">
          {navigation.map(({ id, label, icon: Icon }) => {
            const isActive = activeSection === id;
            return (
              <button key={id} className={isActive ? "active" : ""} onClick={() => goTo(id)} title={label} aria-label={label} aria-current={isActive ? "location" : undefined}>
                <Icon size={20} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
        <button className="rail-settings" title="Configurações" aria-label="Configurações"><Settings size={20} /></button>
      </aside>
      {mobileOpen && <button className="mobile-overlay" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}

      <header className="top-header">
        <div className="client-identity">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={21} /></button>
          <img src={brandLogoUrl} alt="" />
          <div><strong>Maria Gasolina Express</strong><span>Relatório de mídia</span></div>
        </div>

        <div className="period-control">
          <button className="period-button" onClick={() => setPeriodOpen((value) => !value)} aria-expanded={periodOpen}>
            <CalendarDays size={19} />
            <span><small>Período analisado</small><strong>{longDate(range.start)} a {longDate(range.end)}</strong></span>
            <ChevronDown size={18} />
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
      <main className={`dashboard-content ${comparisonEnabled ? "" : "comparison-hidden"}`}>{children}</main>
    </div>
  );
}
