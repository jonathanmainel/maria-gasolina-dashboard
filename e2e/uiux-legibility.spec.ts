import {test,expect,type Page} from '@playwright/test';
import {install} from './fixtures/ui-audit.mjs';
const sizes=[[1920,1080],[1440,900],[1024,768],[768,1024],[390,844],[360,800],[1152,720],[960,600]];
const views=['executive','condominium','company','gym','hospital','franchise','comparison','organic','site','crm','settings'];
async function settledCharts(page:Page){
 if(!await page.locator('.recharts-wrapper').count())return;
 let previous='',stable=0;
 await expect.poll(async()=>{
  const frames=await page.locator('.recharts-wrapper').evaluateAll(charts=>charts.map(chart=>({
   bars:[...chart.querySelectorAll('.recharts-bar')].map(e=>(e as SVGGraphicsElement).getBBox().height),
   shapes:[...chart.querySelectorAll('path,rect')].map(e=>['d','width','height','stroke-dasharray','style'].map(a=>e.getAttribute(a))),
  })));
  const next=JSON.stringify(frames);stable=next===previous?stable+1:0;previous=next;
  return stable>=2&&frames.every(frame=>frame.bars.every(height=>height>1));
 },{timeout:15000,intervals:[150,200,300]}).toBe(true);
}
async function ready(page:Page,view:string,present=false){
 await page.goto(`/dashboard/maria-gasolina?view=${view==='comparison'?'condominium':view}${present?'&present=1':''}`);
 await expect(page.locator(present?'.present':'.view-enter')).toBeVisible();await expect(page.locator('.skeleton')).toHaveCount(0);await page.evaluate(()=>document.fonts.ready);
 if(view==='comparison')await page.getByRole('button',{name:'Comparar frentes',exact:true}).click();await settledCharts(page);await page.mouse.move(0,0);
}
async function kpisFit(page:Page){
 const issues=await page.locator('.kpi').evaluateAll(cards=>cards.flatMap(card=>{
  const r=card.getBoundingClientRect(),label=card.querySelector('.kpi-top p')?.textContent,failures=[];
  const values=[...card.querySelectorAll('.kpi-value strong,.delta,.kpi-foot > span,.kpi-spark')].filter(e=>e.getClientRects().length>0);
  for(const e of values){const b=e.getBoundingClientRect();if(b.left<r.left-1||b.right>r.right+1||b.top<r.top-1||b.bottom>r.bottom+1)failures.push(`${label}: content outside card: ${e.textContent}`);if(e.clientWidth&&e.scrollWidth>e.clientWidth+1)failures.push(`${label}: clipped text`);}
  for(let a=0;a<values.length;a++)for(let b=a+1;b<values.length;b++){
   const x=values[a].getBoundingClientRect(),y=values[b].getBoundingClientRect();if(Math.min(x.right,y.right)-Math.max(x.left,y.left)>1&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1)failures.push(`${label}: overlapping value/comparison/footer/chart`);
  }
  return failures;
 }));expect(issues).toEqual([]);
 const fronts=await page.locator('.front-card').evaluateAll(cards=>cards.flatMap(card=>{const items=[...card.querySelectorAll('.front-main,.front-spark')].filter(e=>e.getClientRects().length>0),issues=[];if(items.length===2){const a=items[0].getBoundingClientRect(),b=items[1].getBoundingClientRect();if(Math.min(a.right,b.right)>Math.max(a.left,b.left)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1)issues.push('front summary overlaps sparkline');}return issues;}));expect(fronts).toEqual([]);
 const mini=await page.locator('.channel-card .front-meta > div,.front-card .front-meta > div').evaluateAll(nodes=>nodes.flatMap(node=>{const box=node.getBoundingClientRect();return [...node.querySelectorAll('small,b')].filter(e=>{const r=e.getBoundingClientRect();return r.right>box.right+1||e.scrollWidth>e.clientWidth+1;}).map(e=>e.textContent);}));expect(mini).toEqual([]);
 const outside=await page.evaluate(()=>[...document.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return e.getClientRects().length>0&&r.right>innerWidth+1;}).map(e=>({cls:e.getAttribute('class'),text:e.textContent?.slice(0,90),right:e.getBoundingClientRect().right})).slice(0,20));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),JSON.stringify(outside)).toBeLessThanOrEqual(1);
}
function luminance(color:string){const hex=color.slice(1);const parts=color.startsWith('#')?(hex.length===3?hex.split('').map(n=>n+n):hex.match(/../g)!).map(n=>parseInt(n,16)):color.match(/[\d.]+/g)!.slice(0,3).map(Number);const linear=parts.map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
async function palette(page:Page){
 const tokens=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries(['--muted','--muted-2','--chart-tick','--gold-text','--red-text','--green-text','--sky-text','--pink-text','--surface-solid','--bg-3'].map(k=>[k,s.getPropertyValue(k).trim()]));});
 for(const name of ['--muted','--muted-2','--chart-tick','--gold-text','--red-text','--green-text','--sky-text','--pink-text'])for(const bg of ['--surface-solid','--bg-3'])expect(contrast(tokens[name],tokens[bg]),`${name}/${bg}`).toBeGreaterThanOrEqual(4.5);
 return tokens;
}
for(const theme of ['dark','light'])for(const [width,height] of sizes)test(`legibility matrix ${width}x${height} ${theme}`,async({page,context},info)=>{
 await page.setViewportSize({width,height});const state=await install(context,{theme});await page.clock.setFixedTime(new Date('2026-10-28T15:00:00Z'));const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const view of views){await ready(page,view);await kpisFit(page);await palette(page);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath(`${view}-${width}-${theme}.png`),fullPage:true,animations:'disabled'});}
 expect(errors).toEqual([]);expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
