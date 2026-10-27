// Playwright: real UI, AuthProvider and HTTP client. Backend/platform fixtures are
// intercepted locally. This is NOT Supabase Auth or production API homologation.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin='http://127.0.0.1:5190';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce',timezoneId:'America/Sao_Paulo'});
const page=await context.newPage();
const userId='10000000-0000-4000-8000-000000000003';
const user={id:userId,aud:'authenticated',role:'authenticated',email:'local-admin@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const token=[{alg:'HS256',typ:'JWT'},{sub:userId,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iss:'http://127.0.0.1:55499/auth/v1'}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.SYNTHETIC_ONLY';
await page.addInitScript(({token,user})=>{localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'SYNTHETIC_ONLY',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));},{token,user});
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const offset=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const yesterday=offset(today,-1);
const ids=['10000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000013'];
let requests=0,campaignReads=0,completed=false,role='admin';const errors=[],external=[],metricEnds=[];
let runs=[];
function state(){return {client_id:1,role,can_request:role==='admin',server_time:new Date().toISOString(),today,requested_runs:runs,sources:['google_ads','meta_ads','ga4'].map((source,i)=>({source,enabled:true,latest_run:runs[i]??null,last_success_at:runs[i]?.status==='success'?runs[i].completed_at:'2026-10-26T04:00:00Z',available_through:completed&&source!=='ga4'?today:yesterday,missing_accounts:0,accounts:[],next_manual_at:requests?new Date(Date.now()+300000).toISOString():null}))};}
page.on('pageerror',e=>errors.push(e.stack??e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.hostname!=='127.0.0.1'){external.push(url.origin);return route.abort();}
 if(url.port==='55499'){
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-expose-headers':'content-range','content-range':'0-0/1'},body:JSON.stringify(body)});
  if(req.method()==='OPTIONS')return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST,GET,OPTIONS'}});
  if(url.pathname==='/auth/v1/user')return json(user);
  if(url.pathname.includes('/functions/v1/request-dashboard-sync')){
   assert.equal(req.headers().apikey,'sb_publishable_MANUAL_SYNC_TEST_ONLY');assert.equal(req.headers().authorization,'Bearer '+token);
   const body=req.postDataJSON();
   assert.equal(body.client_slug,'maria-gasolina');assert.ok(!body.role&&!body.start_date&&!body.service_role);
   if(body.action==='status')return json(state());
   if(role!=='admin')return json({error_code:'FORBIDDEN'},403);
   requests++;assert.deepEqual([...body.sources].sort(),['ga4','google_ads','meta_ads']);
   runs=['google_ads','meta_ads','ga4'].map((source,i)=>({id:ids[i],source,status:'running',requested_at:new Date().toISOString(),started_at:new Date().toISOString(),completed_at:null,range_start:offset(today,-7),range_end:today,period_mode:'including_today',trigger:'manual',requested_by:userId,overdue:false,database_write_status:null,error_code:null}));
   return json({ok:true,range_start:offset(today,-7),range_end:today,results:runs.map(run=>({source:run.source,state:'accepted',run_id:run.id}))},202);
  }
  if(url.pathname.includes('/functions/v1/'))throw Error('Frontend attempted to call an internal collector');
  if(url.pathname.endsWith('/dashboard_client_users'))return json([{client_id:1,role}]);
  if(url.pathname.endsWith('/dashboard_clients'))return json([{id:1,slug:'maria-gasolina'}]);
  if(url.pathname.endsWith('/dashboard_manual_inputs'))return json([]);
  if(url.pathname.endsWith('/dashboard_sync_runs'))return json([{completed_at:'2026-10-26T04:00:00Z'}]);
  if(url.pathname.endsWith('/dashboard_campaign_daily')){
   campaignReads++;metricEnds.push(url.searchParams.getAll('metric_date').find(x=>x.startsWith('lte.')));
   return json([{source:'google_ads',campaign_id:'synthetic-campaign',campaign_name:'FRANQUIA TESTE',campaign_status:'ENABLED',metric_date:completed?today:yesterday,impressions:1000,clicks:30,conversions:completed?12:7,spend:150}]);
  }
  if(url.pathname.endsWith('/rpc/get_dashboard_network_units'))return json({units:[],cities:[],summary:{total_units:0,total_cities:0,unresolved_cities:0},headquarters:{city:'Campinas',state:'SP'}});
  return json([]);
 }
 if(url.port!=='5190'){external.push(url.origin);return route.abort();}
 return route.continue();
});
await fs.mkdir('artifacts/manual-playwright',{recursive:true});
try {
 await page.goto(origin+'/dashboard/maria-gasolina');
 await page.getByRole('button',{name:'Atualizar agora',exact:true}).waitFor({timeout:30000});
 assert.ok(metricEnds.some(x=>x==='lte.'+yesterday));
 await page.screenshot({path:'artifacts/manual-playwright/desktop-before.png'});
 await page.getByRole('button',{name:'Atualizar agora',exact:true}).click();
 await page.getByRole('button',{name:'Sincronizando...',exact:true}).waitFor();
 assert.equal(requests,1);assert.equal(await page.getByRole('button',{name:'Sincronizando...',exact:true}).isDisabled(),true);
 await page.locator('.data-sync-panel').screenshot({path:'artifacts/manual-playwright/running.png'});
 const before=campaignReads;
 for(const run of runs){run.status=run.source==='ga4'?'failed':'success';run.completed_at=new Date().toISOString();run.database_write_status=run.status==='success'?'success':null;run.error_code=run.status==='failed'?'PLATFORM_SYNC_FAILED':null;}
 completed=true;
 await page.getByRole('button',{name:'Parcialmente concluído',exact:true}).waitFor({timeout:15000});
 assert.ok(campaignReads>before,'Refetch only after confirmed source completion');
 await page.locator('.data-sync-panel').screenshot({path:'artifacts/manual-playwright/partial-result.png'});
 await page.getByRole('button',{name:'Ver Hoje · parcial'}).click();
 await page.locator('.intraday-banner').waitFor();
 await page.waitForFunction(()=>document.body.textContent.includes('dados parciais'));
 assert.ok(metricEnds.some(x=>x==='lte.'+today));
 await page.locator('.kpi').filter({hasText:'Leads gerados (todas as frentes)'}).getByText('12',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Escolher período',exact:true}).count();
 // Existing PeriodPicker continues to provide Hoje as a separate preset.
 await page.locator('.period-button').click();await page.getByRole('button',{name:'Hoje',exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth,{},{timeout:5000});
 assert.equal(await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)),0,'No mobile horizontal overflow');
 await page.screenshot({path:'artifacts/manual-playwright/mobile.png'});
 await page.getByRole('button',{name:'Ver atualização das fontes'}).click();
 await page.locator('.data-sync-sources article').last().scrollIntoViewIfNeeded();
 await page.screenshot({path:'artifacts/manual-playwright/mobile-result.png'});
 assert.equal(await page.locator('.data-sync-sources article').count(),3);
 await page.getByRole('button',{name:'Fechar atualização'}).click();
 role='viewer';await page.reload();await page.getByRole('button',{name:'Ver atualização das fontes'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Atualizar agora',exact:true}).count(),0);
 await page.getByRole('button',{name:'Ver atualização das fontes'}).click();await page.getByText('Consulta disponível. Somente administradores podem iniciar coletas.').waitFor();
 await page.screenshot({path:'artifacts/manual-playwright/viewer.png'});
 assert.equal(requests,1);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const result={passed:true,desktop:'1440x1100',mobile:'390x844',requests,campaignReads,partialResult:true,todayFilter:true,viewerBlocked:true,internalCredentialsInBrowser:false,externalRequests:external,runtimeErrors:errors,scope:'Real UI/AuthProvider/HTTP client with local Auth/REST/Edge/platform fixtures; not production API E2E'};
 await fs.writeFile('artifacts/manual-playwright/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} catch(error) {console.log(JSON.stringify({url:page.url(),errors,external,overflow:await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+4&&e.getBoundingClientRect().width>innerWidth).slice(0,10).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})))})); await fs.writeFile('artifacts/manual-playwright/diagnostic.json',JSON.stringify({url:page.url(),errors,external},null,2));await page.screenshot({path:'artifacts/manual-playwright/failure.png',fullPage:true});throw error;}
finally {await browser.close();}
