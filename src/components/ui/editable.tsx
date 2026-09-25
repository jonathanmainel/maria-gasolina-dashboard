import { AlertCircle, Check, Loader2, Pencil, Save, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { integer, money } from "../../lib/format";
import { Panel } from "./primitives";

// Painel de valores de negócio preenchidos à mão.
//
// Regras de entrada, em um lugar só para todas as telas:
// - só número; string vazia, texto e NaN são recusados na hora de salvar;
// - nunca aceita negativo (nenhum destes campos admite valor abaixo de zero);
// - moeda entra em reais com centavos e sai formatada em pt-BR;
// - o botão salvar fica desabilitado enquanto a requisição está no ar, então um
//   clique repetido não dispara duas gravações;
// - erro de persistência aparece no próprio painel, sem sumir com o que foi digitado.

export type FieldKind = "currency" | "integer" | "decimal";

export interface NumberFieldSpec {
  key: string;
  label: string;
  hint?: string;
  kind?: FieldKind;
  /**
   * Abre um bloco com este título a partir deste campo. Serve para funis longos
   * (Franquias tem 10 etapas + 9 tempos + ticket): sem os blocos, o editor vira
   * uma parede de 20 caixas iguais. Sem `group` em nenhum campo, a lista sai
   * corrida como antes.
   */
  group?: string;
}

// Interno ao módulo: exportar uma função junto com um componente quebra o
// Fast Refresh do vite-plugin-react.
function formatByKind(value: number, kind: FieldKind = "integer") {
  if (kind === "currency") return money(value);
  if (kind === "decimal") return value.toFixed(1).replace(".", ",");
  return integer(value);
}

function toDraft(values: Record<string, number>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)]));
}

/** Quebra a lista nos campos que abrem bloco, preservando a ordem original. */
function toSections(fields: NumberFieldSpec[]): Array<{ title?: string; fields: NumberFieldSpec[] }> {
  const sections: Array<{ title?: string; fields: NumberFieldSpec[] }> = [];
  fields.forEach((field) => {
    if (field.group || !sections.length) sections.push({ title: field.group, fields: [] });
    sections[sections.length - 1].fields.push(field);
  });
  return sections;
}

interface Props {
  title: string;
  description?: string;
  badge?: ReactNode;
  fields: NumberFieldSpec[];
  values: Record<string, number>;
  onSave: (next: Record<string, number>) => Promise<unknown>;
  /** Bloco de leitura opcional exibido acima dos campos (métricas derivadas, por exemplo). */
  summary?: ReactNode;
  footNote?: ReactNode;
  saveLabel?: string;
}

export function ManualNumbersPanel({ title, description, badge, fields, values, onSave, summary, footNote, saveLabel = "Salvar" }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() => toDraft(values));
  const [invalid, setInvalid] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Fora do modo de edição o rascunho sempre reflete o valor persistido.
  useEffect(() => { if (!editing) setDraft(toDraft(values)); }, [values, editing]);
  useEffect(() => { if (!saved) return; const timer = window.setTimeout(() => setSaved(false), 2600); return () => window.clearTimeout(timer); }, [saved]);

  const sections = toSections(fields);

  const cancel = () => { setDraft(toDraft(values)); setInvalid([]); setError(null); setEditing(false); };

  const submit = async () => {
    if (saving) return;
    const parsed: Record<string, number> = {};
    const bad: string[] = [];
    fields.forEach((field) => {
      const raw = (draft[field.key] ?? "").replace(",", ".").trim();
      const value = raw === "" ? Number.NaN : Number(raw);
      if (!Number.isFinite(value) || value < 0) { bad.push(field.key); return; }
      parsed[field.key] = field.kind === "currency" || field.kind === "decimal" ? Math.round(value * 100) / 100 : Math.round(value);
    });
    if (bad.length) { setInvalid(bad); setError("Revise os campos destacados: use apenas números iguais ou maiores que zero."); return; }

    setInvalid([]);
    setError(null);
    setSaving(true);
    try {
      await onSave(parsed);
      setEditing(false);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const actions = editing ? (
    <div className="manual-actions">
      <button type="button" className="secondary-button" onClick={cancel} disabled={saving}><X size={15} />Cancelar</button>
      <button type="button" className="primary-button" onClick={() => void submit()} disabled={saving} aria-busy={saving}>
        {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}{saving ? "Salvando..." : saveLabel}
      </button>
    </div>
  ) : (
    <button type="button" className="secondary-button" onClick={() => setEditing(true)}><Pencil size={15} />Editar dados</button>
  );

  return (
    <Panel title={title} description={description} badge={badge} actions={actions} noTilt>
      {summary}
      {sections.map((section, index) => (
        <div key={section.title ?? index} className="manual-section">
          {section.title && <h4 className="manual-section-title">{section.title}</h4>}
          {editing ? (
            <div className="form-grid">
              {section.fields.map((field) => (
                <div className={`field ${invalid.includes(field.key) ? "field-invalid" : ""}`} key={field.key}>
                  <label htmlFor={`manual-${field.key}`}>{field.label}</label>
                  <input
                    id={`manual-${field.key}`}
                    type="number"
                    min={0}
                    step={field.kind === "currency" ? "0.01" : field.kind === "decimal" ? "0.1" : "1"}
                    inputMode="decimal"
                    value={draft[field.key] ?? ""}
                    disabled={saving}
                    onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                  {field.hint && <small>{field.hint}</small>}
                </div>
              ))}
            </div>
          ) : (
            <dl className="manual-readout">
              {section.fields.map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{formatByKind(values[field.key] ?? 0, field.kind)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ))}
      {error && <p className="manual-error" role="alert"><AlertCircle size={15} />{error}</p>}
      {saved && <p className="manual-saved"><Check size={15} />Valores salvos. As telas já refletem os novos números.</p>}
      {footNote && <p className="manual-foot">{footNote}</p>}
    </Panel>
  );
}
