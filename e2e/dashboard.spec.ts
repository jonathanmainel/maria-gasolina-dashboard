import { expect, test, type Locator, type Page } from "./fixtures";

const individual = (page: Page) => page.getByTestId("front-individual");
const detail = (page: Page) => individual(page).locator("section").filter({ has: page.getByRole("heading", { name: "Detalhamento", exact: true }) });
const kpi = (scope: Locator, label: string) => scope.locator(".kpi").filter({ has: scope.page().getByText(label, { exact: true }) });

async function navigate(page: Page, name: string, mobile = false) {
  if (mobile) await page.getByRole("button", { name: "Abrir navegação", exact: true }).click();
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name, exact: true }).click();
}

test("desktop: visão executiva, período, frentes, plataformas, detalhamento e Site", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard/maria-gasolina?demo=1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("O crescimento da rede, em uma tela");
  const main = page.getByRole("main");
  for (const label of ["Investimento em mídia", "Leads gerados (todas as frentes)", "Custo por lead médio", "Novos seguidores (IG + FB)"]) {
    await expect(kpi(main, label).locator(".kpi-value strong")).not.toHaveText("—");
  }
  const evolution = main.locator("section").filter({ has: page.getByRole("heading", { name: "Evolução diária por frente", exact: true }) });
  await evolution.getByRole("tab", { name: "Investimento", exact: true }).click();
  await expect(evolution.getByRole("tab", { name: "Investimento", exact: true })).toHaveAttribute("aria-selected", "true");
  await evolution.getByRole("tab", { name: "CPL", exact: true }).click();
  await expect(evolution.getByRole("tab", { name: "CPL", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.screenshot({ path: info.outputPath("executive-desktop.png") });

  // As datas vêm do período corrente, sem depender do calendário do redesign.
  await page.getByRole("button", { name: /Período/i }).click();
  const dialog = page.getByRole("dialog", { name: "Escolher período", exact: true });
  const comparison = dialog.getByRole("checkbox", { name: "Comparar com período anterior" });
  await expect(comparison).toBeChecked();
  await comparison.uncheck({ force: true });
  const start = new Date(`${await dialog.getByLabel("De", { exact: true }).inputValue()}T12:00:00`);
  start.setDate(start.getDate() + 1);
  const changedStart = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  await dialog.getByLabel("De", { exact: true }).fill(changedStart);
  const end = await dialog.getByLabel("Até", { exact: true }).inputValue();
  await dialog.getByRole("button", { name: "Aplicar período", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // A antiga finalidade de campanha agora é a navegação comercial por frente.
  await page.getByRole("button", { name: "Expansão", exact: true }).click();
  await navigate(page, "Franquias");
  await expect(page).toHaveURL(/view=franchise/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Candidatos a franqueado,");
  await expect(kpi(individual(page), "Investimento").locator(".kpi-value strong")).toContainText("R$");
  await page.getByRole("tab", { name: "Google Ads", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Google Ads", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(detail(page).getByRole("table")).toBeVisible();
  await expect(detail(page).getByRole("columnheader", { name: "Canal", exact: true })).toBeVisible();
  const campaignRows = detail(page).locator("tbody tr");
  expect(await campaignRows.count()).toBeGreaterThan(0);
  for (const row of await campaignRows.all()) await expect(row.locator("td").nth(1)).toHaveText("Google");
  const campaignSort = detail(page).getByRole("button", { name: /^Investimento/ });
  await campaignSort.click();
  await expect(campaignSort).toHaveText("Investimento ↓");
  await campaignSort.click();
  await expect(campaignSort).toHaveText("Investimento ↑");

  await detail(page).getByRole("tab", { name: "Grupos de anúncios", exact: true }).click();
  // Desktop ordena pelos cabeçalhos; a toolbar antiga não é visível aqui.
  const names = detail(page).locator("tbody tr .name-cell strong");
  await expect(names).toHaveText(["Franquia de conveniência", "Mercado autônomo"]);
  await detail(page).getByRole("button", { name: "Custo / resultado", exact: true }).click();
  await expect(names).toHaveText(["Franquia de conveniência", "Mercado autônomo"]);
  await detail(page).getByRole("button", { name: "Custo / resultado", exact: true }).click();
  await expect(names).toHaveText(["Mercado autônomo", "Franquia de conveniência"]);
  await detail(page).getByRole("button", { name: "Resultados", exact: true }).click();
  await expect(names).toHaveText(["Mercado autônomo", "Franquia de conveniência"]);
  await detail(page).getByRole("tab", { name: "Palavras-chave", exact: true }).click();
  await expect(detail(page).getByRole("tab", { name: "Palavras-chave", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Meta Ads", exact: true }).click();
  await expect(detail(page).getByRole("tab", { name: "Campanhas", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(detail(page).getByRole("tab", { name: "Palavras-chave", exact: true })).toHaveCount(0);
  await detail(page).getByRole("tab", { name: "Conjuntos de anúncios", exact: true }).click();
  await expect(detail(page).getByRole("tab", { name: "Conjuntos de anúncios", exact: true })).toHaveAttribute("aria-selected", "true");
  await detail(page).getByRole("tab", { name: "Anúncios", exact: true }).click();
  await expect(detail(page).getByRole("tab", { name: "Anúncios", exact: true })).toHaveAttribute("aria-selected", "true");

  await navigate(page, "Site");
  await expect(page).toHaveURL(/view=site/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("O comportamento dos usuários no site");
  for (const label of ["Sessões", "Novos usuários", "Sessões engajadas", "Taxa de engajamento", "Leads", "Taxa de conversão"]) {
    await expect(kpi(main, label)).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Tráfego e geração de leads", exact: true })).toBeVisible();
  await expect(page.getByText(/Atribuição própria do GA4, separada/)).toBeVisible();
  const acquisition = page.getByTestId("ga4-acquisition-table");
  await expect(acquisition.locator("tbody tr")).toHaveCount(5);
  await acquisition.getByRole("button", { name: /^Ver mais/ }).click();
  await expect(acquisition.locator("tbody tr")).toHaveCount(12);
  const events = page.getByTestId("ga4-events-table");
  await expect(events.locator("tbody tr")).toHaveCount(5);
  await events.getByRole("button", { name: /^Ver mais/ }).click();
  await expect(events.locator("tbody tr")).toHaveCount(12);
  await acquisition.getByRole("button", { name: "Ordenar por Sessões, ordem crescente", exact: true }).click();
  await expect(acquisition.getByRole("columnheader").filter({ has: page.getByRole("button", { name: "Ordenar por Sessões, ordem decrescente", exact: true }) })).toHaveAttribute("aria-sort", "ascending");
  await expect(acquisition.locator("tbody tr")).toHaveCount(5);
  await page.getByRole("button", { name: /Período/i }).click();
  await expect(dialog.getByLabel("De", { exact: true })).toHaveValue(changedStart);
  await expect(dialog.getByLabel("Até", { exact: true })).toHaveValue(end);
  await expect(comparison).not.toBeChecked();
  await dialog.getByRole("button", { name: "Fechar filtro", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("mobile: view inválida abre visão executiva, menu e detalhamento responsivo", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/maria-gasolina?demo=1&view=invalid");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("O crescimento da rede, em uma tela");
  const main = page.getByRole("main");
  const first = await kpi(main, "Investimento em mídia").boundingBox();
  const second = await kpi(main, "Leads gerados (todas as frentes)").boundingBox();
  expect(first).not.toBeNull(); expect(second).not.toBeNull();
  expect(Math.abs(first!.x - second!.x)).toBeLessThan(2);
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
  const menu = page.getByRole("button", { name: "Abrir navegação", exact: true });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await page.getByRole("button", { name: "Place", exact: true }).click();
  await page.getByRole("button", { name: "Condomínios", exact: true }).click();
  await expect(page).toHaveURL(/view=condominium/);
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("tab", { name: "Google Ads", exact: true }).click();
  await detail(page).getByRole("tab", { name: "Grupos de anúncios", exact: true }).click();
  const detailRow = detail(page).locator(".mobile-row").first();
  await detailRow.getByRole("button").click();
  await expect(detailRow.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  await expect(detailRow.locator(".mobile-details")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("condominium-mobile.png"), fullPage: true });

  await navigate(page, "Site", true);
  const acquisition = page.getByTestId("ga4-acquisition-table");
  const acquisitionRow = acquisition.locator(".mobile-row").first();
  await acquisitionRow.getByRole("button").click();
  await expect(acquisitionRow.locator(".mobile-details")).toBeVisible();
  await expect(acquisitionRow.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  const eventsRow = page.getByTestId("ga4-events-table").locator(".mobile-row").first();
  await eventsRow.getByRole("button").click();
  await expect(eventsRow.locator(".mobile-details")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await navigate(page, "Visão executiva", true);
  await expect(page).toHaveURL(/view=executive/);
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("executive-mobile.png") });
});

test("login e acesso pendente não expõem dados do dashboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Bem-vindo", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continuar com Google/ })).toBeDisabled();
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toHaveCount(0);
  await expect(page.locator(".kpi")).toHaveCount(0);
  await page.goto("/acesso-pendente");
  await expect(page.getByRole("heading", { name: "Acesso pendente", exact: true })).toBeVisible();
  await expect(page.getByText(/ainda precisa ser vinculado/)).toBeVisible();
  await expect(page.locator(".kpi")).toHaveCount(0);
});
