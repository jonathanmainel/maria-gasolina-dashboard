import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const evidenceDir = resolve("artifacts");

test.beforeAll(async () => {
  await mkdir(evidenceDir, { recursive: true });
});

test("desktop dashboard switches views and keeps analysis controls working", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard/maria-gasolina?demo=1");

  await expect(page.getByRole("heading", { name: "Evolução por canal" })).toBeVisible();
  await expect(page.locator(".overview-view .executive-kpis .kpi-card")).toHaveCount(4);
  await expect(page.locator(".overview-view .executive-kpis").getByText("R$ 2.217,66")).toBeVisible();
  await expect(page.locator(".side-rail")).toHaveCount(0);
  const campaignScope = page.getByLabel("Finalidade da campanha");
  await expect(campaignScope).toHaveValue("all");
  await expect(page.getByRole("switch", { name: "Comparar com período anterior" })).toHaveCount(0);
  await page.screenshot({ path: resolve(evidenceDir, "dashboard-overview-desktop-1440.png") });
  await page.getByRole("button", { name: "Resultados", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resultados", exact: true })).toHaveClass(/active/);

  await page.getByRole("button", { name: /07 de setembro a 13 de setembro/ }).click();
  await expect(page.getByRole("dialog", { name: "Escolher período" })).toBeVisible();
  const comparisonToggle = page.getByRole("checkbox", { name: "Comparar com período anterior" });
  await expect(comparisonToggle).toBeChecked();
  await comparisonToggle.uncheck({ force: true });
  await page.locator('input[type="date"]').first().fill("2026-09-03");
  await page.getByRole("button", { name: "Aplicar período" }).click();
  await expect(page.getByRole("button", { name: /03 de setembro/ })).toBeVisible();

  await campaignScope.selectOption("franchise");
  await expect(page).toHaveURL(/campaign=franchise/);
  await expect(page.getByText(/Filtro Franquia aplicado/)).toBeVisible();
  await expect(page.locator(".overview-view .executive-kpis").getByText("R$ 916,79")).toBeVisible();

  await page.getByRole("button", { name: "Google Ads", exact: true }).first().click();
  await expect(page).toHaveURL(/view=google/);
  await expect(page.getByRole("heading", { name: "Campanhas", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Grupos de anúncios", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Palavras-chave", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Performance Max", exact: true })).toBeVisible();
  const campaignTable = page.locator(".data-section").filter({ has: page.getByRole("heading", { name: "Campanhas", exact: true }) }).locator(".table-wrap");
  await expect(campaignTable.locator("tbody tr")).toHaveCount(1);
  await expect(campaignTable.getByRole("combobox")).toHaveValue("cost_per_result");
  await campaignTable.getByRole("combobox").selectOption("results");
  await expect(campaignTable.getByRole("combobox")).toHaveValue("results");
  await campaignTable.getByRole("button", { name: "Maior primeiro" }).click();
  await expect(campaignTable.getByRole("button", { name: "Menor primeiro" })).toBeVisible();

  await page.getByRole("button", { name: "Meta Ads", exact: true }).first().click();
  await expect(page).toHaveURL(/view=meta/);
  await expect(page.getByRole("heading", { name: "Conjuntos de anúncios", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Anúncios", exact: true })).toBeVisible();
  const metaCampaignTable = page.locator(".data-section").filter({ has: page.getByRole("heading", { name: "Campanhas", exact: true }) }).locator(".table-wrap");
  await expect(metaCampaignTable.locator("tbody tr")).toHaveCount(2);

  await page.getByRole("button", { name: "Google Analytics", exact: true }).first().click();
  await expect(page).toHaveURL(/view=analytics/);
  const analyticsKpis = page.locator(".analytics-view .executive-kpis");
  await expect(analyticsKpis.locator(".kpi-card")).toHaveCount(6);
  for (const label of ["Sessões", "Taxa de engajamento", "Usuários ativos", "Visualizações", "Conversões (form_submit)", "Taxa de conversão"]) {
    await expect(analyticsKpis.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Receita", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Evolução do site" })).toBeVisible();
  await expect(page.getByText(/O GA4 permanece integral/)).toBeVisible();

  const acquisitionTable = page.getByTestId("ga4-acquisition-table");
  await expect(acquisitionTable.locator("tbody tr")).toHaveCount(10);
  await page.getByRole("button", { name: /Ver mais 2 origens/ }).click();
  await expect(acquisitionTable.locator("tbody tr")).toHaveCount(12);
  const eventsTable = page.getByTestId("ga4-events-table");
  await page.getByRole("button", { name: /Ver mais 2 eventos/ }).click();
  await expect(eventsTable.locator("tbody tr")).toHaveCount(12);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("invalid view opens overview and mobile uses one column without a sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/maria-gasolina?demo=1&view=invalid");
  await expect(page.getByRole("heading", { name: "Evolução por canal" })).toBeVisible();
  await expect(page.locator(".overview-view .executive-kpis .kpi-card")).toHaveCount(4);
  const cards = page.locator(".overview-view .executive-kpis .kpi-card");
  const firstBox = await cards.nth(0).boundingBox();
  const secondBox = await cards.nth(1).boundingBox();
  expect(Math.abs((firstBox?.x ?? 0) - (secondBox?.x ?? 1))).toBeLessThan(2);
  await expect(page.locator(".side-rail")).toHaveCount(0);
  const campaignScope = page.getByLabel("Finalidade da campanha");
  await campaignScope.selectOption("condominium");
  await expect(page).toHaveURL(/campaign=condominium/);
  await expect(page.getByText(/Filtro Condomínios aplicado/)).toBeVisible();

  await page.getByRole("button", { name: "Google Ads", exact: true }).first().click();
  await expect(page).toHaveURL(/view=google/);
  const campaignTable = page.locator(".data-section").filter({ has: page.getByRole("heading", { name: "Campanhas", exact: true }) }).locator(".table-wrap");
  await expect(campaignTable.locator(".mobile-row")).toHaveCount(1);
  await campaignTable.locator(".mobile-row").first().getByRole("button").click();
  await expect(campaignTable.locator(".mobile-details").first()).toBeVisible();

  await page.getByRole("button", { name: "Google Analytics", exact: true }).first().click();
  const acquisitionTable = page.getByTestId("ga4-acquisition-table");
  await acquisitionTable.locator(".mobile-row").first().getByRole("button").click();
  await expect(acquisitionTable.locator(".mobile-details").first()).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await campaignScope.selectOption("all");
  await page.getByRole("button", { name: "Visão Geral", exact: true }).click();
  await expect(page).toHaveURL(/view=overview/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".executive-header")).toBeInViewport();
  await page.screenshot({ path: resolve(evidenceDir, "dashboard-overview-mobile-390.png") });
});

test("login and pending routes render without exposing dashboard data", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Bem-vindo" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continuar com Google/ })).toBeDisabled();
  await page.goto("/acesso-pendente");
  await expect(page.getByRole("heading", { name: "Acesso pendente" })).toBeVisible();
  await expect(page.getByText(/ainda precisa ser vinculado/)).toBeVisible();
});
