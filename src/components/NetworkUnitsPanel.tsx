import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, FileSpreadsheet, Loader2, MapPinOff, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { dateTime, integer } from "../lib/format";
import {
  ACCEPT_ATTRIBUTE, COLUMN_LABELS, importErrorLabel, importNetworkUnits, parseUnitsWorkbook,
  WorkbookError, type ImportResponse, type ImportRow,
} from "../lib/network-import";
import { networkUnitsKey, useNetworkUnits } from "../lib/network-units";
import { Panel } from "./ui/primitives";

// ---------------------------------------------------------------------------
// Base de unidades — gerenciamento em Metas e ajustes
//
// Substituir a base é destrutivo, então a interface é de duas etapas e a
// primeira nunca grava:
//
//   1. o arquivo é lido no navegador e vira as linhas canônicas do contrato;
//   2. as linhas sobem com `dry_run: true` — a Edge Function valida, deduplica
//      e resolve geografia sem escrever nada;
//   3. o resumo da validação aparece, e só então o botão de confirmação existe;
//   4. confirmar repete a chamada com `dry_run: false`, que troca o snapshot.
//
// Selecionar o arquivo, portanto, não altera a base.
// ---------------------------------------------------------------------------

interface Pending {
  filename: string;
  rows: ImportRow[];
  response: ImportResponse;
}

/** Primeiros motivos de recusa, agrupados por código para não virar uma lista de 100 linhas. */
function groupIssues(response: ImportResponse) {
  const byCode = new Map<string, { count: number; rows: number[] }>();
  response.errors.forEach((issue) => {
    const entry = byCode.get(issue.code) ?? { count: 0, rows: [] };
    entry.count += 1;
    if (issue.row != null && entry.rows.length < 6) entry.rows.push(issue.row);
    byCode.set(issue.code, entry);
  });
  return [...byCode.entries()].map(([code, entry]) => ({ code, ...entry }));
}