for(const theme of ['dark','light'])for(const [width,height] of sizes.slice(0,6))test(`large money, signed comparisons and chart axes ${width} ${theme}`,async({page,context},info)=>{
 await page.setViewportSize({width,height});const state=await install(context,{theme,history:true,spendScale:1000});await page.clock.setFixedTime(new Date('2026-10-28T15:00:00Z'));
 for(const view of ['executive','condominium','comparison']){await ready(page,view);await kpisFit(page);await page.screenshot({path:info.outputPath(`large-${view}-${width}-${theme}.png`),fullPage:true});}
 await ready(page,'condominium');await expect(page.locator('.delta.up').first()).toBeVisible();await expect(page.locator('.delta.down').first()).toBeVisible();const labels=await page.locator('.channel-card .chip,.channel-card .front-meta b[style]').evaluateAll(nodes=>nodes.map(e=>getComputedStyle(e).color));const p=await palette(page);for(const color of labels)expect(contrast(color,p['--surface-solid'])).toBeGreaterThanOrEqual(4.5);
 await ready(page,'site');await expect(page.locator('.recharts-cartesian-axis-tick-value').first()).toBeVisible();const colors=await page.locator('.recharts-cartesian-axis-tick-value').evaluateAll(nodes=>nodes.filter(e=>e.getClientRects().length>0).map(e=>getComputedStyle(e).fill));const tokens=await palette(page);expect(colors.length).toBeGreaterThan(0);for(const color of colors)expect(contrast(color,tokens['--surface-solid'])).toBeGreaterThanOrEqual(4.5);await page.screenshot({path:info.outputPath(`axes-site-${width}-${theme}.png`),fullPage:true});
 expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
for(const theme of ['dark','light'])for(const [width,height] of [[1440,900],[360,800]])test(`presentation compositions and auth colors ${width} ${theme}`,async({page,context},info)=>{
 await page.setViewportSize({width,height});const state=await install(context,{theme});await page.clock.setFixedTime(new Date('2026-10-28T15:00:00Z'));await ready(page,'executive',true);await page.getByRole('button',{name:'Pausar',exact:true}).click();
 const wanted=new Set(['executive','executive-goals','franchise','franchise-creatives-static-0','franchise-crm-0','condominium','organic','organic-posts']);const seen=new Set<string>();const total=Number((await page.locator('.presentation-counter').innerText()).match(/\/ (\d+)/)![1]);
 for(let i=0;i<total;i++){
  const slide=page.locator('.present-slide'),id=(await slide.getAttribute('data-slide'))!;
  if(wanted.has(id)){await kpisFit(page);await page.screenshot({path:info.outputPath(`present-${width}-${theme}-${id}.png`),animations:'disabled'});seen.add(id);}
  await page.getByRole('button',{name:'Próximo',exact:true}).click();await expect(slide).not.toHaveAttribute('data-slide',id);
 }
 expect([...seen].sort()).toEqual([...wanted].sort());await page.keyboard.press('Escape');await expect(page.locator('.present')).toHaveCount(0);
 state.mode='pending';await page.goto('/acesso-pendente');await expect(page.locator('.pending-page')).toBeVisible();await palette(page);await page.screenshot({path:info.outputPath(`pending-${width}-${theme}.png`)});
 await page.addInitScript(()=>localStorage.removeItem('sb-127-auth-token'));await page.goto('/login');await expect(page.locator('.auth-page')).toBeVisible();await palette(page);if(width>900){const brandColor=await page.locator('.auth-brand-copy > span').evaluate(e=>getComputedStyle(e).color);expect(contrast(brandColor,'#1a2730')).toBeGreaterThanOrEqual(4.5);}await page.screenshot({path:info.outputPath(`login-${width}-${theme}.png`)});expect(state.writes).toEqual([]);expect(state.blocked).toEqual([]);
});
