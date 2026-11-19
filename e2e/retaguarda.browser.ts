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

const finances = (page: Page) => page.getByRole("region", { name: "Financeiro da Retaguarda" });
const firstFinancialEntry = {
  id: "financial-original", platform: "meta_ads", account_id: "account-01", reference_date: day,
  available_balance_brl: 0, estimated_daily_spend_brl: 21.9, origin: "manual", previous_id: null, created_by: user.id,
  created_at: "2026-11-16T15:00:00Z", measured_at: "2026-11-16T15:00:00Z", request_key: "seed-request",
};

async function prepare(page: Page, options: {
  theme?: "dark" | "light"; empty?: boolean; failMeta?: boolean; holdMeta?: Promise<void>;
  finance?: boolean; seedFinance?: boolean; failWrite?: boolean; holdFinance?: Promise<void>; role?: "viewer" | "editor";
  writeMode?: "expired" | "conflict" | "lost"; multiAccounts?: boolean;
  balanceMode?: "success" | "failure" | "conflict";
  balanceReady?: boolean; balanceBlocked?: boolean;
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
  const balanceRequests: Record<string, unknown>[] = [];
  await page.context().route(`${apiOrigin}/functions/v1/request-meta-balance`, async route => {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const body = route.request().postDataJSON();
    if (body.action === "status") return route.fulfill({ status: 200, headers, json: {
      available: options.balanceReady !== false, can_request: options.balanceReady !== false && options.role !== "viewer",
      reason: options.balanceReady === false ? "BALANCE_NOT_HOMOLOGATED" : null, server_time: "2026-11-17T16:00:00Z",
      accounts: [{ account_id: "account-01", allowed: true, status: null, manual_blocked_today: !!options.balanceBlocked }],
    } });
    balanceRequests.push(body);
    expect(body).toEqual({ client_slug: "maria-gasolina", account_id: "account-01", request_key: expect.any(String) });
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    if (options.balanceMode !== "success") return route.fulfill({ status: options.balanceMode === "conflict" ? 409 : 502,
      headers, json: { state: options.balanceMode === "conflict" ? "conflict" : "failed" } });
    financialEntries.push({ ...firstFinancialEntry, id: "synthetic-api-balance", origin: "api", reference_date: "2026-11-17", available_balance_brl: 123.45,
      estimated_daily_spend_brl: null, previous_id: null, created_at: "2026-11-17T16:00:00Z", measured_at: "2026-11-17T16:00:00Z" });
    return route.fulfill({ status: 200, headers, json: { state: "success", entry_id: "synthetic-api-balance" } });
  });
  const financialCalls: string[] = [];
  await page.context().route((url) => url.origin === apiOrigin && [
    "/rest/v1/rpc/get_retaguarda_financial_accounts", "/rest/v1/dashboard_retaguarda_financial_entries",
    "/rest/v1/rpc/get_retaguarda_latest_balances", "/rest/v1/rpc/get_retaguarda_meta_balance_status",
    "/rest/v1/rpc/get_retaguarda_financial_day_head",
  ].includes(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    financialCalls.push(url.pathname);
    if (url.pathname.endsWith("/get_retaguarda_financial_day_head")) {
      const args = route.request().postDataJSON(); expect(args.p_client_id).toBe(1);
      const replaced = new Set(financialEntries.map(entry => entry.previous_id));
      return route.fulfill({ status: 200, headers, json: financialEntries.filter(entry => !replaced.has(entry.id)
        && entry.platform === args.p_platform && entry.account_id === args.p_account_id && entry.reference_date === args.p_reference_date).slice(0,1) });
    }
    if (url.pathname.endsWith("/get_retaguarda_meta_balance_status"))
      return route.fulfill({ status: 200, headers, json: [] });
    if (url.pathname.endsWith("/get_retaguarda_latest_balances")) {
      await options.holdFinance;
      const replaced = new Set(financialEntries.map(entry => entry.previous_id));
      const latest = new Map<string, typeof firstFinancialEntry>();
      for (const entry of financialEntries.filter(entry => !replaced.has(entry.id) && entry.available_balance_brl !== null)) {
        const key = `${entry.platform}:${entry.account_id}`;
        if (!latest.has(key) || latest.get(key)!.reference_date < entry.reference_date) latest.set(key, entry);
      }
      return route.fulfill({ status: 200, headers, json: [...latest.values()] });
    }
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
    throw new Error("A interface não deve consultar séries de histórico financeiro.");
  });
  return { reads, audit, financialWrites, financialCalls, balanceRequests };
}

const history = (page: Page) => page.getByRole("table", { name: "Acompanhamento diário de marketing" });

test("resumo compacto e popover por clique e teclado, sem repetir dados", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await prepare(page, { finance: true, seedFinance: true, spendMode: "complete" });
  await page.goto(dashboard);
  await expect(page.getByRole("button", { name: "Atualizar saldo Meta agora" })).toBeEnabled();
  const meta = page.locator('.retaguarda-finance-card').filter({ has: page.getByRole('heading', { name: 'Meta Ads', exact: true }) });
  await expect(meta.getByText('Conta Meta', { exact: true })).toHaveCount(0);
  await expect(meta.getByText(/account-01/)).toHaveCount(0);
  await expect(meta.getByText(/Autonomia estimada:/)).toHaveCount(1);
  expect((await meta.boundingBox())!.height).toBeLessThan(300);
  const trigger = meta.getByRole('button', { name: 'Informações financeiras de Meta Ads' });
  await trigger.focus(); await page.keyboard.press('Enter');
  const details = page.getByRole('dialog', { name: 'Informações financeiras de Meta Ads' });
  await expect(details.getByText('Conta Meta', { exact: true })).toBeVisible();
  await expect(details.getByText('ID: account-01', { exact: true })).toBeVisible();
  await expect(details.getByText(/Última coleta de gastos/)).toBeVisible();
  await page.keyboard.press('Escape'); await expect(details).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click(); await page.locator('.overlay-backdrop').click({ position: { x: 2, y: 2 } });
  await expect(details).toHaveCount(0);
  const styles = await meta.getByRole('button', { name: 'Atualizar saldo Meta agora' }).evaluate(el => {
    const s = getComputedStyle(el); return { height: el.getBoundingClientRect().height, paddingTop: s.paddingTop, paddingBottom: s.paddingBottom, lineHeight: parseFloat(s.lineHeight), fontSize: parseFloat(s.fontSize), align: s.alignItems };
  });
  expect(styles).toMatchObject({ height: 40, paddingTop: '0px', paddingBottom: '0px', align: 'center' });
  expect(styles.lineHeight / styles.fontSize).toBeCloseTo(1.2);
  await page.getByRole('button', { name: 'Ver atualização das fontes' }).click();
  const todayButton = page.getByRole('button', { name: 'Ver Hoje · parcial' });
  await expect(todayButton).toBeVisible();
  expect(await todayButton.evaluate(el => parseFloat(getComputedStyle(el).lineHeight)/parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(1.2);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: test.info().outputPath('finance-compact.png'), fullPage: true });
});

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
  await expect(page.getByText("Saldo não informado", { exact: true })).toHaveCount(2);
  await expect(history(page)).toHaveCount(0);
});

