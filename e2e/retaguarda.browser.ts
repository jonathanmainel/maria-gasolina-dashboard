import { expect, test, type Page } from "@playwright/test";
import { apiOrigin, install, user } from "./fixtures/ui-audit.mjs";

const dashboard = "/dashboard/maria-gasolina?view=retaguarda";
const day = "2026-11-16";
const previousDay = "2026-11-14";

const sample = {
  account_id: "account-01",
  campaign_id: "campanha-de-marca",
  campaign_name: "Marca institucional",
  metric_date: day,
  impressions: 1100,
  clicks: 0,
  conversions: 0.125006,
  source: "google_ads",
};
const campaignRows = [
  sample, sample,
  { ...sample, account_id: "account-02", impressions: 150, clicks: 4, conversions: 0.5 },
  { ...sample, metric_date: previousDay, impressions: 20, clicks: 1, conversions: 0.25 },
  { ...sample, source: "meta_ads", impressions: 250, clicks: 0, conversions: 2 },
];
const acquisitionRows = [
  { metric_date: day, channel_group: "Organic Search", sessions: 22 },
  { metric_date: day, channel_group: "Organic Social", sessions: 18 },
  { metric_date: previousDay, channel_group: "Organic Video", sessions: 4 },
  { metric_date: day, channel_group: "Paid Search", sessions: 800 },
];

const finances = (page: Page) => page.getByRole("table", { name: "Histórico financeiro" });
const firstFinancialEntry = {
  id: "financial-original", platform: "meta_ads", account_id: "account-01", reference_date: day,
  available_balance_brl: 0, estimated_daily_spend_brl: 21.9, origin: "manual", previous_id: null, created_by: user.id,
  created_at: "2026-11-16T15:00:00Z", measured_at: "2026-11-16T15:00:00Z", request_key: "seed-request",
};

