// Somente sandbox aprovado; testes reais adicionais com JWTs mantidos em memoria.
// O operador altera DOIS vinculos sinteticos e sinaliza um arquivo privado.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {validateConfig,createHttp,login,jwtClaims,requireRows,requireBlocked,snapshot} from './testes-rls-rest.mjs';
const file=process.argv[2];
const c=validateConfig(JSON.parse(await fs.readFile(file,'utf8')),process.env.RLS_TEST_PROJECT_REF);
const http=createHttp(c); const tokens={}; let passed=0;
const log=x=>console.log(JSON.stringify(x));
const check=async(name,f)=>{try{await f();passed++;log({test:name,status:'PASS'});}catch{log({test:name,status:'FAIL'});throw new Error('Falhou; detalhes omitidos');}};
for(const a of ['viewer','editor','dual'])tokens[a]=await login(http,c.accounts[a]);
const rest=(a,table,query='',method='GET',body,prefer='return=representation')=>http('/rest/v1/'+table+query,tokens[a],method,body,prefer);
const state=async()=>requireRows(await rest('dual','dashboard_manual_inputs','?select=*&order=client_id,scope'));
const negative=async(name,action,opts={})=>check(name,async()=>{const before=await state();requireBlocked(await action(),opts);assert.deepEqual(await state(),before);});
await check('metadata role=admin nao altera vinculo viewer',async()=>{
 const r=await http('/auth/v1/user',tokens.viewer,'PUT',{data:{role:'admin'}});assert.equal(r.status,200);
 tokens.viewer=await login(http,c.accounts.viewer);assert.equal(jwtClaims(tokens.viewer).user_metadata.role,'admin');
 assert.equal(requireRows(await rest('viewer','dashboard_client_users',`?client_id=eq.${c.clientA}&select=role`),1)[0].role,'viewer');
});
await negative('metadata adulterada nao permite upsert',()=>rest('viewer','dashboard_manual_inputs','?on_conflict=client_id,scope','POST',{client_id:c.clientA,scope:'crm_snap_company',payload:snapshot('company')},'resolution=merge-duplicates,return=representation'));
await check('identidade gerada nao pode ser alterada via REST',async()=>{
 const before=await state();const r=await rest('editor','dashboard_manual_inputs',`?client_id=eq.${c.clientA}&scope=eq.crm_snap_company`,'PATCH',{id:99999999});
 assert.ok(r.status===400&&r.data?.code==='428C9'||r.status===403&&r.data?.code==='42501');assert.deepEqual(await state(),before);
});
const control=path.join(path.dirname(file),'operator-state.json');await fs.writeFile(control,JSON.stringify({phase:'waiting-role-revocation'}));
log({phase:'waiting-role-revocation',tokensKeptInMemory:true});
const limit=Date.now()+120000;let ready=false;
while(Date.now()<limit){const x=JSON.parse(await fs.readFile(control,'utf8'));if(x.phase==='roles-revoked'){ready=true;break;}await delay(1000);}
assert.ok(ready,'Operador nao concluiu fixture no prazo');
await check('JWT do editor continua valido apos rebaixamento',async()=>assert.equal((await http('/auth/v1/user',tokens.editor)).status,200));
await check('mesmo JWT consulta papel viewer atualizado no banco',async()=>assert.equal(requireRows(await rest('editor','dashboard_client_users',`?client_id=eq.${c.clientA}&select=role`),1)[0].role,'viewer'));
await check('leitura continua apos rebaixamento',async()=>assert.ok(requireRows(await rest('editor','dashboard_manual_inputs',`?client_id=eq.${c.clientA}&select=*`)).length>0));
await negative('mesmo JWT rebaixado nao atualiza',()=>rest('editor','dashboard_manual_inputs',`?client_id=eq.${c.clientA}&scope=eq.business`,'PATCH',{payload:{goals:{media_budget:999}}}),{zero:true});
await negative('mesmo JWT rebaixado nao faz upsert',()=>rest('editor','dashboard_manual_inputs','?on_conflict=client_id,scope','POST',{client_id:c.clientA,scope:'crm_snap_company',payload:snapshot('company')},'resolution=merge-duplicates,return=representation'));
await check('dual e viewer em B e continua lendo B',async()=>{
 assert.equal(requireRows(await rest('dual','dashboard_client_users',`?client_id=eq.${c.clientB}&select=role`),1)[0].role,'viewer');
 assert.ok(requireRows(await rest('dual','dashboard_manual_inputs',`?client_id=eq.${c.clientB}&select=*`)).length>0);
});
await negative('editor A nao herda escrita em B como viewer',()=>rest('dual','dashboard_manual_inputs',`?client_id=eq.${c.clientB}&scope=eq.business`,'PATCH',{payload:{goals:{media_budget:999}}}),{zero:true});
await negative('upsert B tambem negado ao viewer B',()=>rest('dual','dashboard_manual_inputs','?on_conflict=client_id,scope','POST',{client_id:c.clientB,scope:'crm_snap_company',payload:snapshot('company')},'resolution=merge-duplicates,return=representation'));
await check('dual continua editor em A',async()=>requireRows(await rest('dual','dashboard_manual_inputs',`?client_id=eq.${c.clientA}&scope=eq.crm_snap_company`,'PATCH',{payload:snapshot('company',11)}),1));
await http('/auth/v1/user',tokens.viewer,'PUT',{data:{role:null}});
await fs.writeFile(control,JSON.stringify({phase:'complete'}));
log({status:'PASS',phase:'extra',passed,projectRef:c.projectRef,sameJwtTested:true});