export function NetworkUnitsPanel() {
  const { data, isPending: loadingBase, isError: baseError } = useNetworkUnits();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [pending, setPending] = useState<Pending | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [showReasons, setShowReasons] = useState(false);

  const reset = () => {
    setPending(null);
    setProblem(null);
    setShowReasons(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  // Etapa 1 e 2: leitura local e validação. Nada é gravado aqui.
  const validate = async (file: File) => {
    setReading(true);
    setProblem(null);
    setDone(null);
    setPending(null);
    setShowReasons(false);
    try {
      const workbook = await parseUnitsWorkbook(file);
      const response = await importNetworkUnits({
        filename: workbook.filename,
        rows: workbook.rows,
        dryRun: true,
      });
      setPending({ filename: workbook.filename, rows: workbook.rows, response });
      if (!response.ok) setProblem(importErrorLabel(response.error_code));
    } catch (error) {
      if (error instanceof WorkbookError) setProblem(error.message);
      else setProblem(error instanceof Error ? error.message : "Não foi possível validar a planilha.");
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      setReading(false);
    }
  };

  // Etapa 4: gravação real, só a partir de um dry run aprovado.
  const confirm = useMutation({
    mutationFn: async (target: Pending) =>
      importNetworkUnits({ filename: target.filename, rows: target.rows, dryRun: false }),
    onSuccess: async (response, target) => {
      if (!response.ok) {
        setProblem(importErrorLabel(response.error_code));
        return;
      }
      reset();
      setDone(`Base substituída por ${target.filename}.`);
      // O mapa, os indicadores do hero e este resumo passam a refletir a base
      // nova sem recarregar a página.
      await queryClient.invalidateQueries({ queryKey: networkUnitsKey });
    },
    onError: (error) => {
      setProblem(error instanceof Error ? error.message : "A importação falhou.");
    },
  });

  const summary = data?.summary;
  const validation = pending?.response;
  const busy = reading || confirm.isPending;

  return (
    <Panel
      title="Base de unidades"
      description="A planilha que alimenta o mapa da Visão executiva"
      noTilt
    >
      {loadingBase ? (
        <div className="units-state"><Loader2 size={15} className="spin" />Carregando a base atual…</div>
      ) : baseError || !summary ? (
        <div className="units-state warn"><AlertTriangle size={15} />Não foi possível ler a base atual. A substituição continua disponível.</div>
      ) : summary.total_units === 0 ? (
        <div className="units-state">Nenhuma unidade importada ainda.</div>
      ) : (
        <div className="units-current">
          <div className="units-figures">
            <div><strong>{integer(summary.total_units)}</strong><small>{summary.total_units === 1 ? "unidade" : "unidades"}</small></div>
            <div><strong>{integer(summary.total_cities)}</strong><small>{summary.total_cities === 1 ? "cidade" : "cidades"}</small></div>
          </div>
          <dl className="units-meta">
            <div>
              <dt>Última atualização</dt>
              <dd>{summary.last_import_at ? dateTime(summary.last_import_at) : "—"}</dd>
            </div>
            {summary.last_import?.filename && (
              <div>
                <dt>Arquivo</dt>
                <dd title={summary.last_import.filename}>{summary.last_import.filename}</dd>
              </div>
            )}
            {summary.unresolved_cities > 0 && (
              <div>
                <dt>Sem localização</dt>
                <dd className="warn">{summary.unresolved_cities === 1 ? "1 cidade" : `${integer(summary.unresolved_cities)} cidades`}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      <div className="units-upload">
        <input
          ref={inputRef}
          id="network-units-file"
          className="sr-only"
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void validate(file);
          }}
        />
        <label className="secondary-button" htmlFor="network-units-file" aria-disabled={busy}>
          {reading ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
          {reading ? "Validando planilha…" : "Selecionar planilha"}
        </label>
        <small>Aceita .xlsx e .xls, com as colunas {Object.values(COLUMN_LABELS).join(", ")}. A validação roda antes de qualquer alteração.</small>
      </div>

      {done && (
        <div className="units-state ok" role="status"><Check size={15} />{done}</div>
      )}

      {problem && (
        <div className="units-state warn" role="alert"><AlertTriangle size={15} />{problem}</div>
      )}

      {validation && (
        <div className="units-preview">
          <p className="units-preview-file"><FileSpreadsheet size={14} />{pending!.filename}</p>
          <ul className="units-preview-list">
            <li><b>{integer(validation.summary.total_rows)}</b> {validation.summary.total_rows === 1 ? "linha encontrada" : "linhas encontradas"}</li>
            <li><b>{integer(validation.summary.valid_rows)}</b> {validation.summary.valid_rows === 1 ? "unidade válida" : "unidades válidas"}</li>
            <li><b>{integer(validation.summary.duplicate_rows)}</b> {validation.summary.duplicate_rows === 1 ? "duplicata ignorada" : "duplicatas ignoradas"}</li>
            <li className={validation.summary.invalid_rows > 0 ? "warn" : ""}>
              <b>{integer(validation.summary.invalid_rows)}</b> {validation.summary.invalid_rows === 1 ? "linha não pôde ser importada" : "linhas não puderam ser importadas"}
            </li>
            <li className={validation.summary.unresolved_cities > 0 ? "warn" : ""}>
              <b>{integer(validation.summary.unresolved_cities)}</b> {validation.summary.unresolved_cities === 1 ? "cidade não localizada" : "cidades não localizadas"}
            </li>
          </ul>

          {validation.summary.unresolved_cities > 0 && (
            <p className="units-hint"><MapPinOff size={13} />Essas cidades entram na base, mas não aparecem no mapa porque não têm coordenada.</p>
          )}

          {validation.errors.length > 0 && (
            <div className="units-reasons">
              <button type="button" className="link-button" onClick={() => setShowReasons((open) => !open)} aria-expanded={showReasons}>
                {showReasons ? "Ocultar motivos" : "Ver motivos"}
              </button>
              {showReasons && (
                <ul>
                  {groupIssues(validation).map((issue) => (
                    <li key={issue.code}>
                      {importErrorLabel(issue.code)}{" "}
                      <span>
                        {issue.count === 1 ? "1 linha" : `${integer(issue.count)} linhas`}
                        {issue.rows.length > 0 && ` (linha ${issue.rows.join(", ")}${issue.count > issue.rows.length ? "…" : ""})`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="units-actions">
            <button type="button" className="secondary-button" onClick={reset} disabled={confirm.isPending}>Cancelar</button>
            <button
              type="button"
              className="primary-button"
              disabled={!validation.ok || confirm.isPending}
              onClick={() => { if (pending) confirm.mutate(pending); }}
            >
              {confirm.isPending ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
              {confirm.isPending ? "Atualizando base…" : "Atualizar base"}
            </button>
          </div>
          {validation.ok && (
            <p className="units-hint">A base atual será substituída pelas {integer(validation.summary.valid_rows)} unidades validadas.</p>
          )}
        </div>
      )}
    </Panel>
  );
}
