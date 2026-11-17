import { readFile } from "node:fs/promises";
import { parseBrl } from "../src/lib/brl.ts";

const headers = "cliente;plataforma;conta_id;data_referencia;medido_em;saldo_brl;estimativa_diaria_brl;id_origem;corrige_id_origem".split(";");
const platforms = new Set(["meta_ads", "google_ads"]);
const key = (...values) => JSON.stringify(values);

function csvRecords(csv) {
  const text = csv.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const records = [];
  let fields = [], value = "", line = 1, start = 1, state = "start";
  const field = () => { fields.push(value.trim()); value = ""; state = "start"; };
  for (let i = 0; i <= text.length; i++) {
    const char = text[i];
    if (state === "quoted") {
      if (char === undefined) throw new Error(`Aspas sem fechamento na linha ${start}.`);
      if (char === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') state = "closed";
      else { value += char; if (char === "\n") line++; }
    } else if (char === ";" || char === "\n" || char === undefined) {
      field();
      if (char !== ";") {
        if (fields.length > 1 || fields[0]) records.push({ line: start, fields });
        fields = [];
        start = ++line;
      }
    } else if (char === '"' && state === "start") state = "quoted";
    else if (state === "closed" || char === '"') {
      throw new Error(`Aspas em posição inválida na linha ${line}.`);
    } else { value += char; state = "plain"; }
  }
  return records;
}

function referenceDate(raw) {
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso.startsWith("0000")) return null;
  const date = new Date(iso + "T00:00:00Z");
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

function measurement(raw) {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)
    || !referenceDate(raw.slice(0, 10))) return null;
  const date = new Date(raw);
  if (!Number.isFinite(+date)) return null;
  const micros = (/\.(\d+)/.exec(raw)?.[1] ?? "").padEnd(6, "0");
  return date.toISOString().slice(0, 19) + "." + micros + "Z";
}

function snapshotAmount(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{1,12}(?:\.\d{1,2}0*)?$/.test(value)) {
    throw new Error("O contexto deve conter montantes decimais em texto ou null.");
  }
  const [whole, fraction = ""] = value.split(".");
  return whole.replace(/^0+(?=\d)/, "") + "." + fraction.slice(0, 2).padEnd(2, "0");
}

function indexBy(items, makeKey) {
  const grouped = new Map();
  for (const item of items) {
    const id = makeKey(item);
    const group = grouped.get(id) ?? [];
    group.push(item);
    grouped.set(id, group);
  }
  return grouped;
}

