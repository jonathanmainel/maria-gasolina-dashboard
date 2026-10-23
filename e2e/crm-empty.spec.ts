import { test, expect, type Page } from "./fixtures";
const pending = "Aguardando integração com CRM Elo.";
const kpi = (page: Page, label: string) => page.locator(".kpi").filter({ has: page.getByText(label, { exact: true }) }).locator(".kpi-value strong");

async function emptyCommercial(page: Page) {
  await page.goto("/login");
  // Contexto descartavel do teste: nenhuma escrita em Supabase e nenhuma limpeza global.
  await page.evaluate(() => localStorage.setItem("mg-dashboard-demo-v1:maria-gasolina", JSON.stringify({
    funnel: { franchise: null, condominium: null }, results: { franchise: null, condominium: null },
  })));
}

test("CRM sem registros: estados vazios na Executiva, CRM e Apresentacao, sem afetar midia", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await emptyCommercial(page);
  await page.goto("/dashboard/maria-gasolina?demo=1");
  for (const label of ["Contratos no período", "Receita no período", "Oportunidades abertas", "Ticket médio · franquias"]) await expect(kpi(page, label)).toHaveText("—");
  await expect(kpi(page, "Investimento em mídia")).toContainText("R$");
  await expect(kpi(page, "Leads gerados (todas as frentes)")).not.toHaveText("—");
  await expect(page.getByRole("heading", { name: "Evolução diária por frente", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "CRM e vendas", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pipeline de hoje e resultado do período");
  await expect(page.locator(".grid-6 .kpi-value strong")).toHaveText(Array(6).fill("—"));
  await expect(page.locator(".funnel3d-row-bottom b")).toHaveText(Array(10).fill("—"));
  await expect(page.locator(".funnel3d-shape")).toHaveCount(0);
  await expect(page.getByText(pending, { exact: true }).first()).toBeVisible();
  const manualReadouts = page.locator(".manual-readout dd");
  expect(await manualReadouts.count()).toBeGreaterThan(0);
  await expect(manualReadouts).toHaveText(Array(await manualReadouts.count()).fill("—"));
  await page.screenshot({ path: info.outputPath("crm-empty-desktop.png") });
  await page.getByRole("tab", { name: "Condomínios", exact: true }).click();
  await expect(page.locator(".funnel3d-row-bottom b")).toHaveText(Array(8).fill("—"));
  await page.getByRole("button", { name: "Modo apresentação", exact: true }).click();
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  for (const front of ['franchise','condominium']) {
    for (let i = 0; i < 30 && await page.locator('.present-slide').getAttribute('data-slide') !== `${front}-crm-0`; i++) await page.getByRole("button", { name: "Próximo", exact: true }).click();
    await expect(page.locator('.present-slide')).toHaveAttribute('data-slide', `${front}-crm-0`);
    for (const label of ["Contratos no período", "Receita no período", "Oportunidades abertas"]) await expect(kpi(page, label)).toHaveText("—");
    const count = await page.locator('.funnel3d-row-bottom b').count(); expect(count).toBeGreaterThan(0);
    await expect(page.locator(".funnel3d-row-bottom b")).toHaveText(Array(count).fill("—"));
    await expect(page.locator(".funnel3d-shape")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Sair da apresentação", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pipeline de hoje e resultado do período");
});

test("CRM sem registros em mobile preserva etapas e ausencia de overflow", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await emptyCommercial(page);
  await page.goto("/dashboard/maria-gasolina?demo=1&view=crm");
  await expect(page.locator(".grid-6 .kpi-value strong")).toHaveText(Array(6).fill("—"));
  await expect(page.locator(".funnel3d-row-bottom b")).toHaveText(Array(10).fill("—"));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("crm-empty-mobile.png") });
});
