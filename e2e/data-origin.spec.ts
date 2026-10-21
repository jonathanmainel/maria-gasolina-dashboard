import { expect, test } from "./fixtures";

test("origem: demonstracao identificada na Executiva e na aba Organico", async ({ page }, info) => {
  await page.goto("/dashboard/maria-gasolina?demo=1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("O crescimento da rede, em uma tela");
  await expect(page.getByRole("status").filter({ hasText: "Modo demonstração." })).toContainText("ilustrativos");
  await expect(page.getByText("Orgânico (DMs + perfil)", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("executive-demo.png") });
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Orgânico", exact: true }).click();
  await expect(page.getByText("Dados de demonstração.", { exact: true })).toBeVisible();
  await expect(page.getByText(/nenhum número desta seção deve ser usado em relatório/)).toBeVisible();
  await page.getByRole("tab", { name: "Facebook", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Facebook", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Dados de demonstração.", { exact: true })).toBeVisible();
});

test("origem: Apresentacao preserva navegacao e identifica demonstracao em todos os slides", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard/maria-gasolina?demo=1");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Modo apresentação", exact: true }).click();
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  for (let index = 0; index < 5; index++) {
    await expect(page.getByRole("status")).toContainText("indicadores de mídia, orgânico e CRM ilustrativos");
    if (index === 3) {
      await expect(page.getByText("Seguidores IG", { exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath("presentation-organic-demo.png") });
    }
    await page.getByRole("button", { name: "Próximo", exact: true }).click();
  }
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("O crescimento da rede, em uma tela");
});

test("origem: aviso demonstrativo legivel no mobile", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/maria-gasolina?demo=1");
  await expect(page.getByRole("status").filter({ hasText: "Modo demonstração." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("executive-demo-mobile.png") });
});
