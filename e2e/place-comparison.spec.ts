import { test, expect, type Page, type Locator } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});
const path = (front: string) => `/dashboard/maria-gasolina?demo=1&view=${front}`;
const cmp = (page: Page) => page.getByTestId("place-comparison");
const value = (panel: Locator, label: string) => panel.locator(".kpi").filter({ hasText: label }).locator(".kpi-value strong");
const runtime = (page: Page) => { const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message)); return errors; };

test("Condomínios × Empresas: valores existentes, filtros, gráfico vazio e retorno", async ({ page }, info) => {
  const errors = runtime(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(path("condominium"));
  const individual = page.getByTestId("front-individual");
  await expect(value(individual, "Investimento")).toContainText("R$");
  await page.getByRole("tab", { name: "Meta Ads", exact: true }).click();
  await page.getByRole("tab", { name: "Mensal", exact: true }).click();
  const before = await value(individual, "Investimento").textContent();
  const metricLabels = [["Investimento", "Investimento"], ["Leads (indicações)", "Leads"], ["Custo por lead", "CPL"]] as const;
  const indicators = new Map<string, string>();
  for (const [individualLabel, comparisonLabel] of metricLabels) {
    indicators.set(comparisonLabel, (await value(individual, individualLabel).textContent())!);
  }
  const period = await page.locator(".period-button").textContent();
  await page.getByRole("button", { name: "Comparar frentes", exact: true }).click();
  await expect(cmp(page).getByLabel("Frente A", { exact: true })).toHaveValue("condominium");
  await expect(cmp(page).getByLabel("Frente B", { exact: true })).toHaveValue("company");
  for (const [, label] of metricLabels) {
    await expect(cmp(page).getByRole("group", { name: `${label} · Frente A · Condomínios`, exact: true }).locator(".kpi-value strong")).toHaveText(indicators.get(label)!);
  }
  await expect(cmp(page).getByRole("group", { name: "Investimento · Frente A · Condomínios", exact: true }).locator(".kpi-value strong")).toHaveText(before!);
  await expect(cmp(page).getByRole("group", { name: "Investimento · Frente B · Empresas", exact: true }).locator(".kpi-value strong")).toHaveText("—");
  await expect(cmp(page).getByText(/A comparação temporal será exibida/)).toBeVisible();
  await expect(cmp(page).locator(".recharts-wrapper, .delta")).toHaveCount(0);
  await expect(page.locator(".period-button")).toHaveText(period!);
  await page.getByRole("button", { name: /Período/i }).click();
  const originalStart = await page.getByLabel("De", { exact: true }).inputValue();
  const originalEnd = await page.getByLabel("Até", { exact: true }).inputValue();
  await page.getByRole("button", { name: "Mês passado", exact: true }).click();
  await page.getByRole("button", { name: "Aplicar período", exact: true }).click();
  await expect(cmp(page).getByRole("heading", { name: "Comparar frentes", exact: true })).toBeVisible();
  await expect(cmp(page).getByLabel("Frente A", { exact: true })).toHaveValue("condominium");
  // Restaura o período original para conferir os mesmos valores ao encerrar.
  await page.getByRole("button", { name: /Período/i }).click();
  await page.getByLabel("De", { exact: true }).fill(originalStart);
  await page.getByLabel("Até", { exact: true }).fill(originalEnd);
  await page.getByRole("button", { name: "Aplicar período", exact: true }).click();
  await page.screenshot({ path: info.outputPath("comparison-desktop.png"), fullPage: true });
  await cmp(page).getByRole("button", { name: "Encerrar comparação", exact: true }).click();
  await expect(page.getByRole("button", { name: "Comparar frentes", exact: true })).toBeFocused();
  await expect(value(individual, "Investimento")).toHaveText(before!);
  for (const [individualLabel, comparisonLabel] of metricLabels) {
    await expect(value(individual, individualLabel)).toHaveText(indicators.get(comparisonLabel)!);
  }
  await expect(page.getByRole("tab", { name: "Mensal", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Meta Ads", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(errors).toEqual([]);
});

test("Empresas × Hospitais: ambos os seletores e bloqueio de frente repetida", async ({ page }) => {
  await page.goto(path("company"));
  await page.getByRole("button", { name: "Comparar frentes", exact: true }).click();
  const a = cmp(page).getByLabel("Frente A", { exact: true }); const b = cmp(page).getByLabel("Frente B", { exact: true });
  await expect(a).toHaveValue("company"); await expect(b).toHaveValue("condominium");
  await expect(b.locator('option[value="company"]')).toBeDisabled();
  await b.selectOption("hospital");
  await expect(cmp(page).getByTestId("comparison-front-b")).toContainText("Hospitais");
  await expect(cmp(page).locator(".kpi-value strong")).toHaveText(["—", "—", "—", "—", "—", "—"]);
  await a.selectOption("gym"); await b.selectOption("company");
  await expect(cmp(page).getByTestId("comparison-front-a")).toContainText("Academias");
  await expect(cmp(page).getByTestId("comparison-front-b")).toContainText("Empresas");
  await expect(a.locator('option[value="company"]')).toBeDisabled();
  await expect(a.locator('option[value="franchise"]')).toHaveCount(0);
  await expect(cmp(page)).not.toContainText("R$");
  await expect(page).toHaveURL(/view=company/);
});

test("período e plataforma compartilhados permanecem ao encerrar", async ({ page }) => {
  await page.goto(path("company"));
  await page.getByRole("tab", { name: "Google Ads", exact: true }).click();
  await page.getByRole("button", { name: "Comparar frentes", exact: true }).click();
  await expect(cmp(page).getByRole("tab", { name: "Google Ads", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: /Período/i }).click();
  await page.getByRole("button", { name: "Mês passado", exact: true }).click();
  await page.getByRole("button", { name: "Aplicar período", exact: true }).click();
  const period = await page.locator(".period-button").textContent();
  await cmp(page).getByRole("button", { name: "Encerrar comparação", exact: true }).click();
  await expect(page.locator(".period-button")).toHaveText(period!);
  await expect(page.getByRole("tab", { name: "Google Ads", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Empresas", exact: true })).toBeVisible();
});

test("navegar encerra o modo e Franquias permanece sem comparação", async ({ page }) => {
  const errors = runtime(page);
  await page.goto(path("company"));
  await page.getByRole("button", { name: "Comparar frentes", exact: true }).click();
  await page.getByRole("button", { name: "Hospitais", exact: true }).click();
  await expect(cmp(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Hospitais", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Expansão", exact: true }).click();
  await page.getByRole("button", { name: "Franquias", exact: true }).click();
  await expect(page.getByRole("button", { name: "Comparar frentes", exact: true })).toHaveCount(0);
  const before = await value(page.getByTestId("front-individual"), "Investimento").textContent();
  await page.getByRole("button", { name: "Empresas", exact: true }).click();
  await expect(cmp(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Franquias", exact: true }).click();
  await expect(value(page.getByTestId("front-individual"), "Investimento")).toHaveText(before!);
  expect(errors).toEqual([]);
});

test("mobile: seletores, indicadores identificados e ausência de overflow", async ({ page }, info) => {
  const errors = runtime(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path("company"));
  await page.getByRole("button", { name: "Comparar frentes", exact: true }).click();
  await cmp(page).getByLabel("Frente B", { exact: true }).selectOption("hospital");
  await expect(cmp(page).getByRole("group", { name: "Leads · Frente A · Empresas", exact: true })).toBeVisible();
  await expect(cmp(page).getByRole("group", { name: "Leads · Frente B · Hospitais", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("comparison-mobile.png"), fullPage: true });
  await cmp(page).getByRole("button", { name: "Encerrar comparação", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Empresas", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