async function prepare(page: Page, options: {
  theme?: "dark" | "light"; empty?: boolean; failMeta?: boolean; holdMeta?: Promise<void>;
  finance?: boolean; seedFinance?: boolean; failWrite?: boolean; holdFinance?: Promise<void>; role?: "viewer" | "editor";
  writeMode?: "expired" | "conflict" | "lost"; multiAccounts?: boolean;
  spendMode?: "complete" | "partial" | "failed";
} = {}) {
  const audit = await install(page.context(), { appOrigin: test.info().project.use.baseURL, theme: options.theme, role: options.role ?? "admin" });
  await page.clock.setFixedTime(new Date("2026-11-17T16:00:00Z"));
  const reads: Array<{ source: string | null; from?: string; to?: string }> = [];
  const spendRows = Array.from({ length: 7 }, (_, i) => ({
    metric_date: `2026-11-${10 + i}`, ingested_at: "2026-11-17T04:00:08Z", extra_metrics: { currency_code: "BRL" },
  })).flatMap(row => [
    { ...row, account_id: "account-01", source: "meta_ads", spend: 20 },
    { ...row, account_id: "account-02", source: "google_ads", spend: 0 },
  ]);
  await page.context().route((url) => url.origin === apiOrigin && url.pathname.endsWith("/dashboard_daily_metrics")
    && url.searchParams.get("select")?.includes("extra_metrics") === true, async route => {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    expect(new URL(route.request().url()).searchParams.getAll("metric_date")).toEqual(["gte.2026-11-10", "lte.2026-11-16"]);
    return route.fulfill({ status: 200, headers, json: options.spendMode === "partial" ? spendRows.slice(2) : options.spendMode ? spendRows : [] });
  });
  await page.context().route(`${apiOrigin}/rest/v1/dashboard_automation_runs?*`, async route => {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const meta = new URL(route.request().url()).searchParams.get("source") === "eq.meta_ads";
    return route.fulfill({ status: 200, headers, json: { status: meta && options.spendMode === "failed" ? "failed" : "success" } });
  });
  await page.context().route(`${apiOrigin}/rest/v1/dashboard_*_daily?*`, async (route) => {
    const url = new URL(route.request().url());
    const campaigns = url.pathname.endsWith("/dashboard_campaign_daily");
    const acquisition = url.pathname.endsWith("/dashboard_ga4_acquisition_daily");
    if (!campaigns && !acquisition) return route.fallback();
    if (campaigns && !url.searchParams.has("source")) return route.fallback();
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    expect(url.searchParams.get("client_id")).toBe("eq.1");
    expect(url.searchParams.get("order")).toBe("id.asc");
    expect(route.request().method()).toBe("GET");
    const source = url.searchParams.get("source")?.slice(3) ?? null;
    const [from, to] = url.searchParams.getAll("metric_date").map((value) => value.slice(4));
    reads.push({ source, from, to });
    if (source === "meta_ads") await options.holdMeta;
    if (source === "meta_ads" && options.failMeta) return route.fulfill({ status: 400, headers, json: { message: "Falha sintética do Meta" } });
    const channels = url.searchParams.get("channel_group");
    const dataset = campaigns
      ? campaignRows.filter((row) => row.source === source)
      : acquisitionRows.filter((row) => channels?.includes(row.channel_group));
    const rows = options.empty ? [] : dataset.filter((row) => row.metric_date >= from && row.metric_date <= to);
    return route.fulfill({ status: 200, headers, json: rows });
  });
  const financialEntries = options.seedFinance ? [firstFinancialEntry] : [];
  if (options.multiAccounts) financialEntries.push(
    { ...firstFinancialEntry, id: "meta-second", account_id: "account-03", reference_date: previousDay, available_balance_brl: 12 },
    { ...firstFinancialEntry, id: "google-first", platform: "google_ads", account_id: "account-02", available_balance_brl: 30 },
    { ...firstFinancialEntry, id: "inactive", account_id: "account-inactive", available_balance_brl: 999 },
  );
  const financialWrites: Record<string, unknown>[] = [];
  const financialCalls: string[] = [];
  await page.context().route((url) => url.origin === apiOrigin && [
    "/rest/v1/rpc/get_retaguarda_financial_accounts", "/rest/v1/dashboard_retaguarda_financial_entries",
  ].includes(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    financialCalls.push(url.pathname);
    if (url.pathname.endsWith("/get_retaguarda_financial_accounts")) {
      expect(route.request().postDataJSON()).toEqual({ p_client_id: 1 });
      return route.fulfill({ status: 200, headers, json: options.finance ? [
        { platform: "meta_ads", account_id: "account-01", account_name: "Conta Meta", active: true },
        { platform: "google_ads", account_id: "account-02", account_name: "Conta Google", active: true },
        ...(options.multiAccounts ? [
          { platform: "meta_ads", account_id: "account-03", account_name: "Meta Secundária", active: true },
          { platform: "google_ads", account_id: "account-04", account_name: "Google Secundária", active: true },
          { platform: "meta_ads", account_id: "account-inactive", account_name: "Meta Arquivada", active: false },
        ] : []),
      ] : [] });
    }
    if (route.request().method() === "POST") {
      const draft = route.request().postDataJSON();
      financialWrites.push(draft);
      expect(draft.client_id).toBe(1);
      expect(draft).not.toHaveProperty("created_by");
      expect(draft).not.toHaveProperty("origin");
      expect(route.request().headers().authorization).toMatch(/^Bearer /);
      if (options.failWrite) return route.fulfill({ status: 403, headers, json: { code: "42501", message: "Permissão negada" } });
      if (options.writeMode === "expired") return route.fulfill({ status: 401, headers, json: { code: "PGRST303", message: "JWT expired" } });
      if (options.writeMode === "conflict") return route.fulfill({ status: 409, headers, json: { code: "23505", message: "Unique constraint" } });
      const entry = {
        ...firstFinancialEntry, ...draft,
        id: `financial-${financialEntries.length + 1}`,
        available_balance_brl: Number(draft.available_balance_brl), estimated_daily_spend_brl: draft.estimated_daily_spend_brl,
      };
      financialEntries.push(entry);
      if (options.writeMode === "lost") return route.abort("timedout");
      return route.fulfill({ status: 201, headers, json: entry });
    }
    await options.holdFinance;
    expect(url.searchParams.get("client_id")).toBe("eq.1");
    if (url.searchParams.has("request_key")) {
      const key = url.searchParams.get("request_key")?.slice(3);
      return route.fulfill({ status: 200, headers, json: financialEntries.filter((entry) => entry.request_key === key) });
    }
    const dates = url.searchParams.getAll("reference_date");
    const from = dates.find(value => value.startsWith("gte."))?.slice(4);
    const to = dates.find(value => value.startsWith("lte."))!.slice(4);
    return route.fulfill({ status: 200, headers, json: financialEntries.filter((entry) => (!from || entry.reference_date >= from) && entry.reference_date <= to) });
  });
  return { reads, audit, financialWrites, financialCalls };
}

