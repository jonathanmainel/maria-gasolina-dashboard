import { test, expect, type Page } from '@playwright/test';
import { install } from './fixtures/ui-audit.mjs';

const sizes = [[1920,1080],[1440,900],[1024,768],[768,1024],[390,844],[360,800],[1152,720],[960,600]];
async function ready(page: Page, view = 'executive', suffix = '') {
  await page.clock.setFixedTime(new Date('2026-10-28T15:00:00Z'));
  await page.goto(`/dashboard/maria-gasolina?view=${view}${suffix}`);
  await expect(page.locator('.view-enter')).toBeVisible({timeout:30000});
  await expect(page.locator('.skeleton').first()).not.toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
for (const theme of ['dark','light']) for (const [width,height] of sizes) {
  test(`header ${width}x${height} ${theme}`, async ({page,context}, info) => {
    await page.setViewportSize({width,height});
    const state = await install(context,{theme});
    await ready(page);
    const geometry = await page.locator('.topbar').evaluate(header => {
      const controls = [...header.querySelectorAll('button')].filter(e => e.getClientRects().length > 0);
      const rectangles = controls.map(e => ({name:e.getAttribute('aria-label') ?? e.textContent, ...e.getBoundingClientRect().toJSON()}));
      const overlaps: string[] = [];
      for(let i=0;i<rectangles.length;i++) for(let j=i+1;j<rectangles.length;j++) {
        const a=rectangles[i],b=rectangles[j];
        if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) overlaps.push(`${a.name}/${b.name}`);
      }
      const r=header.getBoundingClientRect();
      return {rectangles,overlaps,headerBottom:r.bottom,overflow:document.documentElement.scrollWidth-innerWidth};
    });
    expect(geometry.overlaps).toEqual([]);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    for(const r of geometry.rectangles) {
      expect(r.left,r.name ?? '').toBeGreaterThanOrEqual(0);
      expect(r.right,r.name ?? '').toBeLessThanOrEqual(width);
      expect(r.top,r.name ?? '').toBeGreaterThanOrEqual(0);
      expect(r.bottom,r.name ?? '').toBeLessThanOrEqual(geometry.headerBottom);
      expect(r.width,r.name ?? '').toBeGreaterThanOrEqual(32);
    }
    for(const name of ['Alternar tema','Exportar PDF','Compartilhar','Modo apresentação','Menu do usuário','Ver atualização das fontes']) await expect(page.getByRole('button',{name,exact:true})).toBeInViewport();
    await expect(page.getByRole('button',{name:'Atualizar agora',exact:true})).toBeInViewport();
    const contentTop=await page.locator('.content-inner').evaluate(e=>e.getBoundingClientRect().top);
    expect(contentTop).toBeGreaterThanOrEqual(geometry.headerBottom);
    await page.screenshot({path:info.outputPath(`executive-${width}x${height}-${theme}.png`),fullPage:true,animations:'disabled'});
    await page.locator('.topbar').screenshot({path:info.outputPath(`header-${width}x${height}-${theme}.png`)});
    expect(state.writes).toEqual([]); expect(state.blocked).toEqual([]);
  });
}
for(const width of [1440,1024,390,360]) test(`dialog keyboard and navigation ${width}`,async({page,context},info)=>{
  await page.setViewportSize({width,height:width===360?800:width===390?844:width===1024?768:900}); const state=await install(context);
  await ready(page);
  for(const selector of ['.period-button','[aria-label="Ver atualização das fontes"]','[aria-label="Menu do usuário"]']) {
    const trigger=page.locator(selector); await trigger.focus(); await page.keyboard.press('Enter');
    const dialog=page.getByRole('dialog'); await expect(dialog).toBeVisible();
    await expect.poll(()=>dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);
    expect(await page.locator('#root').evaluate(e=>e.inert)).toBe(true);
    const controls=dialog.locator('button:not(:disabled),a[href],input:not(:disabled):not([type=hidden]),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]').filter({visible:true});
    await controls.first().focus(); await page.keyboard.press('Shift+Tab'); await expect(controls.last()).toBeFocused();
    await page.keyboard.press('Tab'); await expect(controls.first()).toBeFocused();
    for(let i=0;i<8;i++){await page.keyboard.press('Tab');expect(await dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);}
    await page.screenshot({path:info.outputPath(`${selector.includes('period')?'period':selector.includes('fontes')?'sources':'user'}-${width}.png`),animations:'disabled'});
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    expect(await page.locator('#root').evaluate(e=>e.inert)).toBe(false);
  }
  await page.locator('.period-button').click();
  await page.getByLabel('De',{exact:true}).fill('2026-10-01'); await page.getByLabel('Até',{exact:true}).fill('2026-10-27');
  await page.getByRole('button',{name:'Aplicar período',exact:true}).click(); await expect(page.locator('.period-button')).toBeFocused();
  if(width<=980){await page.getByRole('button',{name:'Abrir navegação',exact:true}).click();await page.getByRole('button',{name:'Site',exact:true}).click();}
  else await page.getByRole('button',{name:'Site',exact:true}).click();
  await expect(page.getByTestId('ga4-acquisition-table')).toBeVisible();
  await page.getByRole('button',{name:'Modo apresentação',exact:true}).click(); await expect(page.locator('.present')).toBeVisible(); await page.keyboard.press('Escape');
  expect(state.writes).toEqual([]); expect(state.blocked).toEqual([]);
});
test('shared mobile theme remains reachable',async({page,context})=>{
  await page.setViewportSize({width:360,height:800});await install(context);await ready(page,'executive','&share=1');
  await page.getByRole('button',{name:'Alternar tema',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.getByRole('button',{name:'Metas e ajustes',exact:true})).toHaveCount(0);
});
test('front filters, Top 3/9 and lightbox remain functional',async({page,context})=>{
  const state=await install(context);await ready(page,'condominium');
  for(const name of ['Meta Ads','Google Ads','Visão geral'])await page.getByRole('tab',{name,exact:true}).click();
  await expect(page.locator('.creative')).toHaveCount(3);
  await page.getByRole('button',{name:'Ver mais criativos',exact:true}).click();await expect(page.locator('.creative')).toHaveCount(9);
  const image=page.getByRole('button',{name:/Ampliar imagem:/}).first();await image.click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');await expect(image).toBeFocused();
  await page.getByRole('button',{name:'Mostrar menos',exact:true}).click();await expect(page.locator('.creative')).toHaveCount(3);
  await page.getByRole('button',{name:'Comparar frentes',exact:true}).click();await page.getByLabel('Frente B',{exact:true}).selectOption('hospital');
  await expect(page.getByRole('group',{name:'Investimento · Frente B · Hospitais',exact:true}).locator('.kpi-value strong')).toHaveText('—');
  expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
