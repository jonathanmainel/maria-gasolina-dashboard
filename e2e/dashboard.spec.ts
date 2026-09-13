import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const evidenceDir = resolve("artifacts");

test.beforeAll(async () => {
  await mkdir(evidenceDir, { recursive: true });
});

test("desktop dashboard renders and core controls work", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard/maria-gasolina?demo=1");
  await expect(page.getByRole("heading", { name: "Resumo consolidado" })).toBeVisible();
  await expect(page.getByText("R$ 2.217,66")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Google Ads", exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(evidenceDir, "dashboard-desktop-top-1440.png") });

  await page.getByRole("button", { name: /Período analisado/ }).click();
  await expect(page.getByRole("dialog", { name: "Escolher período" })).toBeVisible();
  const comparisonToggle = page.getByRole("checkbox", { name: "Comparar com período anterior" });
  const comparisonTrack = page.locator(".comparison-toggle > span");
  await expect(comparisonToggle).toBeChecked();
  await expect(comparisonTrack).toHaveCSS("background-color", "rgb(37, 124, 88)");
  await comparisonToggle.uncheck({ force: true });
  await expect(comparisonTrack).toHaveCSS("background-color", "rgb(200, 210, 214)");
  await comparisonToggle.check({ force: true });
  await expect(comparisonTrack).toHaveCSS("background-color", "rgb(37, 124, 88)");
  await page.locator('input[type="date"]').first().fill("2026-09-03");
  await page.getByRole("button", { name: "Aplicar período" }).click();
  await expect(page.getByRole("button", { name: /3 de setembro/ })).toBeVisible();

  const firstTable = page.locator(".desktop-table").first();
  await firstTable.getByRole("button", { name: /Nome/ }).click();
  await expect(firstTable.locator("tbody tr").first()).toBeVisible();

  await page.getByRole("button", { name: "Meta Ads" }).click();
  await expect(page.getByRole("heading", { name: "Meta Ads", exact: true })).toBeInViewport();

  await page.getByRole("button", { name: "Google Analytics" }).click();
  await expect(page.getByRole("heading", { name: "Google Analytics", exact: true })).toBeInViewport();
  const analyticsSection = page.locator("#google-analytics");
  await expect(analyticsSection.locator(".kpi-card")).toHaveCount(8);
  for (const label of ["Sessões", "Sessões engajadas", "Taxa de engajamento", "Novos usuários", "Visualizações", "Visualizações por sessão", "Conversões (form_submit)", "Taxa de conversão"]) {
    await expect(analyticsSection.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(analyticsSection.getByText("Receita", { exact: true })).toHaveCount(0);
  await expect(analyticsSection.getByText("Usuários ativos", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Taxa de engajamento:/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evolução do site" })).toBeVisible();
  const eventChart = page.getByRole("heading", { name: "Eventos do site", level: 3 }).locator("xpath=ancestor::article");
  await expect(eventChart.getByText("page_view", { exact: true })).toBeVisible();
  await expect(eventChart.getByText("scroll", { exact: true })).toBeVisible();
  await expect(eventChart.getByText("form_submit", { exact: true })).toBeVisible();

  const acquisitionTable = page.getByTestId("ga4-acquisition-table");
  await expect(acquisitionTable.locator("tbody tr")).toHaveCount(10);
  await expect(acquisitionTable.locator("thead button")).toHaveCount(8);
  const acquisitionViews = acquisitionTable.getByRole("button", { name: /Ordenar por Visualizações/ });
  await acquisitionViews.click();
  await expect(acquisitionViews.locator("xpath=ancestor::th")).toHaveAttribute("aria-sort", "descending");
  const acquisitionConversions = acquisitionTable.getByRole("button", { name: /Ordenar por Conversões/ });
  await acquisitionConversions.click();
  await expect(acquisitionConversions.locator("xpath=ancestor::th")).toHaveAttribute("aria-sort", "descending");
  await acquisitionConversions.click();
  await expect(acquisitionConversions.locator("xpath=ancestor::th")).toHaveAttribute("aria-sort", "ascending");
  await expect(acquisitionTable.locator("tbody tr").first()).toContainText("Unassigned");
  await page.getByRole("button", { name: /Ver mais 2 origens/ }).click();
  await expect(acquisitionTable.locator("tbody tr")).toHaveCount(12);
  await expect(acquisitionTable.getByRole("cell", { name: "(direct) / (none)" })).toBeVisible();

  const eventsTable = page.getByTestId("ga4-events-table");
  await expect(eventsTable.locator("tbody tr")).toHaveCount(10);
  await expect(eventsTable.locator("thead button")).toHaveCount(5);
  const eventQuantity = eventsTable.getByRole("button", { name: /Ordenar por Quantidade/ });
  await eventQuantity.click();
  await expect(eventQuantity.locator("xpath=ancestor::th")).toHaveAttribute("aria-sort", "ascending");
  await expect(eventsTable.locator("tbody tr").first()).toContainText("file_download");
  await page.getByRole("button", { name: /Ver mais 2 eventos/ }).click();
  await expect(eventsTable.locator("tbody tr")).toHaveCount(12);
  await expect(eventsTable.getByRole("cell", { name: "form_submit" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: resolve(evidenceDir, "dashboard-desktop-1440.png"), fullPage: true });
});

test("mobile dashboard uses one-column cards and expandable rows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/maria-gasolina?demo=1");
  await expect(page.getByRole("heading", { name: "Resumo consolidado" })).toBeVisible();
  const cards = page.locator("#resumo .kpi-card");
  await expect(cards).toHaveCount(8);
  await page.screenshot({ path: resolve(evidenceDir, "dashboard-mobile-top-390.png") });
  const firstBox = await cards.nth(0).boundingBox();
  const secondBox = await cards.nth(1).boundingBox();
  expect(Math.abs((firstBox?.x ?? 0) - (secondBox?.x ?? 1))).toBeLessThan(2);

  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(page.locator(".side-rail.open")).toBeVisible();
  await page.getByRole("button", { name: "Google Ads" }).click();
  await expect(page.getByRole("heading", { name: "Google Ads", exact: true })).toBeInViewport();

  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("button", { name: "Google Analytics" }).click();
  await expect(page.getByRole("heading", { name: "Google Analytics", exact: true })).toBeInViewport();

  const acquisitionTable = page.getByTestId("ga4-acquisition-table");
  await acquisitionTable.locator(".mobile-row").first().getByRole("button").click();
  await expect(acquisitionTable.locator(".mobile-details").first()).toBeVisible();

  const eventsTable = page.getByTestId("ga4-events-table");
  await eventsTable.locator(".mobile-row").first().getByRole("button").click();
  await expect(eventsTable.locator(".mobile-details").first()).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: resolve(evidenceDir, "dashboard-mobile-390.png"), fullPage: true });
});

test("login and pending routes render without exposing dashboard data", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Bem-vindo" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continuar com Google/ })).toBeDisabled();
  await page.screenshot({ path: resolve(evidenceDir, "login-desktop.png"), fullPage: true });

  await page.goto("/acesso-pendente");
  await expect(page.getByRole("heading", { name: "Acesso pendente" })).toBeVisible();
  await expect(page.getByText(/ainda precisa ser vinculado/)).toBeVisible();
});