const history = (page: Page) => page.getByRole("table", { name: "Acompanhamento diário de marketing" });

async function changePeriod(page: Page, start: string, end: string) {
  await page.getByRole("button", { name: /Período/i }).click();
  const picker = page.getByRole("dialog", { name: "Escolher período" });
  await picker.getByLabel("De", { exact: true }).fill(start);
  await picker.getByLabel("Até", { exact: true }).fill(end);
  await picker.getByRole("button", { name: "Aplicar período" }).click();
}

test("link direto e menu, agregação, dias ausentes e filtro global", async ({ page }) => {
  const { reads, audit } = await prepare(page);
  await page.goto(dashboard);
  await expect(page.getByRole("heading", { level: 1, name: "Retaguarda" })).toBeVisible();
  const menuItem = page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Retaguarda" });
  await expect(menuItem).toHaveAttribute("aria-current", "page");

  await expect(history(page).getByRole("row").filter({ hasText: "16/11/2026" }).getByRole("cell"))
    .toHaveText(["1.250", "4", "0,625006", "250", "0", "2", "40"]);
  await expect(history(page).getByRole("row").filter({ hasText: "15/11/2026" }).getByRole("cell"))
    .toHaveText(Array(7).fill("—"));
  await expect(history(page).locator("tfoot td")).toHaveText(["1.270", "5", "0,875006", "250", "0", "2", "44"]);
  await expect(page.getByText("Busca orgânica · Redes sociais orgânicas · Vídeo orgânico")).toBeVisible();
  await page.getByRole("button", { name: /Ver mais/ }).click();
  await expect(history(page).locator("tbody tr")).toHaveCount(30);

  await changePeriod(page, previousDay, previousDay);
  await expect(history(page).locator("tbody tr")).toHaveCount(1);
  await expect(history(page).locator("tbody th")).toHaveText("14/11/2026");
  await expect(history(page).locator("tfoot td")).toHaveText(["20", "1", "0,25", "—", "—", "—", "4"]);
  expect(reads.filter((read) => read.from === previousDay && read.to === previousDay).map((read) => read.source))
    .toEqual(expect.arrayContaining(["google_ads", "meta_ads", null]));
  expect(audit.writes).toEqual([]);
});

test("mantém as fontes saudáveis visíveis durante carregamento e falha do Meta", async ({ page }) => {
  let releaseMeta!: () => void;
  const held = new Promise<void>((resolve) => { releaseMeta = resolve; });
  await prepare(page, { failMeta: true, holdMeta: held });
  try {
    await page.goto(dashboard);
    await expect(page.getByRole("status", { name: "Carregando dados de Meta Ads" })).toBeVisible();
    await expect(history(page).locator("tfoot td")).toHaveText(["1.270", "5", "0,875006", "—", "—", "—", "44"]);
  } finally {
    releaseMeta();
  }
  await expect(page.getByRole("alert")).toContainText("Não foi possível carregar os dados de Meta Ads");
  await expect(history(page).locator("tfoot td")).toHaveText(["1.270", "5", "0,875006", "—", "—", "—", "44"]);
});

test("mostra o estado vazio com o financeiro indisponível", async ({ page }) => {
  await prepare(page, { empty: true });
  await page.goto(dashboard);
  await expect(page.getByText("Nenhum dado de mídia paga ou aquisição orgânica neste período.")).toBeVisible();
  await expect(page.getByText("Nenhum registro desta fonte no período.")).toHaveCount(3);
  await expect(page.getByText("Saldo não informado no resumo", { exact: true })).toHaveCount(2);
  await expect(history(page)).toHaveCount(0);
});

