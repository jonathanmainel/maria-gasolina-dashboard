import {test,expect} from './fixtures';
for(const [width,height] of [[1280,800],[390,844]]) {
 test(`Metas demo: permissao local, persistencia e layout ${width}x${height}`,async({page},info)=>{
  await page.setViewportSize({width,height});
  await page.goto('/dashboard/maria-gasolina?demo=1&view=settings');
  await expect(page.getByLabel('Selecionar planilha', { exact: true })).toBeDisabled();
  await expect(page.getByText('Importação de unidades indisponível até a homologação específica deste serviço.')).toBeVisible();
  await expect(page.getByText('Link para pessoas já autorizadas a acessar este dashboard')).toBeVisible();
  await expect(page.getByText(/O login com uma conta autorizada continua obrigatório/)).toBeVisible();
  await expect(page.getByText(/token assinado|sem criar conta|pode ser revogado/)).toHaveCount(0);
  const panel=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Metas do mês',exact:true})});
  await panel.getByRole('button',{name:'Editar dados',exact:true}).click();
  await page.getByLabel('Verba de mídia mensal',{exact:true}).fill('12345.67');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole('button',{name:'Salvar metas',exact:true}).click();
  await expect(panel.getByText('Valores salvos. As telas já refletem os novos números.')).toBeVisible();
  await page.reload();
  await expect(panel.getByText(/12\.345,67/)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  const stored=await page.evaluate(()=>localStorage.getItem('mg-dashboard-demo-v1:maria-gasolina'));
  expect(JSON.parse(stored!).goals.media_budget).toBe(12345.67);
  expect(await page.evaluate(()=>localStorage.getItem('mg-dashboard-settings-v2:maria-gasolina'))).toBeNull();
  await page.screenshot({path:info.outputPath('metas-demo.png'),fullPage:true});
 });
}

test('Compartilhar: share=1 continua exigindo login na operacao',async({page})=>{
 await page.goto('/dashboard/maria-gasolina?share=1');
 await expect(page).toHaveURL(/\/login$/);
 await expect(page.locator('.content-inner')).toHaveCount(0);
});