test("editor registra zero e corrige pela folha vigente sem exibir versões anteriores", async ({ page }) => {
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
  await page.getByRole("button", { name: "Registrar saldo", exact: true }).click();
  await form.getByLabel("Data de referência").fill(day);
  await expect(form.getByLabel("Saldo disponível (BRL)")).toHaveValue(/0,00/);
  await form.getByLabel("Saldo disponível (BRL)").fill("52,90");
  await form.getByRole("button", { name: "Revisar registro" }).click();
  await expect(form).toContainText("cria uma nova versão");
  await form.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(finances(page)).toContainText("52,90");
  await expect(page.getByRole("table", { name: "Histórico financeiro" })).toHaveCount(0);
  await expect(page.getByText("Consultar 2 versões")).toHaveCount(0);
  expect(financialWrites.map((draft) => [draft.available_balance_brl, draft.previous_id])).toEqual([["0.00", null], ["52.90", "financial-1"]]);
  expect(financialWrites.map((draft) => draft.estimated_daily_spend_brl)).toEqual([null, null]);
  await changePeriod(page, previousDay, previousDay);
  await expect(finances(page)).toContainText("52,90");
});

test("a falha de gravação não anuncia sucesso e mantém os valores para nova tentativa", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { financialWrites } = await prepare(page, { finance: true, seedFinance: true, role: "editor", failWrite: true });
  await page.goto(dashboard);
  await page.getByRole("button", { name: "Registrar saldo", exact: true }).click();
  const form = page.getByRole("form", { name: "Registro financeiro" });
  await form.getByLabel("Data de referência").fill(day);
  await expect(form.getByLabel("Saldo disponível (BRL)")).toHaveValue(/0,00/);
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
  await expect(page.getByRole("button", { name: "Atualizar saldo Meta agora", exact: true })).toHaveCount(0);
});