test("editor registra zero, corrige e consulta a versão anterior", async ({ page }) => {
  const { financialWrites } = await prepare(page, { finance: true, role: "editor" });
  await page.goto(dashboard);
  await page.getByRole("button", { name: "Registrar saldo", exact: true }).click();
  const form = page.getByRole("form", { name: "Registro financeiro" });
  await form.getByLabel("Plataforma").selectOption("meta_ads");
  await form.getByLabel("Data de referência").fill(day);
  await form.getByLabel("Saldo disponível (BRL)").fill("0,000");
  await expect(form.getByLabel("Estimativa de gastos diários (BRL)")).toHaveCount(0);
  await form.getByRole("button", { name: "Revisar registro" }).click();
  await expect(form.getByRole("alert")).toContainText("Use valores em reais");
  expect(financialWrites).toHaveLength(0);
  await form.getByLabel("Saldo disponível (BRL)").fill("0,00");
  await form.getByRole("button", { name: "Revisar registro" }).click();
  await expect(form).toContainText("0,00");
  expect(financialWrites).toHaveLength(0);
  await form.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(page.getByText("Registro financeiro salvo.")).toBeVisible();
  await expect(finances(page)).toContainText("0,00");
  await page.getByRole("button", { name: "Corrigir", exact: true }).click();
  await form.getByLabel("Saldo disponível (BRL)").fill("52,90");
  await form.getByRole("button", { name: "Revisar registro" }).click();
  await expect(form).toContainText("cria uma nova versão");
  await form.getByRole("button", { name: "Confirmar e salvar" }).click();
  await finances(page).getByText("Consultar 2 versões").click();
  await expect(finances(page).getByText("Versão anterior", { exact: true })).toBeVisible();
  await expect(finances(page)).toContainText("52,90");
  await expect(finances(page)).toContainText("0,00");
  expect(financialWrites.map((draft) => [draft.available_balance_brl, draft.previous_id])).toEqual([["0.00", null], ["52.90", "financial-1"]]);
  expect(financialWrites.map((draft) => draft.estimated_daily_spend_brl)).toEqual([null, null]);
  await changePeriod(page, previousDay, previousDay);
  await expect(page.getByText("Nenhum registro financeiro no período.")).toBeVisible();
});

test("a falha de gravação não anuncia sucesso e mantém os valores para nova tentativa", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { financialWrites } = await prepare(page, { finance: true, seedFinance: true, role: "editor", failWrite: true });
  await page.goto(dashboard);
  await page.getByRole("button", { name: "Corrigir", exact: true }).click();
  const form = page.getByRole("form", { name: "Registro financeiro" });
  await form.getByRole("button", { name: "Revisar registro" }).click();
  await form.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(form.getByRole("alert")).toContainText("não permite");
  await expect(page.getByText("Registro financeiro salvo.")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await form.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect.poll(() => financialWrites.length).toBe(2);
  expect(financialWrites[0].request_key).toBe(financialWrites[1].request_key);
});

