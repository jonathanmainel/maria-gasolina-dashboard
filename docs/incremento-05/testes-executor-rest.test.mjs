// ESTES TESTES VALIDAM O EXECUTOR COM TRANSPORTE SIMULADO, NAO A RLS DO BANCO.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, createHttp, requireBlocked, requireRows, login, snapshot, PRODUCTION_REF } from './testes-rls-rest.mjs';
const ref='a'.repeat(20);
const jwt = role => `header.${Buffer.from(JSON.stringify({role})).toString('base64url')}.fake`;
const config = () => ({projectRef:ref,url:`https://${ref}.supabase.co/`,confirmation:'RLS_SANDBOX_ONLY',apiKey:'sb_publishable_abcdefghijklmnopqrstuvwxyz',clientA:1,clientB:2,
  accounts:Object.fromEntries(['viewer','editor','admin','other','dual'].map((a,i)=>[a,{email:`${a}@example.invalid`,password:'somente-teste-local',userId:`00000000-0000-0000-0000-00000000000${i+1}`}]))});
test('configuracao isolada completa aceita',()=>assert.equal(validateConfig(config(),ref).projectRef,ref));
test('producao recusada antes de rede',()=>{const c=config();c.projectRef=PRODUCTION_REF;c.url=`https://${PRODUCTION_REF}.supabase.co/`;assert.throws(()=>validateConfig(c,PRODUCTION_REF));});
test('URL de producao com ref falsa recusada',()=>{const c=config();c.url=`https://${PRODUCTION_REF}.supabase.co/`;assert.throws(()=>validateConfig(c,ref));});
test('ref sem aprovacao independente recusada',()=>assert.throws(()=>validateConfig(config(),undefined)));
test('URL HTTP ou redirecionamento/query recusados',()=>{for(const url of [`http://${ref}.supabase.co/`,`https://${ref}.supabase.co/?redirect=x`]){const c=config();c.url=url;assert.throws(()=>validateConfig(c,ref));}});
test('chaves privilegiadas recusadas',()=>{for(const key of ['sb_secret_example',jwt('service_role')]){const c=config();c.apiKey=key;assert.throws(()=>validateConfig(c,ref));}});
test('anon legado pode ser usado como apikey publica',()=>{const c=config();c.apiKey=jwt('anon');assert.doesNotThrow(()=>validateConfig(c,ref));});
test('identidades duplicadas recusadas',()=>{const c=config();c.accounts.editor.userId=c.accounts.viewer.userId;assert.throws(()=>validateConfig(c,ref));});
test('negacao RLS autenticada exige 42501/403',()=>assert.doesNotThrow(()=>requireBlocked({status:403,data:{code:'42501'}})));
test('UPDATE zero linhas aceito somente se previsto',()=>{const r={status:200,data:[]};assert.doesNotThrow(()=>requireBlocked(r,{zero:true}));assert.throws(()=>requireBlocked(r));});
test('mutacao com linha nao e negacao',()=>assert.throws(()=>requireBlocked({status:200,data:[{id:1}]},{zero:true})));
test('erros 5xx, sintaxe e sessao expirada nao contam como negacao',()=>{for(const r of [{status:500,data:{code:'XX000'}},{status:400,data:{code:'42601'}},{status:401,data:{code:'PGRST301'}}])assert.throws(()=>requireBlocked(r,{zero:true}));});
test('validacao de contrato tem codigo especifico',()=>{const r={status:400,data:{code:'23514'}};assert.throws(()=>requireBlocked(r));assert.doesNotThrow(()=>requireBlocked(r,{validation:true}));});
test('DELETE autorizado exige linha retornada',()=>{assert.equal(requireRows({status:200,data:[{id:1}]},1).length,1);assert.throws(()=>requireRows({status:200,data:[]},1));});
test('transporte usa JWT do usuario e impede redirect',async()=>{let call;const http=createHttp(config(),async(url,opts)=>{call={url,opts};return {status:200,json:async()=>[]};});await http('/rest/v1/dashboard_manual_inputs','usuario-token');assert.equal(call.opts.headers.Authorization,'Bearer usuario-token');assert.equal(call.opts.redirect,'error');assert.equal(call.opts.headers.apikey,config().apiKey);});
test('login confirma Auth user e papel authenticated',async()=>{const a=config().accounts.viewer;const seen=[];const token=jwt('authenticated');const http=async(path)=>{seen.push(path);return path.startsWith('/auth/v1/token')?{status:200,data:{access_token:token}}:{status:200,data:{id:a.userId}};};assert.equal(await login(http,a),token);assert.deepEqual(seen,['/auth/v1/token?grant_type=password','/auth/v1/user']);});
test('falha de login e token privilegiado interrompem',async()=>{const a=config().accounts.viewer;await assert.rejects(()=>login(async()=>({status:400,data:{}}),a));await assert.rejects(()=>login(async()=>({status:200,data:{access_token:jwt('service_role')}}),a));});
test('contratos dos dois modelos preservados',()=>{assert.equal(Object.keys(snapshot('company').values.stages).length,8);assert.equal(Object.keys(snapshot('franchise').values.stages).length,10);});
