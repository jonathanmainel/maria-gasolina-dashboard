import {test,expect,type Page} from '@playwright/test';
import {install} from './fixtures/ui-audit.mjs';

const sizes=[[1920,1080],[1440,900],[1024,768],[768,1024],[390,844],[360,800],[1152,720],[960,600]];
async function ready(page:Page,view:string){
 await page.goto(`/dashboard/maria-gasolina?view=${view}`);
 await expect(page.locator('.view-enter')).toBeVisible();await expect(page.locator('.skeleton')).toHaveCount(0);
 await page.evaluate(()=>document.fonts.ready);await page.mouse.move(0,0);
}
async function fits(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);}
async function capture(page:Page,path:string){
 await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';(document.activeElement as HTMLElement)?.blur();scrollTo({top:0,left:0,behavior:'instant'});});await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
 let previous='',stable=0;
 if(await page.locator('.recharts-wrapper').count())await expect.poll(async()=>{
  const frame=await page.locator('.recharts-wrapper').evaluateAll(charts=>charts.map(chart=>({bars:[...chart.querySelectorAll('.recharts-bar')].map(e=>(e as SVGGraphicsElement).getBBox().height),shapes:[...chart.querySelectorAll('path,rect')].map(e=>['d','width','height','stroke-dasharray','style'].map(a=>e.getAttribute(a)))})));
  const next=JSON.stringify(frame);stable=next===previous?stable+1:0;previous=next;return stable>=2&&frame.every(c=>c.bars.every(h=>h>1));
 },{timeout:15000,intervals:[150,200,300]}).toBe(true);
 await page.screenshot({path,fullPage:true,animations:'disabled'});
}
for(const theme of ['dark','light'])for(const [width,height] of sizes)test(`panel compositions ${width} ${theme}`,async({page,context},info)=>{
 await page.setViewportSize({width,height});const state=await install(context,{theme});await page.clock.setFixedTime(new Date('2026-10-28T15:00:00Z'));const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const view of ['company','gym','hospital']){
  await ready(page,view);const front=page.getByTestId('unavailable-front'),sections=front.locator('details');await expect(sections).toHaveCount(3);await expect(front.locator('details[open]')).toHaveCount(0);
  await expect(front.locator('.demo-note')).toContainText('Dados ainda não disponíveis');await expect(front.getByRole('heading',{name:/Funil comercial/})).toBeVisible();await fits(page);
  await capture(page,info.outputPath(`${view}-closed-${width}-${theme}.png`));
  for(let i=0;i<3;i++){const summary=sections.nth(i).locator('summary');await summary.focus();await page.keyboard.press(i===1?'Space':'Enter');await expect(sections.nth(i)).toHaveAttribute('open','');}
  const values=await front.locator('.kpi-grid-empty .kpi-value strong').allTextContents();expect(values).toEqual(['—','—','—','—','—','—']);
  await front.getByRole('tab',{name:'Mensal',exact:true}).click();await expect(front.getByRole('tab',{name:'Mensal',exact:true})).toHaveAttribute('aria-selected','true');
  await front.getByRole('tab',{name:'Meta Ads',exact:true}).first().click();await fits(page);await capture(page,info.outputPath(`${view}-expanded-${width}-${theme}.png`));
  const first=sections.first().locator('summary');await first.focus();await page.keyboard.press('Enter');await expect(sections.first()).not.toHaveAttribute('open');await expect(first).toBeFocused();
  await page.getByRole('button',{name:'Comparar frentes',exact:true}).click();await expect(page.getByLabel('Frente B',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Encerrar comparação',exact:true}).click();await expect(sections.nth(1)).toHaveAttribute('open','');await expect(sections.first()).not.toHaveAttribute('open');
 }
 for(const view of ['settings','crm','executive']){
  await ready(page,view);await fits(page);
  const stacks=page.locator('.panel-stack');expect(await stacks.count()).toBeGreaterThan(0);
  if(view==='settings'){
   const first=stacks.first().locator(':scope > .panel').first(),next=stacks.first().locator(':scope > .section-title');
   const gap=await next.evaluate((e)=>{const previous=e.previousElementSibling!;return e.getBoundingClientRect().top-previous.getBoundingClientRect().bottom;});expect(gap).toBeGreaterThanOrEqual(10);expect(gap).toBeLessThanOrEqual(35);
   await first.getByRole('button',{name:'Editar dados',exact:true}).click();await page.getByLabel('Verba de mídia mensal',{exact:true}).fill('1234567.89');await expect(page.getByRole('button',{name:'Salvar metas',exact:true})).toBeVisible();await fits(page);
   await capture(page,info.outputPath(`settings-editor-${width}-${theme}.png`));
   await first.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(page.getByLabel('Verba de mídia mensal',{exact:true})).toHaveCount(0);
  }
  await capture(page,info.outputPath(`${view}-${width}-${theme}.png`));
 }
 expect(errors).toEqual([]);expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
for(const role of ['viewer','editor','admin'])test(`panel permissions and populated readout ${role}`,async({page,context},info)=>{
 await page.setViewportSize({width:360,height:800});const state=await install(context,{role,goals:{media_budget:1234567.89,leads_franchise:1000,leads_condominium:900,cpl_franchise:10,cpl_condominium:12,followers_growth:1000,posts:10,stories:20,contracts_franchise:10,contracts_condominium:9}});
 await ready(page,'settings');const edit=page.getByRole('button',{name:'Editar dados',exact:true});await expect(edit).toHaveCount(role==='viewer'?0:2);await expect(page.locator('.manual-readout').first()).toContainText('1.234.567,89');await fits(page);
 const clipped=await page.locator('.manual-readout dd').evaluateAll(nodes=>nodes.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent));expect(clipped).toEqual([]);
 await capture(page,info.outputPath(`settings-${role}-populated.png`));expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
for(const theme of ['dark','light'])test(`mobile hero layout remains unchanged ${theme}`,async({page,context},info)=>{
 await page.setViewportSize({width:360,height:800});const state=await install(context,{theme,map:true});await ready(page,'executive');await expect(page.locator('.hero-stat')).toHaveCount(3);
 const boxes=await page.locator('.hero-stat').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().toJSON()));expect(boxes[1].top).toBeGreaterThanOrEqual(boxes[0].bottom);expect(boxes[2].top).toBeGreaterThanOrEqual(boxes[1].bottom);
 await fits(page);await capture(page,info.outputPath(`hero-mobile-${theme}.png`));expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
