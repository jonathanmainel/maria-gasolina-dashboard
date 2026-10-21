import { test, expect, type Page } from "./fixtures";

// Somente o servidor local. Nenhuma chamada a Supabase, APIs ou sistemas externos.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort();
  });
});

const route = (front: string) => `/dashboard/maria-gasolina?demo=1&view=${front}`;
const errors = (page: Page) => { const list: string[] = []; page.on("pageerror", (error) => list.push(error.message)); return list; };

for (const [front, label] of [["company", "Empresas"], ["gym", "Academias"], ["hospital", "Hospitais"]]) {
  test(`desktop: link direto ${front}, filtros e estado vazio`, async ({ page }, testInfo) => {
    const runtime = errors(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(route(front));
    await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Place", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    const content = page.getByTestId("unavailable-front");
    await expect(content.locator(".kpi-value strong")).toHaveText(["—", "—", "—", "—", "—", "—"]);
    await expect(content.getByText("Nenhuma campanha vinculada a esta frente.")).toBeVisible();
    await page.getByRole("tab", { name: "Google Ads", exact: true }).click();
    await page.getByRole("tab", { name: "Palavras-chave", exact: true }).click();
    await page.getByRole("tab", { name: "Meta Ads", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Campanhas", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Mensal", exact: true }).click();
    await page.getByRole("button", { name: /Período/i }).click();
    await page.getByRole("button", { name: "Mês passado", exact: true }).click();
    await page.getByRole("button", { name: /Aplicar/ }).click();
    await expect(content.locator(".kpi-value strong")).toHaveText(["—", "—", "—", "—", "—", "—"]);
    await expect(content.locator(".recharts-wrapper")).toHaveCount(0);
    await expect(content).not.toContainText("R$");
    expect(runtime).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${front}-desktop.png`), fullPage: true });
  });
}

test("desktop: teclado, categorias independentes e URLs anteriores", async ({ page }) => {
  const runtime = errors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(route("company"));
  const place = page.getByRole("button", { name: "Place", exact: true });
  const expansion = page.getByRole("button", { name: "Expansão", exact: true });
  await place.focus(); await page.keyboard.press("Enter");
  await expect(place).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Space");
  await expect(place).toHaveAttribute("aria-expanded", "true");
  await expansion.focus(); await page.keyboard.press("Enter");
  await expect(expansion).toHaveAttribute("aria-expanded", "true");
  await expect(place).toHaveAttribute("aria-expanded", "true");
  for (const [front, label, heading] of [["franchise", "Franquias", "Candidatos a franqueado,"], ["condominium", "Condomínios", "Indicações de condomínios,"]]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`view=${front}`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    const spend = page.locator(".kpi").filter({ has: page.getByText("Investimento", { exact: true }) }).locator(".kpi-value strong");
    await expect(spend).toContainText("R$");
    const before = await spend.textContent();
    const metrics = page.getByTestId("front-individual").locator(".grid.grid-6").first().locator(".kpi-value strong");
    await expect(metrics).toHaveCount(6);
    const beforeMetrics = await metrics.allTextContents();
    await page.getByRole("button", { name: "Empresas", exact: true }).click();
    await expect(page.getByTestId("unavailable-front")).not.toContainText("R$");
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(spend).toHaveText(before!);
    await expect(metrics).toHaveText(beforeMetrics);
  }
  expect(runtime).toEqual([]);
});

test("mobile: navegação, links diretos, foco e ausência de overflow", async ({ page }, testInfo) => {
  const runtime = errors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route("hospital"));
  await expect(page.getByRole("heading", { name: "Hospitais", exact: true })).toBeVisible();
  const open = page.getByRole("button", { name: "Abrir navegação" });
  await expect(page.locator("#dashboard-sidebar")).toHaveAttribute("inert", "");
  await open.click();
  await expect(page.getByRole("button", { name: "Place", exact: true })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Empresas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Empresas", exact: true })).toBeVisible();
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await open.click();
  await page.getByRole("button", { name: "Expansão", exact: true }).click();
  await page.getByRole("button", { name: "Franquias", exact: true }).click();
  await expect(page).toHaveURL(/view=franchise/);
  await open.click();
  await expect(page.getByRole("button", { name: "Expansão", exact: true })).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await open.click();
  await page.getByRole("button", { name: "Academias", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Academias", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(runtime).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("academias-mobile.png"), fullPage: true });
  await open.click();
  await page.screenshot({ path: testInfo.outputPath("navigation-mobile.png") });
});

for (const [front, category, heading] of [["franchise", "Expansão", "Candidatos a franqueado,"], ["condominium", "Place", "Indicações de condomínios,"]]) {
  test(`compatibilidade: endereço direto ${front}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(route(front));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    await expect(page.getByRole("button", { name: category, exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".kpi").filter({ has: page.getByText("Investimento", { exact: true }) }).locator(".kpi-value strong")).toContainText("R$");
  });
}
