import {test,expect,type Page,type Locator} from '@playwright/test';
import {install} from './fixtures/ui-audit.mjs';
const sizes=[[1920,1080],[1440,900],[1024,768],[768,1024],[390,844],[360,800]];
async function ready(page:Page,view:string){
 await page.goto(`/dashboard/maria-gasolina?view=${view}`);
 await expect(page.locator('.view-enter')).toBeVisible();await expect(page.locator('.skeleton')).toHaveCount(0);await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';});await page.mouse.move(0,0);
}
async function table(page:Page,wrapper:Locator,columns:number,mobile:boolean){
 const scroll=wrapper.locator('.table-scroll');await expect(scroll.locator('thead th')).toHaveCount(columns);
 if(mobile){
  await expect(scroll).toBeHidden();await expect(wrapper.locator('.table-scroll-hint')).toBeHidden();await expect(wrapper.locator('.mobile-row').first()).toBeVisible();
 }else{
  await expect(scroll).toBeVisible();const widths=await scroll.locator('td.name-cell').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().width));for(const width of widths)expect(width).toBeGreaterThanOrEqual(223);
  const overflow=await scroll.evaluate(e=>e.scrollWidth>e.clientWidth+1);
  if(overflow){
   await expect(scroll).toHaveAttribute('role','region');await expect(scroll).toHaveAttribute('tabindex','0');await expect(scroll).toHaveAttribute('aria-label',/Tabela de/);await expect(wrapper.locator('.table-scroll-hint')).toBeVisible();
   await scroll.focus();await page.keyboard.press('ArrowRight');await expect.poll(()=>scroll.evaluate(e=>e.scrollLeft)).toBeGreaterThan(0);
   let previous=-1,stable=0;await expect.poll(async()=>{const left=await scroll.evaluate(e=>e.scrollLeft);stable=left===previous?stable+1:0;previous=left;return stable>=2;},{intervals:[100,150,200]}).toBe(true);
   await scroll.evaluate(e=>{e.scrollLeft=e.scrollWidth;});const end=await scroll.locator('thead th').last().evaluate(e=>{const r=e.getBoundingClientRect(),v=e.closest('.table-scroll')!.getBoundingClientRect();return r.right<=v.right+1;});expect(end).toBe(true);
   await scroll.evaluate(e=>{e.scrollLeft=0;});
  }else{
   await expect(scroll).not.toHaveAttribute('role','region');await expect(scroll).not.toHaveAttribute('tabindex','0');await expect(wrapper.locator('.table-scroll-hint')).toHaveCount(0);
  }
 }
}
async function pageFits(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);}
async function captureTable(page:Page,element:Locator,path:string){
 await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();document.querySelectorAll('.table-scroll').forEach(e=>e.scrollTo({left:0,behavior:'instant'}));scrollTo({top:0,left:0,behavior:'instant'});});await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
 const clip=await element.boundingBox();if(!clip)throw Error('Missing table capture bounds');
 await page.screenshot({path,fullPage:true,clip,animations:'disabled'});
}
for(const theme of ['dark','light'])for(const [width,height] of sizes)test(`tables ${width} ${theme}`,async({page,context},info)=>{
 await page.setViewportSize({width,height});const state=await install(context,{theme,tableDetails:true});await page.clock.setFixedTime(new Date('2026-10-28T15:00:00Z'));const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await ready(page,'site');
 const acquisition=page.getByTestId('ga4-acquisition-table'),landing=page.getByTestId('ga4-landing-pages-table'),events=page.getByTestId('ga4-events-table');
 await table(page,acquisition,8,width<=640);await table(page,landing,6,width<=640);await table(page,events,5,width<=640);
 await acquisition.getByRole('button',{name:/Ver mais/}).click();await expect(acquisition.locator('tbody tr')).toHaveCount(6);await acquisition.getByRole('button',{name:'Mostrar menos',exact:true}).click();await expect(acquisition.locator('tbody tr')).toHaveCount(5);
 if(width>640){await acquisition.getByRole('button',{name:/Ordenar por Sessões,/}).click();await expect(acquisition.locator('th[aria-sort="ascending"]')).toHaveCount(1);await expect(acquisition.locator('tbody tr').first()).toContainText('Organic Social');const heights=await landing.locator('td.name-cell').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().height));for(const h of heights)expect(h).toBeLessThanOrEqual(100);}
 else{await landing.locator('.mobile-row > button').first().click();await expect(landing.locator('.mobile-details').first()).toContainText('Visualizações');}
 await pageFits(page);await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:info.outputPath(`site-${width}-${theme}.png`),fullPage:true,animations:'disabled'});
 await ready(page,'condominium');const detail=page.locator('.detail-panel');await table(page,detail.locator('.table-wrap'),9,width<=640);
 await detail.getByRole('tab',{name:'Grupos de anúncios',exact:true}).click();await expect(detail.locator('.table-wrap')).toBeVisible();await table(page,detail.locator('.table-wrap'),8,width<=640);
 await detail.getByRole('button',{name:/Ver mais/}).click();await expect(detail.locator('tbody tr')).toHaveCount(18);await detail.getByRole('button',{name:'Mostrar menos',exact:true}).click();await expect(detail.locator('tbody tr')).toHaveCount(5);
 if(width<=640){await detail.locator('.mobile-row > button').first().click();await expect(detail.locator('.mobile-details').first()).toContainText('Custo / resultado');const gaps=await detail.locator('.mobile-details').first().locator(':scope > div').evaluateAll(nodes=>nodes.map(e=>{const label=e.querySelector('span')!.getBoundingClientRect(),value=e.querySelector('strong')!.getBoundingClientRect();return value.top-label.bottom;}));for(const gap of gaps)expect(gap).toBeGreaterThanOrEqual(2);}
 await pageFits(page);await captureTable(page,detail,info.outputPath(`detail-${width}-${theme}.png`));expect(errors).toEqual([]);expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
