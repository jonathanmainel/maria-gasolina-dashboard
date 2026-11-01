import { test, expect, type Page } from "../e2e/fixtures";
// Real application and complete PNG bytes; synthetic Auth/REST/Storage only.
import { fixture } from "./fixtures/meta-preview-app";
async function inspectImage(
  page: Page,
  name: string,
  width: number,
  height: number,
  cardRatio = 9 / 16,
) {
  const zoom = page.getByRole("button", {
    name: `Ampliar imagem: ${name}`,
    exact: true,
  });
  await zoom.scrollIntoViewIfNeeded();
  await expect(zoom).toBeVisible();
  await expect
    .poll(() =>
      zoom
        .locator("img")
        .evaluate((img: HTMLImageElement) => [
          img.naturalWidth,
          img.naturalHeight,
        ]),
    )
    .toEqual([width, height]);
  expect(
    await zoom
      .locator("img")
      .evaluate((img) => getComputedStyle(img).objectFit),
  ).toBe("contain");
  if (height > width) {
    expect(await zoom.evaluate(el => {
      const art=(el.closest('.present') ? el : el.closest('.creative-art')) as HTMLElement;
      return art.offsetWidth/art.offsetHeight;
    })).toBeCloseTo(cardRatio,2);
  }
  await zoom.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(`${width} × ${height} px`);
  if (Math.min(width, height) < 600) await expect(dialog).toContainText("baixa resolução");
  if (height > width) {
    expect(await dialog.locator('.lightbox-frame-vertical').evaluate((el:HTMLElement)=>el.offsetWidth/el.offsetHeight)).toBeCloseTo(9/16,2);
  }
  expect(
    await dialog
      .locator("img")
      .evaluate((img) => getComputedStyle(img).objectFit),
  ).toBe("contain");
  const visible = await dialog
    .locator("img")
    .evaluate((img: HTMLImageElement) => {
      const box = img.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        inside:
          box.left >= 0 &&
          box.top >= 0 &&
          box.right <= innerWidth + 1 &&
          box.bottom <= innerHeight + 1,
      };
    });
  expect(visible.inside).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
}
for (const [width, height] of [
  [1440, 1000],
  [390, 844],
]) {
  for (const front of ["franchise", "condominium"])
    test(`previews top 3/9 ${front} ${width}×${height}`, async ({
      page,
    }, info) => {
      const state = await fixture(page);
      await page.setViewportSize({ width, height });
      await page.goto(`/dashboard/maria-gasolina?view=${front}`, { waitUntil: "domcontentloaded" });
      // Allow local lazy-module startup; media assertions keep their normal timeout.
      await expect(page.locator(".creative")).toHaveCount(3, { timeout: 45_000 });
      await inspectImage(page, `FIXTURE ${front} 0`, 1080, 1920);
      await inspectImage(page, `FIXTURE ${front} 1`, 160, 284);
      await expect(page.locator(".creative").filter({ hasText: `FIXTURE ${front} 1` }).locator(".creative-resolution")).toHaveText("Miniatura de baixa resolução");
      await expect(
        page
          .locator(".creative")
          .filter({ hasText: `FIXTURE ${front} 1` })
          .locator(".format"),
      ).toHaveText("Dinâmico · Vídeo");
      await inspectImage(page, `FIXTURE ${front} 2`, 64, 64);
      await page
        .getByRole("button", { name: "Ver mais criativos", exact: false })
        .click();
      await expect(page.locator(".creative")).toHaveCount(9);
      await page.getByRole("tab", {name:"Estáticos",exact:true}).click();
      await inspectImage(page, `FIXTURE ${front} 3`, 1080, 1350, 9 / 16);
      await page.getByRole("tab", {name:"Vídeos",exact:true}).click();
      await page.getByRole("button", {name:"Ver mais criativos",exact:true}).click();
      const names = await page
        .locator(".creative-copy strong")
        .allTextContents();
      expect(names).toEqual(
        [0,1,2,4,5,6,7,8,9].map(i => `FIXTURE ${front} ${i}`),
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      expect(state.errors).toEqual([]);
      if (front === "franchise") expect(state.signatures).toBeGreaterThan(1);
      await page.screenshot({
        path: info.outputPath("top-nine.png"),
        fullPage: true,
      });
    });
  test(`presentation uses same thumbnails ${width}×${height}`, async ({
    page,
  }, info) => {
    const state = await fixture(page);
    await page.setViewportSize({ width, height });
    await page.goto("/dashboard/maria-gasolina?view=franchise", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".creative")).toHaveCount(3, { timeout: 45_000 });
    await page
      .getByRole("button", { name: "Modo apresentação", exact: true })
      .click();
    await page.getByRole("button", { name: "Pausar", exact: true }).click();
    for (let index = 0; index < 4; index++) {
      if (
        (await page.locator(".present-slide").getAttribute("data-kind")) ===
        "creatives"
      )
        break;
      await page.getByRole("button", { name: "Próximo", exact: true }).click();
    }
    await expect(page.locator(".present-slide")).toHaveAttribute(
      "data-kind",
      "creatives",
    );
    await inspectImage(page, "FIXTURE franchise 0", 1080, 1920);
    await expect(page.locator(".present")).toBeVisible();
    expect(state.errors).toEqual([]);
    await page.screenshot({ path: info.outputPath("presentation.png") });
  });
}
