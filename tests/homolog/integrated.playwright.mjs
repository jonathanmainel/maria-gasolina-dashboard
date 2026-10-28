// Real Supabase Auth/REST/Edge/pg_net. Only provider transport is substituted in isolated collector packages.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const REF='uwafdxsdsgqysjjxfywo', origin=`https://${REF}.supabase.co`, local='http://127.0.0.1:5190';
const dir='artifacts/homolog-integrada-20261027';
assert.ok(process.env.HOMOLOG_AUTH_FILE,'Private homologation configuration file required');
const cfg=JSON.parse((await fs.readFile(process.env.HOMOLOG_AUTH_FILE,'utf8')).replace(/^\uFEFF/,''));
assert.equal(cfg.projectRef,REF);assert.equal(cfg.url.replace(/\/$/,''),origin);
const phase=process.argv[2]??'partial';assert.ok(['partial','success'].includes(phase));
const report={project_ref:REF,phase,marketing_transport:'controlled',infrastructure:'real',started_at:new Date().toISOString(),checks:{},errors:[],blocked_origins:[]};
async function auth(role){
 const a=cfg.accounts[role];const response=await fetch(origin+'/auth/v1/token?grant_type=password',{method:'POST',redirect:'error',headers:{apikey:cfg.apiKey,'content-type':'application/json'},body:JSON.stringify({email:a.email,password:a.password})});
 assert.equal(response.status,200,'Real Auth login');const session=await response.json();
 const verification=await fetch(origin+'/auth/v1/user',{redirect:'error',headers:{apikey:cfg.apiKey,authorization:'Bearer '+session.access_token}});assert.equal(verification.status,200);assert.equal((await verification.json()).id,a.userId);
 return session;
}
async function invoke(session,body){const response=await fetch(origin+'/functions/v1/request-dashboard-sync',{method:'POST',redirect:'error',headers:{apikey:cfg.apiKey,authorization:'Bearer '+session.access_token,'content-type':'application/json'},body:JSON.stringify({client_slug:'maria-gasolina',...body})});return {http:response.status,data:await response.json()};}
const admin=await auth('admin'),viewer=await auth('viewer');
report.checks.real_admin_login=true;report.checks.real_viewer_login=true;
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1100},timezoneId:'America/Sao_Paulo',reducedMotion:'reduce'});
await context.addInitScript(({session,ref})=>localStorage.setItem(`sb-${ref}-auth-token`,JSON.stringify(session)),{session:admin,ref:REF});
await context.route('**/*',route=>{const url=new URL(route.request().url());if([origin,local].includes(url.origin))return route.continue();report.blocked_origins.push(url.origin);return route.abort();});
const page=await context.newPage();let collectionRequest,reads=0;const metricEnds=[];
page.on('pageerror',e=>report.errors.push(e.message));
page.on('request',req=>{const u=new URL(req.url());if(u.origin===origin){assert.ok(!Object.values(req.headers()).some(x=>x.includes('sb_secret_')),'No backend key in browser');if(u.pathname.endsWith('/dashboard_campaign_daily')){reads++;metricEnds.push(u.searchParams.getAll('metric_date').find(x=>x.startsWith('lte.')));}if(u.pathname.includes('/functions/v1/'))assert.ok(u.pathname.endsWith('/request-dashboard-sync'),'Frontend calls only authenticated endpoint');}});
page.on('response',async response=>{if(response.url()===origin+'/functions/v1/request-dashboard-sync'&&response.request().method()==='POST'){const body=response.request().postDataJSON();if(body.action==='request')collectionRequest={http:response.status(),data:await response.json(),request_key:body.request_key};}});
try{
 await page.goto(local+'/dashboard/maria-gasolina');
 await page.getByRole('button',{name:'Atualizar agora',exact:true}).waitFor({timeout:45000});
 await page.waitForFunction(()=>document.querySelector('.data-sync-trigger')?.disabled===false,{},{timeout:240000});
 await page.screenshot({path:`${dir}/${phase}-desktop-before.png`});
 const initialReads=reads;const navBefore=await page.evaluate(()=>performance.getEntriesByType('navigation').length);
 await page.getByRole('button',{name:'Atualizar agora',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.data-sync-panel'));
 for(let n=0;n<30&&!collectionRequest;n++)await new Promise(r=>setTimeout(r,200));
 assert.equal(collectionRequest?.http,202);assert.equal(collectionRequest.data.results.filter(x=>x.state==='accepted').length,3);
 report.request=collectionRequest;
 const ids=collectionRequest.data.results.map(x=>x.run_id);assert.equal(ids.length,3);
 // Four independent request keys race against the same source/client reservations.
 const races=await Promise.all(Array.from({length:4},()=>invoke(admin,{action:'request',sources:['google_ads','meta_ads','ga4'],request_key:crypto.randomUUID()})));
 report.concurrent=races.map(x=>({http:x.http,states:x.data.results?.map(r=>r.state)}));
 assert.ok(races.every(x=>x.http===202&&x.data.results.every(r=>['active','cooldown'].includes(r.state))));
 const repeated=await invoke(admin,{action:'request',sources:['google_ads','meta_ads','ga4'],request_key:collectionRequest.request_key});
 assert.deepEqual(repeated.data.results.map(x=>x.run_id).sort(),[...ids].sort());report.checks.request_key_idempotency=true;report.checks.concurrent_reservations_blocked=true;
 let status;
 for(let n=0;n<35;n++){
  status=await invoke(admin,{action:'status',run_ids:ids});assert.equal(status.http,200);
  const runs=status.data.requested_runs;
  if(runs.length===3&&runs.every(r=>['success','failed','indeterminate'].includes(r.status)))break;
  await new Promise(r=>setTimeout(r,2000));
 }
 report.status=status.data;
 assert.equal(status.data.requested_runs.length,3);
 const states=Object.fromEntries(status.data.requested_runs.map(r=>[r.source,r.status]));
 assert.deepEqual(states,phase==='partial'?{google_ads:'success',meta_ads:'failed',ga4:'success'}:{google_ads:'success',meta_ads:'success',ga4:'success'});
 assert.ok(status.data.requested_runs.every(r=>r.requested_by===cfg.accounts.admin.userId&&r.range_end===status.data.today&&r.period_mode==='including_today'));
 report.checks.author_and_today_audit=true;
 await page.getByRole('button',{name:phase==='partial'?'Parcialmente concluído':'Concluído',exact:true}).waitFor({timeout:20000});
 assert.ok(reads>initialReads,'Confirmed completion refetches persisted marketing data');
 await page.locator('.data-sync-panel').screenshot({path:`${dir}/${phase}-result.png`});
 await page.getByRole('button',{name:'Ver Hoje · parcial'}).click();await page.locator('.intraday-banner').waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.kpi').length>0);
 assert.ok(metricEnds.includes('lte.'+status.data.today));
 report.today_kpis=await page.locator('.kpi').allTextContents();
 assert.ok(report.today_kpis.some(text=>text.startsWith('Leads gerados (todas as frentes)'+(phase==='partial'?'2':'8'))),'Today KPI matches persisted controlled metrics');
 assert.equal(await page.evaluate(()=>performance.getEntriesByType('navigation').length),navBefore);
 report.checks.today_filter_and_partial_notice=true;report.checks.no_page_reload=true;report.checks.real_marketing_reads=reads;
 await page.screenshot({path:`${dir}/${phase}-today.png`});
 await page.locator('.period-button').click();await page.getByRole('button',{name:'Hoje',exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth)),0);
 await page.getByRole('button',{name:'Ver atualização das fontes'}).click();
 assert.equal(await page.locator('.data-sync-sources article').count(),3);
 await page.screenshot({path:`${dir}/${phase}-mobile.png`});report.checks.mobile_no_overflow=true;
 const denied=await invoke(viewer,{action:'request',sources:['google_ads'],request_key:crypto.randomUUID()});assert.equal(denied.http,403);
 const viewerStatus=await invoke(viewer,{action:'status'});assert.equal(viewerStatus.http,200);assert.equal(viewerStatus.data.can_request,false);report.checks.real_viewer_backend_blocked=true;
 const unauth=await invoke({access_token:'invalid'},{action:'status'});assert.equal(unauth.http,401);report.checks.invalid_auth_blocked=true;
 const cooldown=await invoke(admin,{action:'request',sources:['google_ads','meta_ads','ga4'],request_key:crypto.randomUUID()});assert.ok(cooldown.data.results.every(x=>x.state==='cooldown'));report.checks.five_minute_cooldown_blocked=true;report.cooldown=cooldown.data;
 const viewerContext=await browser.newContext({viewport:{width:390,height:844}});await viewerContext.addInitScript(({session,ref})=>localStorage.setItem(`sb-${ref}-auth-token`,JSON.stringify(session)),{session:viewer,ref:REF});
 const vp=await viewerContext.newPage();await vp.goto(local+'/dashboard/maria-gasolina');await vp.getByRole('button',{name:'Ver atualização das fontes'}).waitFor({timeout:30000});assert.equal(await vp.locator('.data-sync-trigger').count(),0);await vp.getByRole('button',{name:'Ver atualização das fontes'}).click();await vp.getByText('Consulta disponível. Somente administradores podem iniciar coletas.').waitFor();await vp.screenshot({path:`${dir}/${phase}-viewer.png`});report.checks.real_viewer_ui_read_only=true;
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.blocked_origins,[]);report.passed=true;
}catch(error){report.passed=false;report.failure=String(error);report.safe_page_text=(await page.locator('body').innerText()).slice(0,6000);await page.screenshot({path:`${dir}/${phase}-failure.png`,fullPage:true});process.exitCode=1;}
finally{report.completed_at=new Date().toISOString();await fs.writeFile(`${dir}/${phase}-integrated-result.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
