import { test, expect } from "./fixtures";
test('Vendas: hierarquia, cinco funis independentes e exemplos apenas nas duas frentes',async({page},info)=>{
 await page.goto('/dashboard/maria-gasolina?demo=1&view=crm');await expect(page.getByRole('heading',{level:1})).toContainText('Pipeline de hoje');
 await expect(page.getByRole('tab',{name:'Expansão',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('combobox')).toHaveCount(0);await expect(page.locator('.funnel3d-row')).toHaveCount(10);
 const revenue=page.locator('.kpi').filter({has:page.getByText('Receita no período',{exact:true})}).locator('.kpi-value strong');await expect(revenue).toHaveText(/760\.500,00/);
 await page.getByRole('tab',{name:'Places',exact:true}).click();await expect(page.getByRole('combobox').locator('option')).toHaveCount(4);await expect(revenue).toHaveText(/108\.000,00/);
 for(const front of ['company','gym','hospital']){await page.getByLabel('Frente comercial').selectOption(front);await expect(page.locator('.funnel3d-row')).toHaveCount(8);await expect(revenue).toHaveText('—');await expect(page.locator('.manual-readout dd')).toHaveText(Array(await page.locator('.manual-readout dd').count()).fill('—'));}
 await page.screenshot({path:info.outputPath('sales-places-empty.png'),fullPage:true});
});
test('Vendas: edição demonstrativa persiste localmente sem misturar frente, snapshot ou período',async({page})=>{
 await page.goto('/dashboard/maria-gasolina?demo=1&view=crm');await page.getByRole('tab',{name:'Places',exact:true}).click();await page.getByLabel('Frente comercial').selectOption('company');
 const resultPanel=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Resultado do período · Empresas',exact:true})});await resultPanel.getByRole('button',{name:'Editar dados',exact:true}).click();
 await expect(page.getByLabel('Contratos fechados no período')).toHaveValue('');await expect(page.getByLabel('Receita do período')).toHaveValue('');
 await page.getByLabel('Contratos fechados no período').fill('3');await page.getByLabel('Receita do período').fill('45000');await page.getByRole('button',{name:'Salvar resultado',exact:true}).click();await expect(page.getByText('Valores salvos. As telas já refletem os novos números.')).toBeVisible();
 const contracts=page.locator('.kpi').filter({has:page.getByText('Contratos no período',{exact:true})}).locator('.kpi-value strong');await expect(contracts).toHaveText('3');await expect(page.locator('.funnel3d-row-bottom b')).toHaveText(Array(8).fill('—'));
 await page.getByLabel('Frente comercial').selectOption('hospital');await expect(contracts).toHaveText('—');await page.getByLabel('Frente comercial').selectOption('company');await expect(contracts).toHaveText('3');
 await page.reload();await page.getByRole('tab',{name:'Places',exact:true}).click();await page.getByLabel('Frente comercial').selectOption('company');await expect(contracts).toHaveText('3');
 await page.getByRole('button',{name:/Período/i}).click();await page.getByRole('button',{name:'Mês passado',exact:true}).click();await page.getByRole('button',{name:/Aplicar/}).click();await expect(contracts).toHaveText('—');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('mg-sales-demo-v1:maria-gasolina')!));expect(saved.some((row:any)=>row.payload.front==='company'&&row.payload.kind==='result')).toBe(true);
});
test('Vendas mobile: seletor compacto e formulário sem overflow',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/dashboard/maria-gasolina?demo=1&view=crm');await page.getByRole('tab',{name:'Places',exact:true}).click();await page.getByLabel('Frente comercial').selectOption('hospital');
 await page.getByRole('button',{name:'Editar dados',exact:true}).first().click();await expect(page.locator('input[id^="manual-stage_"]')).toHaveCount(8);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:info.outputPath('sales-mobile-editor.png'),fullPage:true});
});
