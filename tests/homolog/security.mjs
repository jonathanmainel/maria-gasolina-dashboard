import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const ref='uwafdxsdsgqysjjxfywo',url=`https://${ref}.supabase.co`;
assert.ok(process.env.HOMOLOG_AUTH_FILE,'Private homologation configuration file required');
const cfg=JSON.parse((await fs.readFile(process.env.HOMOLOG_AUTH_FILE,'utf8')).replace(/^\uFEFF/,''));
assert.equal(cfg.projectRef,ref);assert.equal(cfg.url.replace(/\/$/,''),url);
const checks=[];
async function call(path,token,body){const r=await fetch(url+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:cfg.apiKey,authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});return {http:r.status,data:await r.json()};}
for(const role of ['admin','viewer','editor','other']){
 const a=cfg.accounts[role];const login=await call('/auth/v1/token?grant_type=password',cfg.apiKey,{email:a.email,password:a.password});assert.equal(login.http,200);const token=login.data.access_token;
 if(role!=='admin'){
  const r=await call('/functions/v1/request-dashboard-sync',token,{action:'request',client_slug:'maria-gasolina',sources:['google_ads'],request_key:crypto.randomUUID()});assert.equal(r.http,403);checks.push(`${role}: server denial`);
 }
 for(const name of ['sync-google-ads','sync-meta-ads','sync-ga4','sync-dashboard-daily']){
  const r=await call('/functions/v1/'+name,token,{client_slug:'maria-gasolina',dry_run:true,trigger:'cron'});assert.ok([401,403].includes(r.http));checks.push(`${role}: ${name} rejects user JWT`);
 }
 const rpc=await call('/rest/v1/rpc/request_dashboard_sync',token,{p_client_slug:'maria-gasolina',p_user_id:cfg.accounts.admin.userId,p_sources:['google_ads'],p_request_key:crypto.randomUUID()});assert.ok([401,403,404].includes(rpc.http));checks.push(`${role}: direct privileged RPC denied`);
}
const report={project_ref:ref,passed:true,checks,production_accessed:false};await fs.writeFile('artifacts/homolog-integrada-20261027/security-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