export function previewRetaguardaImport(csv, snapshot) {
  const [header, ...records] = csvRecords(csv);
  if (!header || key(...header.fields) !== key(...headers)) throw new Error("O cabeçalho deve seguir o modelo normalizado da Retaguarda.");
  if (!Array.isArray(snapshot?.accounts) || !Array.isArray(snapshot.entries)) throw new Error("O contexto deve conter accounts e entries.");
  const accounts = new Map();
  const clientIds = new Map();
  const clientSlugs = new Map();
  for (const { client_id, client_slug, platform, account_id } of snapshot.accounts) {
    const account = key(client_slug, platform, account_id);
    if (!Number.isSafeInteger(client_id) || client_id <= 0 || typeof client_slug !== "string" || !client_slug
      || !platforms.has(platform) || typeof account_id !== "string" || !account_id || accounts.has(account)
      || (clientIds.has(client_slug) && clientIds.get(client_slug) !== client_id)
      || (clientSlugs.has(client_id) && clientSlugs.get(client_id) !== client_slug)) {
      throw new Error("O contexto contém conta inválida ou vínculo ambíguo.");
    }
    accounts.set(account, client_id);
    clientIds.set(client_slug, client_id);
    clientSlugs.set(client_id, client_slug);
  }

  const existingById = new Map();
  const existingBySource = new Map();
  const accountScope = (row) => key(row.client_id, row.platform, row.account_id);
  const dayScope = (row) => key(accountScope(row), row.reference_date);
  const sourceScope = (row, source) => key(accountScope(row), source);
  const knownAccounts = new Set(snapshot.accounts.map(accountScope));
  const replaced = new Set();
  for (const row of snapshot.entries) {
    if (typeof row.id !== "string" || !row.id || existingById.has(row.id) || !knownAccounts.has(accountScope(row))
      || referenceDate(row.reference_date) !== row.reference_date || !["import", "manual", "api"].includes(row.origin)
      || (row.measured_at !== null && !measurement(row.measured_at))
      || (row.previous_id !== null && typeof row.previous_id !== "string")
      || (row.origin === "import" && (typeof row.source_key !== "string" || !row.source_key))) {
      throw new Error("O contexto deve conter versões financeiras completas e vinculadas às contas.");
    }
    const entry = { ...row, measured_at: row.measured_at === null ? null : measurement(row.measured_at),
      available_balance_brl: snapshotAmount(row.available_balance_brl), estimated_daily_spend_brl: snapshotAmount(row.estimated_daily_spend_brl) };
    existingById.set(entry.id, entry);
    if (entry.origin === "import") {
      const source = sourceScope(entry, entry.source_key);
      if (existingBySource.has(source)) throw new Error("O contexto contém uma chave de origem duplicada.");
      existingBySource.set(source, entry);
    }
    if (entry.previous_id !== null) {
      if (replaced.has(entry.previous_id)) throw new Error("O contexto contém versões concorrentes para o mesmo registro.");
      replaced.add(entry.previous_id);
    }
  }
  const current = new Map();
  const groups = indexBy([...existingById.values()], dayScope);
  for (const [group, entries] of groups) {
    const leaves = entries.filter((entry) => !replaced.has(entry.id));
    if (leaves.length !== 1) throw new Error("O contexto deve conter exatamente uma versão vigente por conta e data.");
    const visited = new Set();
    let next = leaves[0];
    while (next && !visited.has(next.id) && dayScope(next) === group) {
      visited.add(next.id);
      if (next.previous_id === null) break;
      next = existingById.get(next.previous_id);
    }
    if (visited.size !== entries.length || next?.previous_id !== null || dayScope(next) !== group) {
      throw new Error("O contexto contém um histórico de versões incompleto.");
    }
    current.set(group, leaves[0]);
  }

  const results = [];
  const candidates = [];
  for (const { line, fields } of records) {
    const result = { linha: line, status: "invalido", motivos: [], campos_ausentes: [] };
    results.push(result);
    if (fields.length !== headers.length) { result.motivos.push("Quantidade de colunas divergente do modelo."); continue; }
    const [client_slug, platform, account_id, rawDate, rawTime, balance, estimate, source_key, previous] = fields;
    const missing = [[client_slug, "cliente"], [platform, "plataforma"], [account_id, "conta_id"],
      [rawDate, "data_referencia"], [source_key, "id_origem"], [rawTime, "medido_em"],
      [balance, "saldo_brl"], [estimate, "estimativa_diaria_brl"]];
    result.campos_ausentes = missing.filter(([value]) => !value).map(([, label]) => label);
    const client_id = accounts.get(key(client_slug, platform, account_id));
    const reference_date = referenceDate(rawDate);
    const measured_at = rawTime ? measurement(rawTime) : null;
    const available_balance_brl = balance ? parseBrl(balance) : null;
    const estimated_daily_spend_brl = estimate ? parseBrl(estimate) : null;
    if (!client_id) result.motivos.push("Cliente, plataforma ou conta não confere com o cadastro.");
    if (!reference_date) result.motivos.push("Data de referência inválida.");
    if (rawTime && !measured_at) result.motivos.push("Horário de medição inválido ou sem fuso explícito.");
    if (!source_key) result.motivos.push("ID de origem obrigatório.");
    if ((balance && available_balance_brl === null) || (estimate && estimated_daily_spend_brl === null)) result.motivos.push("Valor monetário inválido.");
    if (!balance && !estimate) result.motivos.push("Informe pelo menos um dos valores financeiros.");
    if (result.motivos.length) continue;
    const row = { client_id, platform, account_id, reference_date, measured_at, available_balance_brl, estimated_daily_spend_brl, source_key, origin: "import" };
    candidates.push({ row, previous: previous || null, result });
    Object.assign(result, { plataforma: platform, data_referencia: reference_date, origem: "import" });
  }

  const signature = (row, previous) => key(row.reference_date, row.measured_at, row.available_balance_brl, row.estimated_daily_spend_brl, previous);
  const mark = (result, status, reason) => { result.status = status; if (reason) result.motivos.push(reason); };
  const bySource = indexBy(candidates, ({ row }) => sourceScope(row, row.source_key));
  const proposals = [];
  for (const [source, cluster] of bySource) {
    const [{ row, previous, result }] = cluster;
    if (new Set(cluster.map((entry) => signature(entry.row, entry.previous))).size !== 1) {
      for (const entry of cluster) mark(entry.result, "conflito", "Mesmo ID de origem com conteúdos divergentes no CSV.");
      continue;
    }
    const existing = existingBySource.get(source);
    if (existing) {
      const predecessor = existing.previous_id === null ? null : existingById.get(existing.previous_id);
      const samePredecessor = previous === null ? predecessor === null : predecessor?.origin === "import" && predecessor.source_key === previous;
      const same = samePredecessor && signature(existing, previous) === signature(row, previous);
      for (const entry of cluster) mark(entry.result, same ? "duplicado" : "conflito",
        same ? "Registro idêntico já presente no contexto." : "ID de origem existente com conteúdo ou versão diferente.");
    } else proposals.push({ source, row, previous, result, repeats: cluster.slice(1) });
  }
  const neighbors = indexBy(proposals, ({ row, previous }) => key(dayScope(row), previous));
  for (const { source, row, previous, result, repeats } of proposals) {
    const day = dayScope(row);
    const head = current.get(day);
    const parent = previous === null ? null : existingBySource.get(sourceScope(row, previous));
    if (neighbors.get(key(day, previous)).length > 1) {
      mark(result, "conflito", "Mais de uma proposta para a mesma versão inicial ou predecessora.");
    } else if (previous === null ? head !== undefined : !parent || parent !== head) {
      mark(result, "conflito", "A data já tem registro vigente ou a correção não aponta para a versão vigente no contexto ou em linha anterior.");
    } else {
      mark(result, "valido");
      current.set(day, row);
      existingBySource.set(source, row);
    }
    for (const repeat of repeats) mark(repeat.result, result.status === "valido" ? "duplicado" : result.status,
      result.status === "valido" ? "Linha idêntica repetida no CSV." : result.motivos[0]);
  }
  const totals = { analisados: results.length, validos: 0, invalidos: 0, duplicados: 0, conflitos: 0, incompletos: 0 };
  const fields = { valido: "validos", invalido: "invalidos", duplicado: "duplicados", conflito: "conflitos" };
  const coverage = new Map();
  for (const result of results) {
    totals[fields[result.status]]++;
    if (result.campos_ausentes.length) totals.incompletos++;
    if (result.status !== "valido") continue;
    const dates = coverage.get(result.plataforma) ?? new Set();
    dates.add(result.data_referencia);
    coverage.set(result.plataforma, dates);
  }
  return { modo: "dry-run", totais: totals, cobertura_validada: Object.fromEntries([...coverage].map(([platform, dates]) => [platform, [...dates].sort()])), linhas: results };
}

if (import.meta.main) {
  try {
    const [csvPath, contextPath, ...extra] = process.argv.slice(2);
    if (!csvPath || !contextPath || extra.length) throw new Error("Uso: node scripts/preview-retaguarda-import.mjs <CSV normalizado> <contexto JSON>");
    const [csv, context] = await Promise.all([readFile(csvPath, "utf8"), readFile(contextPath, "utf8")]);
    const report = previewRetaguardaImport(csv, JSON.parse(context.replace(/^\uFEFF/, "")));
    console.log(JSON.stringify(report, null, 2));
    if (report.totais.invalidos || report.totais.conflitos) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
