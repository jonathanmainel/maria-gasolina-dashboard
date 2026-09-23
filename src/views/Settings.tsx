import { Check, Copy, Database, HardDrive, Link2, MonitorPlay, Moon, Printer, Sun } from "lucide-react";
import { useState } from "react";
import { ManualNumbersPanel } from "../components/ui/editable";
import { Panel } from "../components/ui/primitives";
import {
  deliveryFields, deliveryToValues, goalFields, goalsToValues, valuesToDelivery, valuesToGoals,
  valuesToWhatsapp, whatsappFields, whatsappToValues,
} from "../lib/manual-fields";
import { useManualData, useSaveManualData } from "../lib/manual-inputs";
import { useTheme } from "../theme";
import type { ManualBusinessData } from "../types";

/** Aviso de onde os dados manuais estão sendo gravados de fato. */
export function ManualStorageNote({ storage, reason }: { storage: "supabase" | "local"; reason?: string }) {
  if (storage === "supabase") {
    return (
      <div className="storage-note ok">
        <Database size={16} />
        <span>Os dados manuais estão salvos no Supabase (<code>dashboard_manual_inputs</code>) e valem para todo o time.</span>
      </div>
    );
  }
  return (
    <div className="storage-note warn">
      <HardDrive size={16} />
      <span>
        <b>Salvo apenas neste navegador.</b> {reason ? `${reason}. ` : ""}
        Aplique a migration <code>dashboard_manual_inputs</code> no projeto Supabase para que os valores passem a ser compartilhados entre os usuários.
      </span>
    </div>
  );
}

export function SettingsView({ shareUrl, onPresent }: { shareUrl: string; onPresent: () => void }) {
  const { data, storage, fallbackReason } = useManualData();
  const saveManual = useSaveManualData();
  const [copied, setCopied] = useState(false);
  const { theme, setTheme } = useTheme();

  const persist = (patch: Partial<ManualBusinessData>) => saveManual.mutateAsync({ ...data, ...patch });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard bloqueado pelo navegador: o link continua visível para cópia manual */ }
  };

  return (
    <div className="view-enter">
      <div className="view-head">
        <div>
          <span className="eyebrow"><i style={{ background: "var(--gold)" }} />Configurações do dashboard</span>
          <h1>Metas e dados de negócio, <em>sem mexer em código</em></h1>
          <p>Tudo o que o time GT+ define aqui alimenta o ritmo do mês, os anéis de entrega e as projeções em todas as telas.</p>
        </div>
      </div>

      <ManualStorageNote storage={storage} reason={fallbackReason} />

      <div className="grid grid-wide">
        <ManualNumbersPanel
          title="Metas do mês"
          description="Alimentam o ritmo do mês, os anéis e as projeções"
          fields={goalFields}
          values={goalsToValues(data.goals)}
          onSave={(next) => persist({ goals: valuesToGoals(next) })}
          saveLabel="Salvar metas"
        />
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <Panel title="Compartilhar somente leitura" description="Link para fundadores e diretoria abrirem sem criar conta" noTilt>
            <div className="share-box">
              <code>{shareUrl}</code>
              <button type="button" className="secondary-button" onClick={() => void copy()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copiado" : "Copiar link"}</button>
            </div>
            <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 11 }}><Link2 size={12} style={{ verticalAlign: -2 }} /> Em produção o link carrega um token assinado com validade e pode ser revogado.</p>
          </Panel>
          <Panel title="Apresentação e exportação" noTilt>
            <div style={{ display: "grid", gap: 10 }}>
              <button type="button" className="primary-button" onClick={onPresent}><MonitorPlay size={15} />Abrir modo apresentação (TV)</button>
              <button type="button" className="secondary-button" onClick={() => window.print()}><Printer size={15} />Exportar relatório em PDF</button>
            </div>
          </Panel>
          <Panel title="Aparência" noTilt>
            <div className="seg" style={{ width: "100%", display: "flex" }}>
              <button type="button" className={theme === "dark" ? "active" : ""} style={{ flex: 1 }} onClick={() => setTheme("dark")}><Moon size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Escuro premium</button>
              <button type="button" className={theme === "light" ? "active" : ""} style={{ flex: 1 }} onClick={() => setTheme("light")}><Sun size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Claro</button>
            </div>
          </Panel>
        </div>
      </div>

      <div className="section-title" style={{ marginTop: 22 }}>
        <div>
          <h2>Dados de negócio sem origem automática</h2>
          <p>Entregas do contrato e régua de WhatsApp não vêm de nenhuma API hoje. Preencha aqui e as telas usam estes números. O funil comercial é editado dentro de CRM e vendas.</p>
        </div>
      </div>
      <div className="grid grid-wide">
        <ManualNumbersPanel
          title="Entregas GT+ no mês"
          description="O combinado em contrato, item a item"
          badge={<span className="badge gold">Contrato</span>}
          fields={deliveryFields}
          values={deliveryToValues(data.delivery)}
          onSave={(next) => persist({ delivery: valuesToDelivery(next) })}
          saveLabel="Salvar entregas"
        />
        <ManualNumbersPanel
          title="Automação WhatsApp"
          description="Régua de relacionamento após o cadastro"
          badge={<span className="badge green">Ativa</span>}
          fields={whatsappFields}
          values={whatsappToValues(data.whatsapp)}
          onSave={(next) => persist({ whatsapp: valuesToWhatsapp(next) })}
          saveLabel="Salvar automação"
        />
      </div>
    </div>
  );
}