test("viewer consulta sem controles de gravação", async ({ page }) => {
  await prepare(page, { finance: true, seedFinance: true, role: "viewer" });
  await page.goto(dashboard);
  await expect(finances(page)).toContainText("0,00");
  await expect(page.getByRole("button", { name: "Registrar saldo", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Corrigir", exact: true })).toHaveCount(0);
});

test("o carregamento financeiro preserva a leitura de mídia", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await prepare(page, { finance: true, seedFinance: true, holdFinance: held });
  try {
    await page.goto(`${dashboard}&share=1`);
    await expect(page.getByRole("status", { name: "Carregando histórico financeiro" })).toBeVisible();
    await expect(history(page).locator("tfoot td").last()).toHaveText("44");
  } finally {
    release();
  }
  await expect(finances(page)).toContainText("0,00");
  await expect(page.getByRole("button", { name: "Registrar saldo", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Corrigir", exact: true })).toHaveCount(0);
});

test("duplo clique após confirmar e resposta perdida geram um único lançamento", async ({ page }) => {
  const { financialWrites } = await prepare(page, { finance: true, role: "editor", writeMode: "lost" });
  await page.goto(dashboard);
  await page.getByRole("button", { name: "Registrar saldo", exact: true }).click();
  const form = page.getByRole("form", { name: "Registro financeiro" });
  await form.getByLabel("Data de referência").fill(day);
  await form.getByLabel("Saldo disponível (BRL)").fill("12,34");
  await form.getByRole("button", { name: "Revisar registro" }).click();
  await form.getByRole("button", { name: "Confirmar e salvar" }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByText("Registro financeiro salvo.")).toBeVisible();
  await expect(finances(page)).toContainText("12,34");
  expect(financialWrites).toHaveLength(1);
});

test("saldo atual independe do período e permite registro de hoje com histórico filtrado", async ({ page }) => {
  const { financialCalls, financialWrites } = await prepare(page, { finance: true, seedFinance: true, spendMode: "complete", role: "editor" });
  await page.goto(dashboard);
  const finance = page.getByRole("region", { name: "Financeiro da Retaguarda" });
  const meta = finance.locator(".panel").filter({ has: page.getByRole("heading", { name: "Meta Ads", exact: true }) });
  await expect(meta.getByText("Último saldo conhecido · independente do período")).toBeVisible();
  await expect(finances(page)).toContainText("0,00");
  const calls = financialCalls.length;
  await changePeriod(page, previousDay, previousDay);
  await expect(finance.getByText("Nenhum registro financeiro no período.")).toBeVisible();
  await expect(meta.getByText(/Saldo R\$\s*0,00/)).toBeVisible();
  await expect(meta.getByText(/7 de 7 dias em BRL/)).toBeVisible();
  expect(financialCalls.length).toBe(calls);
  await page.getByRole("button", { name: "Registrar saldo", exact: true }).click();
  const form = page.getByRole("form", { name: "Registro financeiro" });
  await expect(form.getByLabel("Data de referência")).toHaveValue("2026-11-17");
  await form.getByLabel("Saldo disponível (BRL)").fill("100,00");
  await form.getByRole("button", { name: "Revisar registro" }).click();
  await form.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(meta.getByText(/Saldo R\$\s*100,00/)).toBeVisible();
  await expect(finance.getByText("Nenhum registro financeiro no período.")).toBeVisible();
  expect(financialWrites).toHaveLength(1);
  expect(financialWrites[0].reference_date).toBe("2026-11-17");
});

for (const [writeMode, message] of [["conflict", "O histórico mudou"], ["expired", "Sua sessão expirou ou mudou"]] as const) {
  test(`gravação com ${writeMode} mostra a causa sem anunciar sucesso`, async ({ page }) => {
    const { financialWrites } = await prepare(page, { finance: true, seedFinance: true, role: "editor", writeMode });
    await page.goto(dashboard);
    await page.getByRole("button", { name: "Corrigir", exact: true }).click();
    const form = page.getByRole("form", { name: "Registro financeiro" });
    await form.getByRole("button", { name: "Revisar registro" }).click();
    await form.getByRole("button", { name: "Confirmar e salvar" }).click();
    await expect(form.getByRole("alert")).toContainText(message);
    await expect(page.getByText("Registro financeiro salvo.")).toHaveCount(0);
    expect(financialWrites).toHaveLength(1);
  });
}

test("múltiplas contas exigem cobertura da mesma data e permitem filtrar o histórico", async ({ page }) => {
  await prepare(page, { finance: true, seedFinance: true, multiAccounts: true });
  await page.goto(dashboard);
  const finance = page.getByRole("region", { name: "Financeiro da Retaguarda" });
  const metaSummary = finance.locator(".panel").filter({ has: page.getByRole("heading", { name: "Meta Ads", exact: true }) });
  const googleSummary = finance.locator(".panel").filter({ has: page.getByRole("heading", { name: "Google Ads", exact: true }) });
  await expect(metaSummary.getByText(/2 de 2 contas ativas/)).toBeVisible();
  await expect(metaSummary.getByText(/requer registros de todas as contas ativas/)).toBeVisible();
  await expect(metaSummary.getByText(/Meta Arquivada/)).toHaveCount(0);
  await expect(googleSummary.getByText(/1 de 2 contas ativas/)).toBeVisible();
  await expect(googleSummary.getByText("Saldo não informado", { exact: true })).toHaveCount(1);
  await finance.getByLabel("Filtrar por plataforma").selectOption("meta_ads");
  await finance.getByLabel("Filtrar por conta").selectOption({ label: "Meta Ads · Meta Secundária · account-03" });
  await expect(finances(page).locator("tbody tr")).toHaveCount(1);
  await finance.getByLabel("Filtrar por data").fill(day);
  await expect(finance.getByText("Nenhum registro para os filtros escolhidos.")).toBeVisible();
  await finance.getByLabel("Filtrar por data").fill(previousDay);
  await finances(page).getByRole("button", { name: "Corrigir", exact: true }).click();
  const form = page.getByRole("form", { name: "Registro financeiro" });
  await expect(form.getByLabel("Conta de anúncios")).toHaveValue("account-03");
  await form.getByLabel("Saldo disponível (BRL)").fill("55,22");
  await form.getByRole("button", { name: "Revisar registro" }).click();
  await form.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(finances(page).locator("tbody")).toContainText("55,22");
  await expect(metaSummary.getByText(/requer registros de todas as contas ativas/)).toBeVisible();
});

test("mostra gasto automático sem saldo e distingue zero, cobertura e falha da coleta", async ({ page }) => {
  await prepare(page, { finance: true, spendMode: "failed" });
  await page.goto(dashboard);
  const finance = page.getByRole("region", { name: "Financeiro da Retaguarda" });
  await expect(finance.getByText(/20,00 por dia · 7 de 7 dias em BRL/)).toBeVisible();
  await expect(finance.getByText(/^R\$\s*0,00 por dia · 7 de 7 dias em BRL$/)).toBeVisible();
  await expect(finance.getByText("Saldo não informado", { exact: true })).toHaveCount(2);
  await expect(finance.getByText(/última sincronização de mídia falhou/)).toBeVisible();
  await expect(finance.getByText(/Autonomia estimada/)).toHaveCount(0);
});

test("mostra cobertura parcial sem inventar uma estimativa em BRL", async ({ page }) => {
  await prepare(page, { finance: true, spendMode: "partial" });
  await page.goto(dashboard);
  const finance = page.getByRole("region", { name: "Financeiro da Retaguarda" });
  await expect(finance.getByText(/6 de 7 dias válidos em BRL/)).toHaveCount(2);
});

test("Site não carrega o código nem as consultas financeiras da Retaguarda", async ({ page }) => {
  const { financialCalls } = await prepare(page, { finance: true });
  const chunks: string[] = [];
  page.on("request", (request) => {
    if (/\/assets\/Retaguarda-[^/]+\.js$/.test(new URL(request.url()).pathname)) chunks.push(request.url());
  });
  await page.goto("/dashboard/maria-gasolina?view=site");
  await expect(page.getByRole("heading", { name: /comportamento dos usuários/ })).toBeVisible();
  await expect(page.getByText("Performance por canal", { exact: true })).toBeVisible();
  expect(financialCalls).toEqual([]);
  expect(chunks).toEqual([]);
  await page.getByRole("button", { name: "Retaguarda", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumo financeiro" })).toBeVisible();
  await expect.poll(() => financialCalls.length).toBeGreaterThan(0);
  expect(chunks).toHaveLength(1);
});

for (const [width, height, theme] of [[1440, 1000, "dark"], [1440, 1000, "light"], [820, 1000, "dark"], [820, 1000, "light"], [390, 844, "dark"], [390, 844, "light"]] as const) {
  test(`tabela e navegação em ${width}px no tema ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await prepare(page, { theme, finance: true, seedFinance: true, spendMode: "complete" });
    await page.goto(dashboard);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(history(page)).toBeVisible();
    await expect(history(page).locator("tfoot td").last()).toHaveText("44");
    await expect(finances(page)).toContainText("Conta Meta");
    await expect(page.getByText(/Autonomia estimada da plataforma/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width < 900) {
      const viewport = page.getByRole("region", { name: "Colunas do acompanhamento diário" });
      await expect(viewport).toBeVisible();
      expect(await viewport.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
      const menu = page.getByRole("button", { name: "Abrir navegação" });
      if (await menu.isVisible()) {
        await menu.click();
        await expect(page.getByRole("button", { name: "Retaguarda" })).toHaveAttribute("aria-current", "page");
        await page.getByRole("button", { name: "Retaguarda" }).click();
        await expect(page).toHaveURL(/view=retaguarda/);
      }
      await page.getByRole("link", { name: "Ver acompanhamento diário" }).click();
      await expect(page.getByRole("heading", { name: "Acompanhamento diário", exact: true })).toBeInViewport();
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`retaguarda-${width}-${theme}.png`), fullPage: true });
  });
}
