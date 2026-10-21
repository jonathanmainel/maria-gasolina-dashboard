import { test, expect, type Page } from "./fixtures";
import { demoFrontDaily } from "../src/data/demo";
import { integer, money } from "../src/lib/format";

type Mode = "Diário" | "Semanal" | "Mensal";
type Range = { start: string; end: string };
const title = "Leads e investimento ao longo do tempo";
const panel = (page: Page) => page.getByTestId("front-individual").locator("section").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
const chart = (page: Page) => page.getByTestId("front-performance-chart");
const bars = (page: Page) => chart(page).locator(".recharts-bar-rectangle");
const tooltip = (page: Page) => page.getByRole("tooltip", { name: "Leads e investimento do período", exact: true });
const tooltipValue = (page: Page, label: string) => tooltip(page).getByText(label, { exact: true }).locator("..").locator("b");
const card = (page: Page, label: string) => page.getByTestId("front-individual").locator(".grid.grid-6").first().locator(".kpi").filter({ has: page.getByText(label, { exact: true }) }).locator(".kpi-value strong");

const date = (value: string) => new Date(`${value}T12:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const add = (value: string, days: number) => { const result = date(value); result.setUTCDate(result.getUTCDate() + days); return iso(result); };
const full = (value: string) => value.split("-").reverse().join("/");
const period = (start: string, end = start) => start === end ? full(start) : `${full(start)} a ${full(end)}`;

// Oráculo independente: lê a demonstração já existente, sem chamar os novos
// agregadores e sem introduzir mocks ou respostas de API nos testes de browser.
function expected(front: string, range: Range, mode: Mode, channel = "all") {
  const rows = demoFrontDaily.filter((row) => row.front === front && row.date >= range.start && row.date <= range.end && (channel === "all" || row.channel === channel));
  const groups = new Map<string, { start: string; end: string; spend: number; leads: number }>();
  for (const row of rows) {
    let start = row.date; let end = row.date;
    if (mode === "Semanal") {
      const monday = add(row.date, -((date(row.date).getUTCDay() + 6) % 7));
      const sunday = add(monday, 6);
      start = monday < range.start ? range.start : monday;
      end = sunday > range.end ? range.end : sunday;
    } else if (mode === "Mensal") {
      const monthStart = `${row.date.slice(0, 7)}-01`;
      const last = date(monthStart); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
      start = monthStart < range.start ? range.start : monthStart;
      end = iso(last) > range.end ? range.end : iso(last);
    }
    const group = groups.get(start) ?? { start, end, spend: 0, leads: 0 };
    group.spend += row.spend; group.leads += row.leads;
    groups.set(start, group);
  }
  return [...groups.values()].sort((a, b) => a.start.localeCompare(b.start));
}

async function readRange(page: Page): Promise<Range> {
  await page.locator(".period-button").click();
  const range = { start: await page.getByLabel("De", { exact: true }).inputValue(), end: await page.getByLabel("Até", { exact: true }).inputValue() };
  await page.getByRole("button", { name: "Fechar filtro", exact: true }).click();
  return range;
}

async function verifyCards(page: Page, front: string, range: Range, channel = "all") {
  const groups = expected(front, range, "Diário", channel);
  const spend = groups.reduce((sum, group) => sum + group.spend, 0);
  const leads = groups.reduce((sum, group) => sum + group.leads, 0);
  await expect(card(page, "Investimento")).toHaveText(money(spend));
  await expect(card(page, front === "franchise" ? "Leads (candidatos)" : "Leads (indicações)")).toHaveText(integer(leads));
  await expect(card(page, "Custo por lead")).toHaveText(leads ? money(spend / leads) : "—");
  return { spend, leads };
}

async function verifyPoint(page: Page, index: number, group: ReturnType<typeof expected>[number], touch = false) {
  if (touch) await bars(page).nth(index).tap(); else await bars(page).nth(index).hover();
  await expect(tooltip(page)).toBeVisible();
  await expect(tooltip(page).locator("strong")).toHaveText(period(group.start, group.end));
  await expect(tooltipValue(page, "Leads")).toHaveText(integer(group.leads));
  await expect(tooltipValue(page, "Investimento")).toHaveText(money(group.spend));
  await expect(tooltipValue(page, "CPL")).toHaveText(group.leads ? money(group.spend / group.leads) : "—");
}

async function verifySeries(page: Page, front: string, range: Range, mode: Mode, channel = "all", touch = false) {
  await panel(page).getByRole("tab", { name: mode, exact: true }).click();
  const groups = expected(front, range, mode, channel);
  await expect(bars(page)).toHaveCount(groups.length);
  if (groups.length > 1) await expect(chart(page).locator(".recharts-line-curve")).toHaveAttribute("stroke", "#3ccd8f");
  else await expect(chart(page).locator(".recharts-line-dot")).toHaveAttribute("fill", "#3ccd8f");
  await expect(bars(page).first().locator("path")).toHaveAttribute("fill", "#e9ad3f");
  const ticks = await chart(page).locator(".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value").allTextContents();
  const numeric = (text: string) => Number(text.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", "."));
  const spendTicks = ticks.filter((text) => text.includes("R$"));
  const leadsTicks = ticks.filter((text) => !text.includes("R$"));
  expect(spendTicks.length).toBeGreaterThan(0);
  expect(leadsTicks.length).toBeGreaterThan(0);
  // Confere a escala efetivamente desenhada: a linha mede investimento,
  // enquanto o eixo das barras mede quantidade, e não o antigo CPL.
  expect(Math.max(...spendTicks.map(numeric))).toBeGreaterThanOrEqual(Math.max(...groups.map((group) => group.spend)));
  expect(Math.max(...leadsTicks.map(numeric))).toBeGreaterThanOrEqual(Math.max(...groups.map((group) => group.leads)));
  expect(Math.max(...leadsTicks.map(numeric))).toBeLessThan(Math.max(...groups.map((group) => group.leads)) * 2);
  // Todos os agrupamentos são conferidos; a soma deve fechar com os cards.
  for (let index = 0; index < groups.length; index++) await verifyPoint(page, index, groups[index], touch);
  const cards = await verifyCards(page, front, range, channel);
  expect(groups.reduce((sum, group) => sum + group.leads, 0)).toBe(cards.leads);
  expect(groups.reduce((sum, group) => sum + group.spend, 0)).toBeCloseTo(cards.spend, 8);
}

for (const front of ["condominium", "franchise"]) {
  test(`${front}: leads e investimento nas três escalas`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/dashboard/maria-gasolina?demo=1&view=${front}`);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    const range = await readRange(page);
    for (const mode of ["Diário", "Semanal", "Mensal"] as const) {
      await verifySeries(page, front, range, mode);
      if (mode === "Diário") await page.screenshot({ path: info.outputPath(`${front}-desktop.png`) });
      if (mode === "Semanal") await page.screenshot({ path: info.outputPath(`${front}-weekly-desktop.png`) });
    }
    const legend = panel(page).locator(".legend");
    await expect(legend).toHaveText("LeadsInvestimento");
    await expect(panel(page).getByText("Custo por lead", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });

  test(`${front}: plataformas e período parcial preservam os totais dos cards`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/dashboard/maria-gasolina?demo=1&view=${front}`);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    const range = await readRange(page);
    for (const [label, channel] of [["Meta Ads", "meta_ads"], ["Google Ads", "google_ads"], ["Visão geral", "all"]]) {
      await page.getByRole("tab", { name: label, exact: true }).click();
      await verifySeries(page, front, range, "Mensal", channel);
    }
    // Quarta a quinta: as duas semanas de ponta sao parciais, qualquer que seja hoje.
    const thursday = add(range.end, -((date(range.end).getUTCDay() - 4 + 7) % 7));
    const partial = { start: add(thursday, -15), end: thursday };
    await page.locator(".period-button").click();
    await page.getByLabel("De", { exact: true }).fill(partial.start);
    await page.getByLabel("Até", { exact: true }).fill(partial.end);
    await page.getByRole("button", { name: "Aplicar período", exact: true }).click();
    await verifyCards(page, front, partial);
    await verifySeries(page, front, partial, "Semanal");
    await verifySeries(page, front, partial, "Mensal");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}

test("mensal com um único agrupamento mantém o investimento visível", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard/maria-gasolina?demo=1&view=condominium");
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const original = await readRange(page);
  const monthStart = `${original.end.slice(0, 7)}-01`;
  const range = { start: monthStart > original.start ? monthStart : original.start, end: original.end };
  await page.locator(".period-button").click();
  await page.getByLabel("De", { exact: true }).fill(range.start);
  await page.getByRole("button", { name: "Aplicar período", exact: true }).click();
  await verifySeries(page, "condominium", range, "Mensal");
  await expect(chart(page).locator(".recharts-line-dot")).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("chart-single-month-desktop.png") });
});

for (const front of ["company", "gym", "hospital"]) {
  test(`${front}: título atualizado, escalas e estado vazio preservado`, async ({ page }) => {
    await page.goto(`/dashboard/maria-gasolina?demo=1&view=${front}`);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    for (const mode of ["Diário", "Semanal", "Mensal"] as const) {
      await panel(page).getByRole("tab", { name: mode, exact: true }).click();
      await expect(panel(page).getByRole("tab", { name: mode, exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(panel(page).getByText("Dados ainda não disponíveis para esta frente.")).toBeVisible();
    }
    await expect(page.getByTestId("unavailable-front").locator(".kpi-value strong")).toHaveText(["—", "—", "—", "—", "—", "—"]);
    await expect(chart(page)).toHaveCount(0);
    await expect(page.getByTestId("unavailable-front").locator(".recharts-wrapper")).toHaveCount(0);
  });
}

test.describe("gráfico em mobile com toque", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("Condomínios: escalas, tooltip por toque e ausência de overflow", async ({ page }, info) => {
    await page.goto("/dashboard/maria-gasolina?demo=1&view=condominium");
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeAttached();
    const range = await readRange(page);
    // No mobile verificamos início/fim de cada série e o fechamento dos cards.
    for (const mode of ["Diário", "Semanal", "Mensal"] as const) {
      await panel(page).getByRole("tab", { name: mode, exact: true }).click();
      const groups = expected("condominium", range, mode);
      await expect(bars(page)).toHaveCount(groups.length);
      await verifyPoint(page, 0, groups[0], true);
      await verifyPoint(page, groups.length - 1, groups.at(-1)!, true);
      if (mode === "Semanal") await page.screenshot({ path: info.outputPath("chart-weekly-mobile.png") });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
    await chart(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("chart-mobile.png") });
    await verifyCards(page, "condominium", range);
  });
});