for(const theme of ['dark','light'])for(const [width,height] of [[1920,1080],[768,1024],[360,800]])test(`long URLs ${width} ${theme}`,async({page,context},info)=>{
 await page.setViewportSize({width,height});const state=await install(context,{theme,longNames:true,tableDetails:true});await ready(page,'site');const landing=page.getByTestId('ga4-landing-pages-table');await table(page,landing,6,width<=640);await pageFits(page);await captureTable(page,landing,info.outputPath(`long-url-${width}-${theme}.png`));
 await ready(page,'condominium');const detail=page.locator('.detail-panel');await detail.getByRole('tab',{name:'Grupos de anúncios',exact:true}).click();await expect(detail.locator('.table-wrap')).toBeVisible();await table(page,detail.locator('.table-wrap'),8,width<=640);await pageFits(page);await captureTable(page,detail,info.outputPath(`long-group-${width}-${theme}.png`));
 expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
test('tables respond to resizing without stale hints',async({page,context})=>{
 await page.setViewportSize({width:768,height:1024});await install(context);await ready(page,'site');const wrapper=page.getByTestId('ga4-acquisition-table');await table(page,wrapper,8,false);
 await page.setViewportSize({width:360,height:800});await table(page,wrapper,8,true);await page.setViewportSize({width:1920,height:1080});await table(page,wrapper,8,false);
});
test('tables retain empty and partial source states',async({page,context})=>{
 const state=await install(context,{mode:'empty'});await ready(page,'site');await expect(page.locator('.table-scroll')).toHaveCount(0);await expect(page.getByText('Nenhuma landing page encontrada neste período.')).toBeVisible();
 state.mode='partial';state.errorStatus=400;await page.reload();await expect(page.getByText(/Não foi possível carregar as landing pages:/)).toBeVisible();await expect(page.getByTestId('ga4-acquisition-table')).toBeVisible();await expect(page.getByTestId('ga4-events-table')).toBeVisible();expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
test('tables keep columns within the print layout',async({page,context},info)=>{
 await page.setViewportSize({width:794,height:1123});const state=await install(context,{theme:'light'});await ready(page,'site');await page.emulateMedia({media:'print'});
 await expect(page.locator('.table-scroll')).toHaveCount(3);await expect(page.locator('.table-scroll-hint:visible')).toHaveCount(0);
 const widths=await page.locator('.table-scroll').evaluateAll(nodes=>nodes.map(e=>({viewport:e.clientWidth,table:e.querySelector('table')!.getBoundingClientRect().width})));for(const width of widths)expect(width.table).toBeLessThanOrEqual(width.viewport+1);
 await page.screenshot({path:info.outputPath('site-print-794-light.png'),fullPage:true,animations:'disabled'});expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
