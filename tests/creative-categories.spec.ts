import { test, expect, type Page } from "../e2e/fixtures";
import { fixture } from "./fixtures/meta-preview-app";
const isBaseline = () => Boolean(test.info().project.metadata.baseline);
const captures = "artifacts/creative-categories/captures";
// Isolated section captures omit the unrelated fixed topbar, which otherwise
// overlays tall element screenshots. Layout assertions run with the normal UI.
const sectionCapture = { animations: "disabled" as const, style: ".topbar { visibility: hidden !important; }" };

async function imagesLoaded(page: Page) {
  await expect.poll(() => page.locator(".creative img").evaluateAll(imgs => imgs.every(img => (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
}
async function capture(page: Page, name: string) {
  const section = page.locator(".creative-section");
  if (await section.count()) await section.screenshot({ path: `${captures}/${name}.png`, ...sectionCapture });
  else {
    const title = page.locator(".section-title").filter({ hasText: "Criativos que mais geram leads" });
    await title.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${captures}/${name}.png`, fullPage: true, animations: "disabled" });
  }
}

for (const [width, height] of [[1440, 1000], [390, 844]]) {
  for (const front of ["franchise", "condominium"]) {
    test(`categorias ${front} ${width}`, async ({ page }) => {
      const state = await fixture(page);
      await page.setViewportSize({ width, height });
      await page.goto(`/dashboard/maria-gasolina?view=${front}`);
      await expect(page.locator(".creative")).toHaveCount(3, { timeout: 45_000 });
      await imagesLoaded(page);
      if (isBaseline()) {
        await page.getByRole("button", {name:"Ver mais criativos",exact:true}).click();
        await imagesLoaded(page);
        await capture(page, `${front}-${width}-before`);
        await page.locator(".creative").filter({hasText:`FIXTURE ${front} 3`}).screenshot({path:`${captures}/${front}-${width}-before-static-card.png`,...sectionCapture});
        return;
      }
      const section = page.getByRole("region", { name: "Criativos que mais geram leads" });
      await expect(section.getByRole("tab")).toHaveText(["Vídeos", "Estáticos"]);
      const kpis = await page.locator("[data-testid=front-individual] .kpi-value").allTextContents();
      await capture(page, `${front}-${width}-videos`);
      const heights=await section.locator(".creative").evaluateAll(els=>els.map(el=>(el as HTMLElement).offsetHeight));
      expect(Math.max(...heights)-Math.min(...heights)).toBeLessThanOrEqual(1);
      await section.getByRole("button", { name: "Ver mais criativos", exact: true }).click();
      await expect(section.locator(".creative")).toHaveCount(9);
      await imagesLoaded(page);
      expect(await section.locator(".creative-copy strong").allTextContents()).toEqual([0,1,2,4,5,6,7,8,9].map(i=>`FIXTURE ${front} ${i}`));
      const native = await section.locator(".creative img").evaluateAll(imgs=>imgs.map(img=>[(img as HTMLImageElement).naturalWidth,(img as HTMLImageElement).naturalHeight]));
      expect(native.filter(([w,h])=>w===1080&&h===1920).length).toBeGreaterThanOrEqual(3);
      expect(native).toContainEqual([720,1280]);
      await expect(section.locator(".creative-art-video")).toHaveCount(9);
      const signedBefore = state.signatures;
      await section.getByRole("tab", { name: "Estáticos", exact: true }).click();
      await expect(section.locator(".creative")).toHaveCount(3);
      await imagesLoaded(page);
      await expect(section.locator(".creative-copy strong")).toHaveText([3,10,11].map(i=>`FIXTURE ${front} ${i}`));
      await expect(section.locator(".format")).toHaveText(["Estático","Carrossel","Dinâmico"]);
      await capture(page, `${front}-${width}-statics`);
      await section.locator(".creative").filter({hasText:`FIXTURE ${front} 3`}).screenshot({path:`${captures}/${front}-${width}-after-static-card.png`,...sectionCapture});
      await section.getByRole("button", { name: "Ver mais criativos", exact: true }).click();
      await expect(section.locator(".creative")).toHaveCount(9);
      await imagesLoaded(page);
      expect(await section.locator(".rank").allTextContents()).toEqual(["1","2","3","4","5","6","7","8","9"]);
      const art = await section.locator(".creative-art").evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {ratio:r.width/r.height,height:r.height};}));
      for(const box of art) expect(box.ratio).toBeCloseTo(9/16,2);
      expect(Math.max(...art.map(a=>a.height))-Math.min(...art.map(a=>a.height))).toBeLessThan(1);
      expect(await section.locator(".creative img").evaluateAll(imgs=>imgs.every(img=>getComputedStyle(img).objectFit==="contain"))).toBe(true);
      for(const [index,dimensions] of [[12,"1080 × 1920"],[13,"1920 × 1080"]] as const) {
        await section.getByRole("button",{name:`Ampliar imagem: FIXTURE ${front} ${index}`,exact:true}).click();
        await expect(page.getByRole("dialog")).toContainText(dimensions);
        await page.keyboard.press("Escape");
      }
      expect(state.signatures).toBe(signedBefore);
      expect(state.signedPaths[0]).toHaveLength(36);
      expect(state.signedPaths[0].some(p=>p.endsWith("-18"))).toBe(false);
      expect(await page.locator("[data-testid=front-individual] .kpi-value").allTextContents()).toEqual(kpis);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
      const overlap = await section.locator(".creative-section-head").evaluate(el=>{const title=el.querySelector("h2")!.getBoundingClientRect(),seg=el.querySelector(".seg")!.getBoundingClientRect();return title.right>seg.left&&title.bottom>seg.top&&seg.bottom>title.top;});
      expect(overlap).toBe(false);
      expect(state.errors).toEqual([]);
    });
  }
}

for (const [width,height] of [[3840,2160],[1440,900],[390,844]]) test(`apresentação separada ${width}`, async ({page})=>{
  test.skip(isBaseline());
  await fixture(page); await page.setViewportSize({width,height});
  await page.goto("/dashboard/maria-gasolina?view=franchise");
  await expect(page.locator(".creative")).toHaveCount(3,{timeout:45000});
  await page.getByRole("button",{name:"Modo apresentação",exact:true}).click();
  await page.getByRole("button",{name:"Pausar",exact:true}).click();
  expect(await page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(true);
  const seen = new Set<string>();
  for(let i=0;i<60;i++) {
    const slide=page.locator(".present-slide"); const id=(await slide.getAttribute("data-slide"))!;
    if(seen.has(id)) break; seen.add(id);
    if(await slide.getAttribute("data-kind")==="creatives") {
      await imagesLoaded(page);
      const category=id.includes("-video-")?"video":"static";
      await expect(slide.locator(".presentation-creatives")).toHaveAttribute("data-category",category);
      const offset=Number(id.split("-").pop());
      expect((await slide.locator(".rank").allTextContents())[0]).toBe(String(offset+1));
      await expect(slide.locator(category==="video"?".creative-art-video":".creative-art-static")).toHaveCount(width<700?1:3);
      const mediaRatios=await slide.locator(".creative-zoom").evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return r.width/r.height;}));
      for(const ratio of mediaRatios) expect(ratio).toBeCloseTo(9/16,2);
      const issues=await page.locator(".responsive-present").evaluate(el=>{
        const issues=[]; if(el.scrollHeight>el.clientHeight+2||el.scrollWidth>el.clientWidth+2)issues.push("overflow");
        for(const c of el.querySelectorAll(".creative,.present-controls")){const r=c.getBoundingClientRect();if(r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1)issues.push("outside");}return issues;
      });
      expect(issues).toEqual([]);
      if(offset===0&&width===3840) {await page.screenshot({path:`${captures}/${id}-4k.png`,animations:"disabled"});}
      if(id==="franchise-creatives-video-0") {
        await slide.getByRole("button",{name:/Ampliar imagem:/}).first().click();
        const active=id; await page.keyboard.press("ArrowRight");
        await expect(slide).toHaveAttribute("data-slide",active);
        await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
      }
    }
    await page.getByRole("button",{name:"Próximo",exact:true}).click();
    await expect(slide).not.toHaveAttribute("data-slide",id);
  }
  for(const front of ["franchise","condominium"])for(const category of ["video","static"])expect(seen.has(`${front}-creatives-${category}-0`)).toBe(true);
  await page.getByRole("button",{name:"Sair da apresentação",exact:true}).click();
  await expect(page.locator(".present")).toHaveCount(0);
});

test("troca frente e período sem reaproveitar ranking ou expansão", async ({page})=>{
  test.skip(isBaseline());
  await fixture(page);
  await page.goto("/dashboard/maria-gasolina?view=franchise");
  const section=page.getByRole("region",{name:"Criativos que mais geram leads"});
  await expect(section.locator(".creative")).toHaveCount(3,{timeout:45000});
  await section.getByRole("tab",{name:"Estáticos",exact:true}).click();
  await section.getByRole("button",{name:"Ver mais criativos",exact:true}).click();
  await page.getByRole("button",{name:"Places",exact:true}).click();
  await page.getByRole("button",{name:"Condomínios",exact:true}).click();
  await expect(section.locator(".creative-copy strong")).toHaveText([0,1,2].map(i=>`FIXTURE condominium ${i}`));
  await page.getByRole("button",{name:"Franquias",exact:true}).click();
  await expect(section.locator(".creative-copy strong")).toHaveText([0,1,2].map(i=>`FIXTURE franchise ${i}`));
  await section.getByRole("button",{name:"Ver mais criativos",exact:true}).click();
  await page.route("**/rest/v1/dashboard_ad_daily*",route=>route.fulfill({status:200,headers:{"access-control-allow-origin":"*"},contentType:"application/json",body:"[]"}));
  await page.locator(".period-button").click();
  await page.getByRole("button",{name:"Mês passado",exact:true}).click();
  await page.getByRole("button",{name:"Aplicar período",exact:true}).click();
  await expect(section.locator(".creative")).toHaveCount(0);
  await expect(section).toContainText("Nenhum vídeo de Meta Ads com dados nesta frente e período.");
  await section.getByRole("tab",{name:"Estáticos",exact:true}).click();
  await expect(section).toContainText("Nenhum criativo estático de Meta Ads com dados nesta frente e período.");
});
