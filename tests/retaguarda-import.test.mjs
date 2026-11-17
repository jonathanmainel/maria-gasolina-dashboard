import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { previewRetaguardaImport } from "../scripts/preview-retaguarda-import.mjs";

const header = (await readFile(new URL("../docs/retaguarda-financeiro-modelo.csv", import.meta.url), "utf8")).trim();
const csv = (...rows) => "\uFEFF" + [header, ...rows].join("\r\n") + "\r\n";
const meta = { client_slug: "cliente-teste", client_id: 2, platform: "meta_ads", account_id: "001" };
const google = { ...meta, platform: "google_ads", account_id: "001" };
const base = { accounts: [meta, google], entries: [] };
const row = (date, id, { source = "meta_ads", account = "001", timestamp = "", balance = "1.234,56", estimate = "0,00", previous = "" } = {}) =>
  ["cliente-teste", source, account, date, timestamp, balance, estimate, id, previous].join(";");
const existing = {
  id: "row-original", client_id: 2, platform: "meta_ads", account_id: "001", reference_date: "2026-11-05",
  measured_at: "2026-11-05T12:00:00.123456+00:00", available_balance_brl: "1234.56", estimated_daily_spend_brl: "0.0000",
  source_key: "form:1", previous_id: null, origin: "import",
};

test("modelo vazio, datas brasileiras, zero, campos ausentes e cobertura", () => {
  assert.equal(previewRetaguardaImport(csv(), base).totais.analisados, 0);
  const report = previewRetaguardaImport(csv(
    row("05/11/2026", '"form;linha ""a"""', { balance: "0", estimate: "" }),
    row("2026-11-05", "form:2", { source: "google_ads" }),
    row("31/02/2026", "form:3"),
    row("05/11/2026", "form:4", { account: "1" }),
    row("05/11/2026", "form:5", { timestamp: "2026-11-05T09:00" }),
    row("05/11/2026", "form:6", { balance: "-100", estimate: "1,999" }),
  ), base);
  assert.deepEqual(report.totais, { analisados: 6, validos: 2, invalidos: 4, duplicados: 0, conflitos: 0, incompletos: 5 });
  assert.deepEqual(report.cobertura_validada, { meta_ads: ["2026-11-05"], google_ads: ["2026-11-05"] });
  assert.deepEqual(report.linhas[0].campos_ausentes, ["medido_em", "estimativa_diaria_brl"]);
  assert.match(report.linhas[3].motivos[0], /conta não confere/);
});

test("distingue duplicata persistida, versão válida, chave reutilizada e bifurcação", () => {
  const report = previewRetaguardaImport(csv(
    row("05/11/2026", "form:1", { timestamp: "2026-11-05T09:00:00.123456-03:00" }),
    row("05/11/2026", "form:2", { previous: "form:1", balance: "0,01" }),
    row("05/11/2026", "form:2", { previous: "form:1", balance: "0,01" }),
    row("05/11/2026", "form:3", { previous: "form:2", balance: "0,02" }),
    row("06/11/2026", "form:4"),
    row("06/11/2026", "form:5"),
    row("07/11/2026", "form:6"),
    row("08/11/2026", "form:6"),
  ), { ...base, entries: [existing] });
  assert.deepEqual(report.linhas.map(({ status }) => status),
    ["duplicado", "valido", "duplicado", "valido", "conflito", "conflito", "conflito", "conflito"]);
});

test("rejeita cadeia incompleta, correção de outra conta e data ocupada por registro manual", () => {
  assert.throws(() => previewRetaguardaImport(csv(), { ...base, entries: [{ ...existing, previous_id: "missing" }] }), /histórico de versões incompleto/);
  assert.throws(() => previewRetaguardaImport(csv(), { ...base, entries: [existing, {
    ...existing, id: "row-other-day", reference_date: "2026-11-06", source_key: "form:other", previous_id: existing.id,
  }] }), /versão|histórico/);
  const report = previewRetaguardaImport(csv(
    row("05/11/2026", "form:x", { source: "google_ads", previous: "form:1" }),
    row("05/11/2026", "form:y"),
  ), { ...base, entries: [{ ...existing, origin: "manual", source_key: null }] });
  assert.equal(report.totais.conflitos, 2);
});

test("rejeita arquivo bruto e CSV com aspas incompletas", () => {
  assert.throws(() => previewRetaguardaImport("Data,Saldo\n2026-11-05,0", base), /cabeçalho/);
  assert.throws(() => previewRetaguardaImport(csv('"não terminado'), base), /Aspas sem fechamento/);
});
