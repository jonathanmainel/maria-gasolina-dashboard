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
  await expect(page.getByText("Escolher período")).toBeVisible();
  await page.locator('input[type="date"]').first().fill("2026-09-03");
  await page.getByRole("button", { name: "Aplicar período" }).click();
  await expect(page.getByRole("button", { name: /3 de setembro/ })).toBeVisible();

  const firstTable = page.locator(".desktop-table").first();
  await firstTable.getByRole("button", { name: /Nome/ }).click();
  await expect(firstTable.locator("tbody tr").first()).toBeVisible();

  await page.getByRole("button", { name: "Meta Ads" }).click();
  await expect(page.getByRole("heading", { name: "Meta Ads", exact: true })).toBeInViewport();

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

  const firstRow = page.locator(".mobile-row").first().getByRole("button");
  await firstRow.click();
  await expect(page.locator(".mobile-details").first()).toBeVisible();

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
