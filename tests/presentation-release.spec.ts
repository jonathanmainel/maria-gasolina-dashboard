import { test, expect, type Page } from "../e2e/fixtures";
const sizes = [[1366,768],[1440,900],[1920,1080],[2560,1440],[3840,2160],[3440,1440],[1092,614],[1536,864]];
async function layoutIssues(page: Page) {
  return page.evaluate(() => {
    const issues: string[]=[]; const root=document.querySelector('.responsive-present')!;
    if(root.scrollHeight>root.clientHeight+2)issues.push(`vertical overflow ${root.scrollHeight}/${root.clientHeight}`);
    if(root.scrollWidth>root.clientWidth+2)issues.push('horizontal overflow');
    for(const el of root.querySelectorAll('.kpi,.creative,.panel,.present-controls')){
      const r=el.getBoundingClientRect();if(r.top < -1 || r.left < -1 || r.bottom > innerHeight+1 || r.right > innerWidth+1)issues.push(`outside viewport: ${el.className}`);
    }
    for(const el of root.querySelectorAll('.kpi-value strong')){
      const range=document.createRange();range.selectNodeContents(el);
      if(new Set([...range.getClientRects()].map(r=>Math.round(r.top))).size>1)issues.push(`wrapped KPI ${el.textContent}`);
      if(el.scrollWidth>el.clientWidth+1)issues.push(`wide KPI ${el.textContent}`);
    }
    for(const image of root.querySelectorAll('.creative img'))if(getComputedStyle(image).objectFit!=='contain')issues.push('cropped creative');
    for(const row of root.querySelectorAll('.funnel3d-row')){
      const box=row.getBoundingClientRect();
      for(const content of row.querySelectorAll('.funnel3d-row-top,.funnel3d-row-bottom'))if(content.getBoundingClientRect().bottom>box.bottom+1)issues.push(`overlapping funnel row ${row.textContent}`);
    }
    for(const item of root.querySelectorAll('.pacing-foot')){
      const box=item.getBoundingClientRect(),panel=item.closest('.panel')!.getBoundingClientRect();
      if(box.bottom>panel.bottom || box.bottom>innerHeight)issues.push('pacing footer outside panel');
    }
    return issues;
  });
}
for (const [width,height] of sizes) test(`slides fit ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});
  await page.goto('/e2e/fixtures/presentation.html?demo=1');
  await page.getByRole('button',{name:'Pausar',exact:true}).click();
  await page.getByRole('button',{name:'Funis ilustrativos',exact:true}).click();
  const total=Number((await page.locator('.presentation-counter').textContent())!.match(/\/ (\d+)/)![1]);
  const seen: string[]=[];
  for(let i=0;i<total;i++){
    const slide=page.locator('.present-slide');const id=await slide.getAttribute('data-slide');seen.push(id!);
    await expect.poll(()=>layoutIssues(page)).toEqual([]);
    if((await slide.getAttribute('data-kind'))==='crm')await expect(slide.getByRole('status')).toContainText('Dados comerciais ilustrativos');
    await page.screenshot({path:`artifacts/release-gallery/${width}x${height}-${id}.png`,animations:'disabled'});
    await page.getByRole('button',{name:'Próximo',exact:true}).click();
    await expect(slide).not.toHaveAttribute('data-slide',id!);
  }
  expect(new Set(seen).size).toBe(total);
});
test('commercial switch and consultation reload preserve media and operational state',async({page})=>{
  await page.setViewportSize({width:1366,height:768});
  await page.goto('/dashboard/maria-gasolina?demo=1&view=crm');
  const sync=await page.locator('.sync-pill').textContent();
  await page.getByRole('button',{name:'Visualizar funis ilustrativos',exact:true}).click();
  await expect(page.locator('.crm-note').first()).toContainText('Dados comerciais ilustrativos');
  await expect(page.locator('.funnel3d-row')).toHaveCount(10);
  await expect(page.locator('.kpi').filter({hasText:'Receita no período'})).toContainText('760.500,00');
  await page.getByRole('tab',{name:'Places',exact:true}).click();
  await expect(page.getByLabel('Frente comercial')).toHaveValue('condominium');
  await expect(page.locator('.funnel3d-row')).toHaveCount(8);
  await expect(page.locator('.kpi').filter({hasText:'Receita no período'})).toContainText('108.000,00');
  await page.getByRole('button',{name:'Recarregar dados',exact:true}).click();
  await expect(page.locator('.topbar-query-status')).toContainText(/Consulta atualizada às \d{2}:\d{2}/);
  await expect(page.locator('.topbar-refresh-notice')).toHaveCount(0);await expect(page.locator('.sync-pill')).toHaveText(sync!);
  await expect(page.getByRole('button',{name:'Voltar aos dados reais',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Modo apresentação',exact:true}).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.getByRole('button',{name:'Pausar',exact:true}).click();
  await expect(page.getByRole('button',{name:'Voltar aos dados reais',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('.present')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(page).toHaveURL(/view=crm/);
});
test('modal Escape closes inspection without exiting the presentation; resize repaginates',async({page})=>{
  await page.setViewportSize({width:1366,height:768});await page.goto('/e2e/fixtures/presentation.html?demo=1');
  await page.getByRole('button',{name:'Pausar',exact:true}).click();
  await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
  await page.getByRole('button',{name:'Ampliar imagem: Fixture franchise 1',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button',{name:'Sair da apresentação',exact:true})).toBeHidden();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.present')).toBeVisible();
  await page.setViewportSize({width:1092,height:614});await expect.poll(()=>layoutIssues(page)).toEqual([]);
  await page.getByRole('button',{name:'Sair da apresentação',exact:true}).click();await expect(page.locator('body')).toHaveAttribute('data-exited','true');
});
