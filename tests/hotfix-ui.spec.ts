import {test,expect} from "../e2e/fixtures";
const userId="00000000-0000-0000-0000-000000000001";
// All accounts, JWTs and numbers below are SYNTHETIC. No real Supabase requests.
async function operationalFixture(page:any){
 let reloads=0;
 const authUser={id:userId,aud:"authenticated",role:"authenticated",email:"fixture@example.invalid",user_metadata:{}};
 const encode=(v:unknown)=>btoa(JSON.stringify(v)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
 const jwt=[encode({alg:"HS256",typ:"JWT"}),encode({sub:userId,role:"authenticated",aud:"authenticated",exp:Math.floor(Date.now()/1000)+7200}),"synthetic-signature"].join(".");
 await page.addInitScript(({jwt,authUser}:any)=>{localStorage.setItem("sb-hotfix-test-auth-token",JSON.stringify({access_token:jwt,refresh_token:"synthetic-not-real",expires_at:Math.floor(Date.now()/1000)+7200,expires_in:7200,token_type:"bearer",user:authUser}));},{jwt,authUser});
 const calls:string[]=[];
 await page.route("https://hotfix-test.supabase.co/**",async(route:any)=>{
  const url=new URL(route.request().url());calls.push(url.pathname);
  const reply=(body:any)=>route.fulfill({status:200,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"GET,POST,OPTIONS"},contentType:"application/json",body:JSON.stringify(body)});
  if(route.request().method()==="OPTIONS")return route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"GET,POST,OPTIONS"}});
  if(url.pathname.includes("/auth/"))return reply(authUser);
  if(url.pathname.includes("/object/sign/")&&route.request().method()==="POST")return reply([{path:"fixture/vertical.svg",signedURL:"/object/sign/dashboard-creatives/fixture/vertical.svg?token=synthetic"}]);
  if(url.pathname.includes("/object/sign/")&&route.request().method()==="GET")return route.fulfill({status:200,contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="114" viewBox="0 0 360 640"><rect width="360" height="640" fill="#243842"/><rect x="14" y="14" width="332" height="612" fill="none" stroke="#e9ad3f" stroke-width="7"/><text x="180" y="190" text-anchor="middle" fill="white" font-size="31">EXEMPLO</text><text x="180" y="250" text-anchor="middle" fill="white" font-size="24">Vídeo vertical</text><text x="180" y="570" text-anchor="middle" fill="white" font-size="22">Texto sem cortes</text></svg>'});
  const table=url.pathname.split("/").pop();
  if(table==="dashboard_clients")return reply({id:1,slug:"maria-gasolina"});
  if(table==="dashboard_client_users")return reply({client_id:1,role:"viewer"});
  if(table==="dashboard_manual_inputs")return reply(null);
  if(table==="dashboard_sync_runs")return reply({completed_at:url.searchParams.get("source")==="eq.google_ads"?"2026-09-28T04:00:00Z":"2026-10-23T04:00:00Z"});
  if(table==="dashboard_daily_metrics")return reply({metric_date:url.searchParams.get("source")==="eq.google_ads"?"2026-09-27":"2026-10-22"});
  if(table==="dashboard_campaign_daily"){reloads++;return reply([{source:"meta_ads",campaign_id:"fixture",campaign_name:"CONDOMINIOS - FIXTURE",campaign_status:"ACTIVE",metric_date:"2026-10-22",impressions:1000,reach:900,clicks:10,link_clicks:10,conversions:5,spend:reloads>1?200:100}]);}
  if(table==="dashboard_ad_daily")return reply([{source:"meta_ads",ad_id:"fixture-video",ad_name:"EXEMPLO - vídeo vertical",campaign_name:"CONDOMINIOS - FIXTURE",impressions:1000,clicks:10,conversions:5,spend:100}]);
  if(table==="dashboard_creative_previews")return reply([{ad_id:"fixture-video",creative_type:"video",preview_kind:"video_thumbnail",preview_storage_path:"fixture/vertical.svg",preview_available:true}]);
  if(url.pathname.includes("/rpc/"))return reply({items:[],total_count:0,next_cursor:null});
  return reply([]);
 });
 return {calls,get reloads(){return reloads;}};
}
for(const [width,height] of [[1440,1000],[390,844]]){
 test(`hotfix: recarga real das consultas e datas por plataforma ${width}x${height}`,async({page},info)=>{
  const fixture=await operationalFixture(page);await page.setViewportSize({width,height});await page.goto('/dashboard/maria-gasolina?view=executive');
  await expect(page.getByRole('button',{name:'Recarregar dados',exact:true})).toBeVisible();
  await expect(page.getByText('Dados até: 27/09/2026')).toBeVisible();await expect(page.getByText('Cobertura parcial do período selecionado')).toBeVisible();
  const kpi=page.locator('.kpi').filter({has:page.getByText('Investimento em mídia',{exact:true})});await expect(kpi).toContainText('100,00');
  await page.getByRole('button',{name:'Recarregar dados',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Consultas recarregadas'})).toBeVisible();await expect(kpi).toContainText('200,00');expect(fixture.reloads).toBeGreaterThan(1);expect(fixture.calls.some(x=>x.includes('/functions/'))).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:info.outputPath('recarregar-dados.png'),fullPage:true});
 });
 test(`hotfix: criativo vertical sem cortes e modal ampliado ${width}x${height}`,async({page},info)=>{
  await operationalFixture(page);await page.setViewportSize({width,height});await page.goto('/dashboard/maria-gasolina?view=condominium');
  const zoom=page.getByRole('button',{name:'Ampliar imagem: EXEMPLO - vídeo vertical'});await expect(zoom).toBeVisible();
  await expect.poll(()=>zoom.locator('img').evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBe(64);
  expect(await zoom.locator('img').evaluate(el=>getComputedStyle(el).objectFit)).toBe('contain');
  const card=page.locator('.creative').filter({has:zoom});await expect(card).toContainText('5');await expect(card).toContainText('CPL');await expect(card).toContainText('CTR');
  await card.screenshot({path:info.outputPath('criativo-card.png')});await zoom.click();
  const dialog=page.getByRole('dialog',{name:'Imagem ampliada: EXEMPLO - vídeo vertical'});await expect(dialog).toBeVisible();await expect(dialog).toContainText('Miniatura de baixa resolução');
  const visibleHeight=await dialog.locator('img').evaluate((img:HTMLImageElement)=>{const b=img.getBoundingClientRect();return img.naturalHeight*Math.min(b.width/img.naturalWidth,b.height/img.naturalHeight);});expect(visibleHeight).toBeGreaterThan(height*.6);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:info.outputPath('criativo-modal.png')});await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(zoom).toBeFocused();
 });
}
