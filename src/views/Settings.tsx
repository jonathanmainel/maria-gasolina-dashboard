import { Check, Copy, Link2, MonitorPlay, Moon, Printer, RotateCcw, Save, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Panel } from "../components/ui/primitives";
import { useGoals } from "../lib/goals";
import { useTheme } from "../theme";
import type { Goals } from "../types";

const fields: Array<{ key: keyof Goals; label: string; hint: string; prefix?: string }> = [
  { key: "media_budget", label: "Verba de mídia mensal", hint: "Teto contratual: R$ 50.000", prefix: "R$" },
  { key: "leads_franchise", label: "Meta de leads · Franquias", hint: "Candidatos a franqueado por mês" },
  { key: "leads_condominium", label: "Meta de leads · Condomínios", hint: "Indicações de condomínio por mês" },
  { key: "cpl_franchise", label: "CPL alvo · Franquias", hint: "Custo máximo aceitável por lead", prefix: "R$" },
  { key: "cpl_condominium", label: "CPL alvo · Condomínios", hint: "Custo máximo aceitável por lead", prefix: "R$" },
  { key: "posts", label: "Posts no feed por mês", hint: "Contrato: 20" },
  { key: "stories", label: "Stories por mês", hint: "Contrato: 20" },
  { key: "followers_growth", label: "Novos seguidores por mês", hint: "Instagram + Facebook" },
  { key: "contracts_franchise", label: "Contratos de franquia por mês", hint: "Meta comercial (CRM)" },
  { key: "contracts_condominium", label: "Lojas em condomínio por mês", hint: "Meta comercial (CRM)" },
];

export function SettingsView({ shareUrl, onPresent }: { shareUrl: string; onPresent: () => void }) {
  const [goals, save, reset] = useGoals();
  const [draft, setDraft] = useState<Goals>(goals);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const { theme, setTheme } = useTheme();
  useEffect(() => setDraft(goals), [goals]);
  useEffect(() => { if (!saved) return; const t = window.setTimeout(() => setSaved(false), 2200); return () => window.clearTimeout(t); }, [saved]);
  const copy = async () => { try { await navigator.clipboard.writeText(shareUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } };

  return (
    <div className="view-enter">
      <div className="view-head">
        <div>
          <span className="eyebrow"><i style={{ background: "var(--gold)" }} />Configurações do dashboard</span>
          <h1>Metas editáveis, <em>sem mexer em código</em></h1>
          <p>Tudo o que o time GT+ define aqui alimenta o ritmo do mês, os anéis de entrega e as projeções em todas as telas.</p>
        </div>
      </div>
      <div className="grid grid-wide">
        <Panel title="Metas do mês" description="Salvas neste navegador; em produção ficam no Supabase por cliente">
          <div className="form-grid">
            {fields.map((f) => (
              <div className="field" key={f.key}>
                <label htmlFor={f.key}>{f.label}</label>
                <input id={f.key} type="number" min={0} value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })} />
                <small>{f.hint}</small>
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button type="button" className="primary-button" onClick={() => { save(draft); setSaved(true); }}><Save size={15} />Salvar metas</button>
            <button type="button" className="secondary-button" onClick={() => { reset(); }}><RotateCcw size={15} />Voltar ao contrato</button>
          </div>
        </Panel>
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <Panel title="Compartilhar somente leitura" description="Link para fundadores e diretoria abrirem sem criar conta">
            <div className="share-box">
              <code>{shareUrl}</code>
              <button type="button" className="secondary-button" onClick={() => void copy()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copiado" : "Copiar link"}</button>
            </div>
            <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 11 }}><Link2 size={12} style={{ verticalAlign: -2 }} /> Em produção o link carrega um token assinado com validade e pode ser revogado.</p>
          </Panel>
          <Panel title="Apresentação e exportação">
            <div style={{ display: "grid", gap: 10 }}>
              <button type="button" className="primary-button" onClick={onPresent}><MonitorPlay size={15} />Abrir modo apresentação (TV)</button>
              <button type="button" className="secondary-button" onClick={() => window.print()}><Printer size={15} />Exportar relatório em PDF</button>
            </div>
          </Panel>
          <Panel title="Aparência">
            <div className="seg" style={{ width: "100%", display: "flex" }}>
              <button type="button" className={theme === "dark" ? "active" : ""} style={{ flex: 1 }} onClick={() => setTheme("dark")}><Moon size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Escuro premium</button>
              <button type="button" className={theme === "light" ? "active" : ""} style={{ flex: 1 }} onClick={() => setTheme("light")}><Sun size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Claro</button>
            </div>
          </Panel>
        </div>
      </div>
      {saved && <div className="toast"><Check size={16} />Metas salvas. Todas as telas já refletem os novos valores.</div>}
    </div>
  );
}