test("editor consulta saldo no backend e atualiza resumo sem depender do período", async ({ page }) => {
  const { balanceRequests, financialWrites } = await prepare(page, { finance: true, seedFinance: true, role: "editor", balanceMode: "success" });
  await page.goto(dashboard);
  await page.getByRole("button", { name: "Atualizar saldo Meta agora" }).click();
  await expect(page.getByText("Nova medição confirmada e registrada.")).toBeVisible();
  const finance = page.getByRole("region", { name: "Financeiro da Retaguarda" });
  await expect(finance.getByText(/^R\$\s*123,45$/)).toBeVisible();
  await finance.getByRole('button', { name: 'Informações financeiras de Meta Ads' }).click();
  await expect(page.getByRole('dialog').getByText(/Meta Ads API · confirmado pela API oficial/)).toBeVisible();
  await page.keyboard.press('Escape');
  expect(balanceRequests).toHaveLength(1); expect(financialWrites).toEqual([]);
  await changePeriod(page, previousDay, previousDay);
  await expect(finance.getByText(/^R\$\s*123,45$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Histórico financeiro" })).toHaveCount(0);
});

test("falha e conflito da coleta não anunciam novo saldo nem removem o manual", async ({ page }) => {
  await prepare(page, { finance: true, seedFinance: true, balanceMode: "conflict" });
  await page.goto(dashboard);
  await page.getByRole("button", { name: "Atualizar saldo Meta agora" }).click();
  await expect(page.getByText(/O saldo manual\/importado ou uma alteração concorrente foi preservado/)).toBeVisible();
  await expect(page.getByText("Nova medição confirmada e registrada.")).toHaveCount(0);
  await expect(finances(page)).toContainText("0,00");
});

test("homologação desligada mantém botão desativado e registro manual disponível", async ({ page }) => {
  const { balanceRequests } = await prepare(page, { finance: true, balanceReady: false, role: "editor" });
  await page.goto(dashboard);
  await expect(page.getByText(/Coleta automática em homologação/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Atualizar saldo Meta agora" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Registrar saldo", exact: true })).toBeEnabled();
  expect(balanceRequests).toEqual([]);
});

test("saldo manual no mesmo dia bloqueia também a rotina horária", async ({ page }) => {
  await prepare(page, { finance: true, balanceBlocked: true }); await page.goto(dashboard);
  await expect(page.getByText(/atualização automática e pelo botão bloqueadas/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Atualizar saldo Meta agora" })).toBeDisabled();
});

test("registra saldo de hoje com histórico antigo, resolve a versão vigente e mantém consultas separadas", async ({ page }) => {
  const { financialWrites } = await prepare(page, { finance: true, seedFinance: true, role: "editor" });
  await page.goto(dashboard); await changePeriod(page, previousDay, previousDay);
  await page.getByRole("button", { name: "Registrar saldo", exact: true }).click();
  const form = page.getByRole("form", { name: "Registro financeiro" });
  await expect(form.getByLabel("Data de referência")).toHaveValue("2026-11-17");
  await form.getByLabel("Saldo disponível (BRL)").fill("100,00");
  await form.getByRole("button", { name: "Revisar registro" }).click();
  await form.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(finances(page).getByText(/^R\$\s*100,00$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Histórico financeiro" })).toHaveCount(0);
  expect(financialWrites[0].reference_date).toBe("2026-11-17");
});

test("o carregamento financeiro preserva a leitura de mídia", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await prepare(page, { finance: true, seedFinance: true, holdFinance: held });
  try {
    await page.goto(`${dashboard}&share=1`);
    await expect(finances(page).getByText("Carregando saldos", { exact: true })).toHaveCount(2);
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

for (const [writeMode, message] of [["conflict", "O histórico mudou"], ["expired", "Sua sessão expirou ou mudou"]] as const) {
  test(`gravação com ${writeMode} mostra a causa sem anunciar sucesso`, async ({ page }) => {
    const { financialWrites } = await prepare(page, { finance: true, seedFinance: true, role: "editor", writeMode });
    await page.goto(dashboard);
    await page.getByRole("button", { name: "Registrar saldo", exact: true }).click();
    const form = page.getByRole("form", { name: "Registro financeiro" });
    await form.getByLabel("Data de referência").fill(day);
    await expect(form.getByLabel("Saldo disponível (BRL)")).toHaveValue(/0,00/);
    await form.getByRole("button", { name: "Revisar registro" }).click();
    await form.getByRole("button", { name: "Confirmar e salvar" }).click();
    await expect(form.getByRole("alert")).toContainText(message);
    await expect(page.getByText("Registro financeiro salvo.")).toHaveCount(0);
    expect(financialWrites).toHaveLength(1);
  });
}

test("múltiplas contas exigem cobertura da mesma data e permitem corrigir conta/data sem histórico", async ({ page }) => {
  await prepare(page, { finance: true, seedFinance: true, multiAccounts: true });
  await page.goto(dashboard);
  const finance = page.getByRole("region", { name: "Financeiro da Retaguarda" });
  const metaSummary = finance.locator(".panel").filter({ has: page.getByRole("heading", { name: "Meta Ads", exact: true }) });
  const googleSummary = finance.locator(".panel").filter({ has: page.getByRole("heading", { name: "Google Ads", exact: true }) });
  await expect(metaSummary.getByText(/2 de 2 contas ativas/)).toBeVisible();
  await expect(metaSummary.getByText(/requer registros de todas as contas ativas/)).toBeVisible();
  await expect(metaSummary.getByText(/Meta Arquivada/)).toHaveCount(0);
  await expect(googleSummary.getByText(/1 de 2 contas ativas/)).toBeVisible();
  await expect(googleSummary.getByText("Saldo consolidado indisponível", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Registrar saldo", exact: true }).click();
  const form = page.getByRole("form", { name: "Registro financeiro" });
  await form.getByLabel("Conta de anúncios").selectOption("account-03");
  await form.getByLabel("Data de referência").fill(previousDay);
  await expect(form.getByLabel("Saldo disponível (BRL)")).toHaveValue(/12,00/);
  await expect(form.getByLabel("Conta de anúncios")).toHaveValue("account-03");
  await form.getByLabel("Saldo disponível (BRL)").fill("55,22");
  await form.getByRole("button", { name: "Revisar registro" }).click();
  await form.getByRole("button", { name: "Confirmar e salvar" }).click();
  await finance.getByRole('button', { name: 'Informações financeiras de Meta Ads' }).click();
  await expect(page.getByRole('dialog')).toContainText('55,22');
  await page.keyboard.press('Escape');
  await expect(page.getByRole("table", { name: "Histórico financeiro" })).toHaveCount(0);
  await expect(metaSummary.getByText(/requer registros de todas as contas ativas/)).toBeVisible();
});

test("mostra gasto automático sem saldo e distingue zero, cobertura e falha da coleta", async ({ page }) => {
  await prepare(page, { finance: true, spendMode: "failed" });
  await page.goto(dashboard);
  const finance = page.getByRole("region", { name: "Financeiro da Retaguarda" });
  await expect(finance.getByText(/^R\$\s*20,00$/)).toBeVisible();
  await expect(finance.getByText(/^R\$\s*0,00$/)).toBeVisible();
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

test.describe('detalhes financeiros por toque', () => {
  test.use({ hasTouch: true });
  for (const theme of ['dark', 'light'] as const) test(`popover mobile ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepare(page, { theme, finance: true, seedFinance: true, multiAccounts: true, spendMode: 'complete' });
    await page.goto(dashboard);
    await page.getByRole('button', { name: 'Informações financeiras de Meta Ads' }).tap();
    const details = page.getByRole('dialog', { name: 'Informações financeiras de Meta Ads' });
    await expect(details).toContainText('account-01'); await expect(details).toContainText('account-03');
    const box = (await details.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await page.screenshot({ path: info.outputPath(`finance-popover-${theme}.png`) });
    await page.locator('.overlay-backdrop').tap({ position: { x: 2, y: 2 } });
    await expect(details).toHaveCount(0);
    const refresh = page.getByRole('button', { name: 'Atualizar saldo Meta agora' });
    expect((await refresh.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});

for (const [width, height, theme] of [[1440, 1000, "dark"], [1440, 1000, "light"], [820, 1000, "dark"], [820, 1000, "light"], [390, 844, "dark"], [390, 844, "light"]] as const) {
  test(`tabela e navegação em ${width}px no tema ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await prepare(page, { theme, finance: true, seedFinance: true, spendMode: "complete" });
    await page.goto(dashboard);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(history(page)).toBeVisible();
    await expect(history(page).locator("tfoot td").last()).toHaveText("44");
    await expect(finances(page).getByText('Conta Meta', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Autonomia estimada:/)).toBeVisible();
    const financialKpis = finances(page).locator('.finance-card-kpis').first().locator('.kpi');
    const firstKpi = (await financialKpis.nth(0).boundingBox())!;
    const secondKpi = (await financialKpis.nth(1).boundingBox())!;
    if (width > 640) expect(secondKpi.y).toBeCloseTo(firstKpi.y, 0);
    else expect(secondKpi.y).toBeGreaterThan(firstKpi.y);
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
