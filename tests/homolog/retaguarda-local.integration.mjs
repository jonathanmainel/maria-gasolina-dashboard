import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

function loopback(name, protocol) {
  const url = new URL(process.env[name]);
  assert.equal(url.protocol, protocol, name);
  assert.equal(url.hostname, "127.0.0.1", `${name} deve apontar para localhost`);
  assert.ok(url.port, name);
  return url;
}

const url = loopback("RETAGUARDA_LOCAL_URL", "http:");
const dbUrl = loopback("RETAGUARDA_LOCAL_DB_URL", "postgresql:");
const psql = process.env.RETAGUARDA_LOCAL_PSQL;
const anonKey = process.env.RETAGUARDA_LOCAL_ANON_KEY;
const serviceKey = process.env.RETAGUARDA_LOCAL_SERVICE_KEY;
assert.ok(psql && anonKey && serviceKey);

function sql(statement) {
  const args = ["-X", "-Aqt", "-v", "ON_ERROR_STOP=1", "-d", dbUrl.href, "-f", "-"];
  const wsl = process.platform === "win32" && psql.startsWith("/");
  const result = spawnSync(wsl ? "wsl.exe" : psql,
    wsl ? ["-d", "Ubuntu", "--exec", psql, ...args] : args,
    { input: statement, encoding: "utf8", timeout: 20_000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
}

assert.equal(sql("select token from private.retaguarda_homolog_marker;"), "local-synthetic-only");
const client = (key = anonKey) => createClient(url.origin, key, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const service = client(serviceKey);
const anon = client();
const table = "dashboard_retaguarda_financial_entries";
const run = randomUUID().slice(0, 10);
const password = randomUUID() + "-Local!";
const actors = {};

function data(result, label) {
  assert.equal(result.error, null, `${label}: ${JSON.stringify(result.error)}`);
  return result.data;
}
const denied = (result, label) => assert.ok(result.error && [401, 403].includes(result.status),
  `${label}: ${result.status} ${JSON.stringify(result.error)}`);
const text = (value) => "'" + String(value).replaceAll("'", "''") + "'";

for (const role of ["admin", "editor", "viewer", "external"]) {
  const email = `retaguarda-${run}-${role}@example.invalid`;
  const { user } = data(await service.auth.admin.createUser({ email, password, email_confirm: true }), "Auth create");
  actors[role] = { id: user.id, email, api: client() };
}

const [clientId, otherId] = sql(`
  insert into public.dashboard_clients(slug,name)
  values ('finance-${run}-a','Retaguarda A'), ('finance-${run}-b','Retaguarda B')
  returning id;
`).split(/\r?\n/).map(Number);
assert.ok(clientId > 0 && otherId > 0 && clientId !== otherId);
sql(`
  insert into public.dashboard_client_users(client_id,user_id,role) values
  ${Object.entries(actors).map(([role, actor]) => `(${role === "external" ? otherId : clientId}, ${text(actor.id)}, ${text(role === "external" ? "admin" : role)})`).join(",")};
  insert into public.dashboard_source_accounts(client_id, source, account_id, active) values
    (${clientId},'meta_ads','meta-a',true), (${clientId},'meta_ads','meta-b',true),
    (${clientId},'meta_ads','meta-off',false), (${clientId},'google_ads','google-a',true),
    (${clientId},'google_ads','google-b',true), (${otherId},'meta_ads','meta-a',true);
`);
await Promise.all(Object.values(actors).map(async (actor) => {
  const { session } = data(await actor.api.auth.signInWithPassword({ email: actor.email, password }), "Auth login");
  assert.equal(session.user.id, actor.id);
  actor.session = session;
}));
const { admin, editor, viewer, external } = actors;
const base = { client_id: clientId, platform: "meta_ads", account_id: "meta-a", reference_date: "2026-01-01",
  available_balance_brl: "0.00", estimated_daily_spend_brl: "21.99", previous_id: null };
const write = (actor, draft) => actor.api.from(table).insert(draft).select().single();
const draft = (fields = {}) => ({ ...base, request_key: randomUUID(), ...fields });

const rootDraft = draft();
const root = data(await write(admin, rootDraft), "Admin grava");
assert.equal(root.created_by, admin.id);
assert.equal(root.origin, "manual");
assert.equal(root.available_balance_brl, 0);
assert.equal(root.estimated_daily_spend_brl, 21.99);
assert.equal(root.reference_date, "2026-01-01");
assert.ok(Date.parse(root.measured_at) > Date.parse(root.reference_date));
assert.equal(root.measured_at, root.created_at);
assert.equal((await write(admin, rootDraft)).error?.code, "23505");
assert.equal((await write(admin, { ...rootDraft, available_balance_brl: "9.00" })).error?.code, "23505");
assert.equal(data(await admin.api.from(table).select("id").eq("request_key", rootDraft.request_key).single(), "Confirma envio").id, root.id);

const corrected = await Promise.all([
  write(admin, draft({ previous_id: root.id, available_balance_brl: "10.01" })),
  write(editor, draft({ previous_id: root.id, available_balance_brl: "20.02" })),
]);
assert.equal(corrected.filter((result) => !result.error).length, 1);
assert.equal(corrected.find((result) => result.error).error.code, "23505");
const winner = corrected.find((result) => !result.error).data;
assert.equal(winner.previous_id, root.id);
const editorVersion = data(await write(editor, draft({ previous_id: winner.id, available_balance_brl: "30.03" })), "Editor corrige");
assert.equal(editorVersion.created_by, editor.id);
const adminVersion = data(await write(admin, draft({ previous_id: editorVersion.id, available_balance_brl: "40.04" })), "Admin corrige");
assert.equal(adminVersion.created_by, admin.id);
const chain = data(await viewer.api.from(table).select("id,previous_id,available_balance_brl").eq("client_id", clientId), "Viewer consulta");
assert.equal(chain.length, 4);
assert.ok(chain.some((row) => row.id === root.id && row.available_balance_brl === 0));
assert.equal(chain.filter((row) => !chain.some((candidate) => candidate.previous_id === row.id)).length, 1);
denied(await admin.api.from(table).update({ available_balance_brl: 1 }).eq("id", root.id), "Admin não sobrescreve");
denied(await editor.api.from(table).delete().eq("id", root.id), "Editor não exclui");
denied(await write(viewer, draft({ reference_date: "2026-01-02" })), "Viewer não cria");
denied(await write(viewer, draft({ previous_id: adminVersion.id })), "Viewer não corrige");
denied(await viewer.api.from(table).delete().eq("id", root.id), "Viewer não exclui");
denied(await anon.from(table).select(), "Anônimo não lê");
denied(await anon.from(table).insert(draft()), "Anônimo não grava");
denied(await anon.rpc("get_retaguarda_financial_accounts", { p_client_id: clientId }), "Anônimo não usa a função de contas");
assert.deepEqual(data(await external.api.from(table).select().eq("client_id", clientId), "Leitura externa isolada"), []);
assert.deepEqual(data(await external.api.rpc("get_retaguarda_financial_accounts", { p_client_id: clientId }), "Contas externas isoladas"), []);
denied(await write(external, draft({ reference_date: "2026-01-02" })), "Externo não grava");
denied(await write(external, draft({ created_by: admin.id })), "Externo não forja autor");
for (const actor of [viewer, external]) {
  const escalation = await actor.api.from("dashboard_client_users")
    .update({ role: "admin" }).eq("client_id", clientId).eq("user_id", actor.id).select("role");
  if (escalation.error) denied(escalation, "Elevação de perfil negada");
  else assert.deepEqual(escalation.data, [], "Elevação de perfil deve afetar zero linhas");
}
assert.equal(data(await viewer.api.from("dashboard_client_users").select("role").eq("client_id", clientId).single(), "Papel do Viewer").role, "viewer");
denied(await write(editor, draft({ client_id: otherId })), "Editor não grava no outro cliente");
denied(await write(editor, draft({ origin: "import" })), "Editor não forja origem");
denied(await write(editor, draft({ account_id: "meta-off" })), "Conta desativada sem raiz manual");
assert.equal((await write(editor, draft({ account_id: "meta-b", previous_id: adminVersion.id }))).error?.code, "23503");

const accounts = data(await viewer.api.rpc("get_retaguarda_financial_accounts", { p_client_id: clientId }), "Contas");
assert.equal(accounts.filter(({ platform, active }) => platform === "meta_ads" && active).length, 2);
assert.equal(accounts.filter(({ platform, active }) => platform === "google_ads" && active).length, 2);
assert.ok(accounts.some(({ account_id, active }) => account_id === "meta-off" && !active));
for (const value of ["-1", "0.001", "NaN", "Infinity"]) {
  assert.equal((await write(editor, draft({ reference_date: "2026-01-02", available_balance_brl: value }))).error?.code, "23514");
}
data(await write(editor, draft({ account_id: "meta-b", reference_date: "2026-01-02" })), "Outra conta e data");
const imported = { ...draft({ account_id: "google-a", platform: "google_ads", available_balance_brl: null }),
  origin: "import", measured_at: null, source_key: `form:${run}:1` };
const importRoot = data(await service.from(table).insert(imported).select().single(), "Importação sintética");
assert.equal(importRoot.measured_at, null);
assert.equal(importRoot.available_balance_brl, null);
assert.equal((await service.from(table).insert({ ...imported, reference_date: "2026-01-02", request_key: randomUUID() })).error?.code, "23505");
const fixed = data(await write(editor, draft({ account_id: "google-a", platform: "google_ads", previous_id: importRoot.id })), "Corrige lançamento importado");
assert.equal(fixed.previous_id, importRoot.id);
assert.equal(fixed.origin, "manual");
assert.deepEqual(data(await viewer.api.from(table).select("account_id").eq("client_id", clientId)
  .gte("reference_date", "2026-01-02").lte("reference_date", "2026-01-02"), "Filtro por datas"), [{ account_id: "meta-b" }]);

console.log("Validado com Auth/PostgREST: Admin, Editor, Viewer, externo, anônimo, isolamento, autoria, conflito, idempotência, importação sintética, precisão e período.");
if (process.env.RETAGUARDA_LOCAL_APP_URL) {
  await checkBrowser(loopback("RETAGUARDA_LOCAL_APP_URL", "http:"));
} else {
  console.log("Não testado: formulário no navegador com Auth/PostgREST reais (informe a URL do frontend local).");
}
// PostgREST allows 30 seconds of skew when validating exp.
const delay = (viewer.session.expires_at * 1000) - Date.now() + 31_500;
if (process.env.RETAGUARDA_TEST_WAIT_EXPIRY === "1" && viewer.session.expires_in <= 120) {
  if (delay > 0) await setTimeout(delay);
  const expired = await fetch(new URL(`/rest/v1/${table}?select=id`, url), {
    headers: { apikey: anonKey, Authorization: `Bearer ${viewer.session.access_token}` },
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(expired.status, 401, "PostgREST deve rejeitar o token emitido pelo Auth após expirar");
  console.log("Validado com Auth/PostgREST: expiração de token real.");
} else {
  console.log("Não testado: expiração de token real (ativar espera com JWT local de até 120 segundos).");
}

async function checkBrowser(appUrl) {
  const { chromium, expect } = await import("@playwright/test");
  const email = `retaguarda-${run}-browser@example.invalid`;
  const { user } = data(await service.auth.admin.createUser({ email, password, email_confirm: true }), "Auth browser fixture");
  const account = `meta-browser-${run}`;
  sql(`
    insert into public.dashboard_clients(slug,name) values ('maria-gasolina','Retaguarda Browser')
    on conflict (slug) do nothing;
    insert into public.dashboard_client_users(client_id,user_id,role)
      select id,${text(user.id)},'editor' from public.dashboard_clients where slug='maria-gasolina';
    insert into public.dashboard_source_accounts(client_id,source,account_id,account_name)
      select id,'meta_ads',${text(account)},'Conta local de teste' from public.dashboard_clients where slug='maria-gasolina';
  `);
  const { session } = data(await client().auth.signInWithPassword({ email, password }), "Auth browser login");
  // The app uses Google OAuth on its login screen. Start here with an actual
  // Auth-issued password session so the browser never needs a Google account.
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const context = await browser.newContext({ reducedMotion: "reduce", timezoneId: "America/Sao_Paulo" });
    await context.route("**/*", (route) => [url.origin, appUrl.origin].includes(new URL(route.request().url()).origin)
      ? route.continue() : route.abort());
    await context.addInitScript((session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)), session);
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.goto(new URL("/dashboard/maria-gasolina?view=retaguarda", appUrl).href);
    await page.getByRole("button", { name: "Registrar valores" }).click();
    const form = page.getByRole("form", { name: "Registro financeiro" });
    await form.getByLabel("Plataforma").selectOption("meta_ads");
    await form.getByLabel("Conta de anúncios").selectOption(account);
    await form.getByLabel("Saldo disponível (BRL)").fill("0");
    await form.getByLabel("Estimativa de gastos diários (BRL)").fill("24,21");
    await form.getByRole("button", { name: "Revisar registro" }).click();
    await form.getByRole("button", { name: "Confirmar e salvar" }).click();
    await expect(page.getByText("Registro financeiro salvo.")).toBeVisible({ timeout: 20_000 });
    const row = page.getByRole("table", { name: "Histórico financeiro" }).getByRole("row").filter({ hasText: account });
    await expect(row).toContainText("24,21");
    const metaPanel = page.getByRole("region", { name: "Financeiro da Retaguarda" })
      .locator(".panel").filter({ has: page.getByRole("heading", { name: "Meta Ads", exact: true }) });
    await expect(metaPanel.locator(".kpi-value")).toHaveText(["R$ 0,00", "R$ 24,21"]);
    await row.getByRole("button", { name: "Corrigir", exact: true }).click();
    await form.getByLabel("Saldo disponível (BRL)").fill("15,25");
    await form.getByRole("button", { name: "Revisar registro" }).click();
    await form.getByRole("button", { name: "Confirmar e salvar" }).click();
    await row.getByText("Consultar 2 versões").click();
    await expect(row).toContainText("15,25");
    await expect(row.getByText("Versão anterior", { exact: true })).toBeVisible();
    await expect(metaPanel.locator(".kpi-value")).toHaveText(["R$ 15,25", "R$ 24,21"]);
    console.log("Validado no Chrome com Auth/PostgREST reais: formulário, cadastro, atualização do histórico, correção e versão anterior.");
  } finally {
    await browser.close();
  }
}
