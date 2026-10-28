import {test,expect,type Page} from '@playwright/test';
import {install} from './fixtures/ui-audit.mjs';
const sizes=[[1920,1080],[1440,900],[1024,768],[768,1024],[390,844],[360,800]];
async function start(page:Page){await page.clock.setFixedTime(new Date('2026-10-28T15:00:00Z'));await page.goto('/dashboard/maria-gasolina?view=executive');await expect(page.locator('.shell')).toBeVisible();}
async function navigate(page:Page,name:string){
 const menu=page.getByRole('button',{name:'Abrir navegação',exact:true});if(await menu.isVisible())await menu.click();
 await page.getByRole('button',{name,exact:true}).click();
}
for(const theme of ['dark','light'])for(const [width,height] of sizes)test(`independent views ${width}x${height} ${theme}`,async({page,context},info)=>{
 await page.setViewportSize({width,height});const state=await install(context,{theme,mode:'error',errorStatus:400});await start(page);
 await expect(page.getByRole('heading',{name:'Não foi possível carregar os dados',exact:true})).toBeVisible();
 for(const [name,view] of [['Metas e ajustes','settings'],['Orgânico','organic']]){
  await navigate(page,name);await expect(page.locator('.view-enter')).toBeVisible();await expect(page.locator('.screen-state.error')).toHaveCount(0);await expect(page.locator('.skeleton')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  if(view==='settings')await expect(page.getByRole('heading',{name:'Metas do mês',exact:true})).toBeVisible();else await expect(page.getByText('Dados de demonstração.',{exact:true})).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath(`${view}-${width}-${theme}-paid-error.png`),fullPage:true,animations:'disabled'});
 }
 expect(state.calls.filter(c=>c.path.endsWith('dashboard_campaign_daily')).length).toBeGreaterThan(0);expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
for(const [width,height] of [[1440,900],[360,800]])test(`media loading does not hide independent views ${width}`,async({page,context},info)=>{
 await page.setViewportSize({width,height});const state=await install(context,{mode:'loading'});await start(page);
 await expect(page.getByRole('status',{name:'Carregando dados do dashboard',exact:true})).toBeVisible();
 for(const [name,view] of [['Metas e ajustes','settings'],['Orgânico','organic']]){
  await navigate(page,name);await expect(page.locator('.view-enter')).toBeVisible();await expect(page.locator('.skeleton')).toHaveCount(0);await page.screenshot({path:info.outputPath(`${view}-${width}-paid-loading.png`),fullPage:true});
 }
 expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
for(const [width,height] of [[1440,900],[360,800]])test(`own settings loading, error and recovery ${width}`,async({page,context},info)=>{
 await page.setViewportSize({width,height});const state=await install(context,{mode:'error',errorStatus:400,settingsMode:'loading'});await start(page);await navigate(page,'Metas e ajustes');
 await expect(page.getByRole('status',{name:'Carregando configurações',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Metas do mês',exact:true})).toHaveCount(0);
 await page.screenshot({path:info.outputPath(`settings-own-loading-${width}.png`),fullPage:true});state.settingsMode='error';
 await expect(page.getByRole('heading',{name:'Não foi possível carregar as configurações',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Metas do mês',exact:true})).toHaveCount(0);
 await page.screenshot({path:info.outputPath(`settings-own-error-${width}.png`),fullPage:true});
 await expect.poll(()=>state.calls.filter(c=>c.path.endsWith('dashboard_campaign_daily')).length).toBeGreaterThanOrEqual(4);
 const paidReads=state.calls.filter(c=>c.path.endsWith('dashboard_campaign_daily')).length;state.settingsMode='normal';await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Metas do mês',exact:true})).toBeVisible();expect(state.calls.filter(c=>c.path.endsWith('dashboard_campaign_daily')).length).toBe(paidReads);
 expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
for(const role of ['viewer','editor','admin'])test(`settings permissions preserved during paid error ${role}`,async({page,context},info)=>{
 await page.setViewportSize({width:390,height:844});const state=await install(context,{role,mode:'error',errorStatus:400});await start(page);await navigate(page,'Metas e ajustes');await expect(page.getByRole('heading',{name:'Metas do mês',exact:true})).toBeVisible();
 const edit=page.getByRole('button',{name:'Editar dados',exact:true});if(role==='viewer')await expect(edit).toHaveCount(0);else await expect(edit.first()).toBeVisible();await page.screenshot({path:info.outputPath(`settings-${role}.png`),fullPage:true});expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
test('sharing still hides Settings and organic period/filter survives paid errors',async({page,context},info)=>{
 await page.setViewportSize({width:390,height:844});const state=await install(context,{mode:'error',errorStatus:400});await start(page);await navigate(page,'Orgânico');await expect(page.locator('.view-enter')).toBeVisible();
 await page.getByRole('tab',{name:'Facebook',exact:true}).click();await page.locator('.period-button').click();await page.getByLabel('De',{exact:true}).fill('2026-10-01');await page.getByLabel('Até',{exact:true}).fill('2026-10-07');await page.getByRole('button',{name:'Aplicar período',exact:true}).click();
 await expect(page.getByRole('tab',{name:'Facebook',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByText('Dados de demonstração.',{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('organic-period.png'),fullPage:true});
 await page.goto('/dashboard/maria-gasolina?view=settings&share=1');await expect(page.locator('.shell')).toBeVisible();await expect(page.getByRole('button',{name:'Metas e ajustes',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Editar dados',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Metas do mês',exact:true})).toHaveCount(0);
 expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
