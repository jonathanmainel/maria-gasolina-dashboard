import {test,expect,type Page,type Locator} from '@playwright/test';
import {install} from './fixtures/ui-audit.mjs';
const sizes=[[1920,1080],[1440,900],[1024,768],[768,1024],[390,844],[360,800],[1152,720],[960,600]];
async function go(page:Page,view='executive',present=false){
 await page.goto(`/dashboard/maria-gasolina?view=${view}${present?'&present=1':''}`);
 await expect(page.locator(present?'.present':'.view-enter')).toBeVisible();await expect(page.locator('.skeleton').first()).not.toBeVisible();await page.evaluate(()=>document.fonts.ready);
}
async function pacingFits(items:Locator){
 expect(await items.count()).toBeGreaterThan(0);
 const issues=await items.evaluateAll(nodes=>nodes.flatMap(node=>{
  const box=node.getBoundingClientRect(), axis=node.querySelector('.pacing-axis span')!.getBoundingClientRect(), values=node.querySelector('.pacing-values')!.getBoundingClientRect(), track=node.querySelector('.pacing-track')!.getBoundingClientRect(), mark=node.querySelector('.pacing-mark')!.getBoundingClientRect();
  const failures=[]; const label=node.querySelector('.pacing-label')!.textContent;
  if(!node.querySelector('.pacing-values')!.textContent!.includes(' de '))failures.push(`${label}: missing separator in readable value text`);
  const panel=node.closest('.panel')!.getBoundingClientRect();
  if(box.left<panel.left-1||box.right>panel.right+1||box.bottom>panel.bottom+1)failures.push(`${label}: card outside panel`);
  if(axis.top<values.bottom||axis.top<track.bottom)failures.push(`${label}: caption overlaps values/track`);
  if(axis.left<box.left-1||axis.right>box.right+1)failures.push(`${label}: caption outside card`);
  if(Math.abs((axis.left+axis.right)/2-mark.left)>axis.width/2+2)failures.push(`${label}: caption too far from marker`);
  for(const child of node.querySelectorAll('.pacing-values b,.pacing-values span,.pacing-foot,.pacing-label')){
   const r=child.getBoundingClientRect();if(r.left<box.left-1||r.right>box.right+1||r.bottom>box.bottom+1)failures.push(`${label}: text outside card: ${child.textContent}`);
   if(child.clientWidth&&child.scrollWidth>child.clientWidth+1)failures.push(`${label}: text clipped: ${child.textContent}`);
  }
  return failures;
 }));expect(issues).toEqual([]);
}
for(const theme of ['dark','light'])for(const [width,height] of sizes)test(`goals ${width}x${height} ${theme}`,async({page,context},info)=>{
 await page.setViewportSize({width,height});const state=await install(context,{theme});await page.clock.setFixedTime(new Date('2026-10-28T15:00:00Z'));
 for(const view of ['executive','condominium','franchise']){
  await go(page,view);await pacingFits(page.locator('.pacing'));await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:info.outputPath(`${view}-${width}-${theme}.png`),fullPage:true,animations:'disabled'});
 }
 await go(page,'executive',true);await page.getByRole('button',{name:'Pausar',exact:true}).click();
 const total=Number((await page.locator('.presentation-counter').innerText()).match(/\/ (\d+)/)![1]);const labels:string[]=[];
 for(let i=0;i<total;i++){
  const slide=page.locator('.present-slide'),id=await slide.getAttribute('data-slide'),kind=await slide.getAttribute('data-kind');
  if(kind==='pacing'||kind==='front'){
   await pacingFits(page.locator('.present .pacing'));
   if(kind==='pacing')labels.push(...await page.locator('.pacing-label').allTextContents());
   await page.screenshot({path:info.outputPath(`present-${width}-${theme}-${id}.png`),animations:'disabled'});
  }
  const overflow=await page.locator('.present').evaluate(root=>({x:root.scrollWidth-root.clientWidth,y:root.scrollHeight-root.clientHeight}));
  expect(overflow.x,`${id}: horizontal overflow`).toBeLessThanOrEqual(1);expect(overflow.y,`${id}: vertical overflow`).toBeLessThanOrEqual(2);
  await page.getByRole('button',{name:'Próximo',exact:true}).click();await expect(slide).not.toHaveAttribute('data-slide',id!);
 }
 expect(labels).toEqual(['Verba de mídia','Leads · Franquias','Leads · Condomínios','Posts publicados','Stories publicados']);
 await expect(page.locator('.present-slide')).toHaveAttribute('data-slide','executive');await page.keyboard.press('Escape');await expect(page.locator('.present')).toHaveCount(0);
 expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
test('active goals and front remain selected after resize',async({page,context})=>{
 await page.setViewportSize({width:360,height:800});await install(context);await page.clock.setFixedTime(new Date('2026-10-28T15:00:00Z'));await go(page,'executive',true);
 await page.getByRole('button',{name:'Pausar',exact:true}).click();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await expect(page.locator('.present-slide')).toHaveAttribute('data-slide','executive-goals-3');
 await page.setViewportSize({width:1440,height:900});await expect(page.locator('.present-slide')).toHaveAttribute('data-slide','executive-goals');await expect(page.locator('.pacing')).toHaveCount(5);
 await page.keyboard.press('ArrowRight');await expect(page.locator('.present-slide')).toHaveAttribute('data-slide','franchise');
 await page.setViewportSize({width:390,height:844});await expect(page.locator('.present-slide')).toHaveAttribute('data-slide','franchise');await pacingFits(page.locator('.pacing'));
 await page.keyboard.press('ArrowLeft');await expect(page.locator('.present-slide')).toHaveAttribute('data-kind','pacing');
});
for(const [name,date,goals,mode] of [
 ['start','2026-10-02T15:00:00Z',{media_budget:12345678.90,leads_franchise:1234567,leads_condominium:1234567},'normal'],
 ['end','2026-11-01T15:00:00Z',{media_budget:1,leads_franchise:1,leads_condominium:1},'normal'],
 ['empty','2026-10-28T15:00:00Z',{media_budget:0,leads_franchise:0,leads_condominium:0},'empty'],
] as const)test(`marker boundaries ${name}`,async({page,context},info)=>{
 await page.setViewportSize({width:360,height:800});const state=await install(context,{goals,mode});await page.clock.setFixedTime(new Date(date));await go(page);
 await pacingFits(page.locator('.pacing'));await page.screenshot({path:info.outputPath(`boundary-${name}.png`),fullPage:true});expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
