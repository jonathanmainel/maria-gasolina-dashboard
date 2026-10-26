import { test, expect, type Page } from "./fixtures";
async function layoutIssues(page: Page) {
 return page.evaluate(() => {
  const issues: string[]=[];const root=document.querySelector('.present')!;
  if(root.scrollWidth>root.clientWidth+1)issues.push('overflow horizontal');
  for(const el of root.querySelectorAll('.kpi,.panel')){
   const r=el.getBoundingClientRect();if(r.left< -1||r.right>innerWidth+1||r.bottom>innerHeight+1)issues.push(`card fora: ${el.querySelector('h3,p')?.textContent}`);
  }
  for(const el of root.querySelectorAll('.kpi-value strong')){
   const range=document.createRange();range.selectNodeContents(el);
   if(new Set([...range.getClientRects()].map(r=>Math.round(r.top))).size>1||el.scrollWidth>el.clientWidth+1)issues.push(`KPI quebrou: ${el.textContent}`);
  }
  const header=root.querySelector('.present-top')!.getBoundingClientRect(),footer=root.querySelector('.present-bottom')!.getBoundingClientRect();
  if(header.bottom>footer.top)issues.push('cabeçalho/rodapé sobrepostos');
  for(const row of root.querySelectorAll('.funnel3d-row')){
   const box=row.getBoundingClientRect();for(const text of row.querySelectorAll('.funnel3d-row-top,.funnel3d-row-bottom'))if(text.getBoundingClientRect().bottom>box.bottom+1)issues.push('etapas sobrepostas');
  }
  return issues;
 });
}
for(const [width,height] of [[1920,1080],[1366,768],[1280,720],[3840,2160],[3440,1440],[1100,650],[390,844]]){
 test(`Apresentação paginada: cinco frentes, valores e limites ${width}x${height}`,async({page},info)=>{
  test.setTimeout(120000);await page.setViewportSize({width,height});await page.goto('/dashboard/maria-gasolina?demo=1&present=1');await page.getByRole('button',{name:'Pausar',exact:true}).click();
  const seen=new Set<string>();let first='';
  for(let i=0;i<60;i++){
   const id=(await page.locator('.present-slide').getAttribute('data-slide'))!;if(i&&id===first)break;if(!i)first=id;seen.add(id);
   await expect.poll(()=>layoutIssues(page)).toEqual([]);
   if(id.endsWith('crm-0')) { await expect(page.locator('.presentation-source')).toContainText('Dados comerciais ilustrativos'); await page.screenshot({path:info.outputPath(`${width}-${id}.png`),animations:'disabled'}); }
   await page.getByRole('button',{name:'Próximo',exact:true}).click();await expect(page.locator('.present-slide')).not.toHaveAttribute('data-slide',id);
  }
  for(const front of ['franchise','condominium','company','gym','hospital'])expect(seen.has(`${front}-crm-0`)).toBe(true);
 });
}
test('Apresentação: seleção, exemplos, teclado, fullscreen e retorno',async({page})=>{
 await page.setViewportSize({width:1366,height:768});await page.goto('/dashboard/maria-gasolina?demo=1&view=crm');await page.getByRole('tab',{name:'Places',exact:true}).click();await page.getByLabel('Frente comercial').selectOption('hospital');await page.getByRole('button',{name:'Modo apresentação',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);await page.getByRole('button',{name:'Pausar',exact:true}).click();await expect(page.locator('.present-slide')).toHaveAttribute('data-slide','hospital-crm-0');
 await page.getByLabel('Frente comercial').selectOption('company');await expect(page.locator('.present-slide')).toHaveAttribute('data-slide','company-crm-0');
 await page.getByRole('button',{name:'Funis ilustrativos',exact:true}).click();await expect(page.locator('.presentation-source')).toContainText('Dados comerciais ilustrativos');await expect(page.locator('.kpi-value strong')).toHaveText(['—','—','—']);
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>layoutIssues(page)).toEqual([]);
 await page.getByRole('button',{name:'Voltar aos dados reais',exact:true}).click();await page.keyboard.press('Escape');await expect(page.locator('.present')).toHaveCount(0);await expect(page.getByLabel('Frente comercial')).toHaveValue('company');
});
