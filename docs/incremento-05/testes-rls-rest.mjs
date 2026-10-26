// Homologacao REAL: executar somente contra Supabase isolado aprovado.
// Nao usa SQL, service_role, JWT assinado localmente ou mocks no modo CLI.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { relative, resolve, isAbsolute, sep } from 'node:path';

export const PRODUCTION_REF = 'hlqrpreqvvxtkruwsolg';
const ACTORS = ['viewer','editor','admin','other','dual'];
const FRONTS = ['condominium','company','gym','hospital','franchise'];
const MARKER = 'RLS_SANDBOX_ONLY';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function jwtClaims(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); }
  catch { throw new Error('JWT invalido; conteudo omitido'); }
}
export function validateConfig(c, approvedRef) {
  assert.match(c.projectRef ?? '', /^[a-z0-9]{20}$/);
  assert.notEqual(c.projectRef, PRODUCTION_REF, 'PRODUCAO BLOQUEADA');
  assert.equal(c.projectRef, approvedRef, 'Ref deve coincidir com RLS_TEST_PROJECT_REF');
  assert.equal(c.confirmation, MARKER, 'Confirmacao de ambiente isolado ausente');
  const u = new URL(c.url);
  assert.equal(u.href, `https://${c.projectRef}.supabase.co/`, 'URL deve ser exata, HTTPS e sem redirecionamento');
  assert.equal(c.clientA, 1); assert.ok(Number.isSafeInteger(c.clientB) && c.clientB > 1);
  assert.ok(typeof c.apiKey === 'string' && c.apiKey.length > 20, 'Chave publica necessaria');
  assert.ok(!c.serviceRoleKey && !c.secretKey, 'Credenciais privilegiadas proibidas');
  if (!c.apiKey.startsWith('sb_publishable_')) assert.equal(jwtClaims(c.apiKey).role, 'anon', 'Somente publishable/anon');
  const ids = new Set();
  for (const a of ACTORS) {
    const user = c.accounts?.[a];
    assert.ok(user && typeof user.email === 'string' && user.email.includes('@') && typeof user.password === 'string' && user.password.length > 0, 'Conta sintetica incompleta');
    assert.match(user.userId ?? '', uuid); ids.add(user.userId);
  }
  assert.equal(ids.size, ACTORS.length, 'Os cinco perfis precisam de identidades distintas');
  return c;
}
export function createHttp(c, fetchImpl = globalThis.fetch) {
  const base = new URL(c.url).origin;
  return async (path, token, method = 'GET', body, prefer = 'return=representation') => {
    assert.ok(path.startsWith('/auth/v1/') || path.startsWith('/rest/v1/'));
    const dest = new URL(path, base); assert.equal(dest.origin, base);
    const headers = { apikey: c.apiKey, 'Content-Type': 'application/json', Prefer: prefer };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetchImpl(dest.href, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(20000) });
    const data = await r.json().catch(() => null);
    return { status: r.status, data };
  };
}
export function requireRows(r, count) {
  assert.ok(r.status >= 200 && r.status < 300, `HTTP ${r.status}; codigo=${r.data?.code ?? 'omitido'}`);
  assert.ok(Array.isArray(r.data), 'Esperada representacao de linhas');
  if (count !== undefined) assert.equal(r.data.length, count, 'Quantidade afetada inesperada');
  return r.data;
}
export function requireBlocked(r, { zero = false, validation = false, anon = false } = {}) {
  if (zero && r.status >= 200 && r.status < 300 && Array.isArray(r.data) && r.data.length === 0) return;
  assert.ok((r.status === 403 || (anon && r.status === 401)) && r.data?.code === '42501'
    || validation && r.status === 400 && r.data?.code === '23514',
    `Negacao nao comprovada: HTTP ${r.status}; codigo=${r.data?.code ?? 'omitido'}`);
}
export async function login(http, account) {
  const r = await http('/auth/v1/token?grant_type=password', null, 'POST', { email: account.email, password: account.password });
  assert.equal(r.status, 200, 'Login falhou; nao contar como negacao RLS');
  assert.equal(jwtClaims(r.data?.access_token ?? '').role, 'authenticated', 'Sessao nao e de usuario comum');
  const token = r.data.access_token;
  const who = await http('/auth/v1/user', token);
  assert.equal(who.status, 200, 'Sessao nao validada pelo Auth');
  assert.equal(who.data?.id, account.userId, 'Identidade diferente da fixture aprovada');
  return token;
}
export function snapshot(front, lead = 9) {
  const stages = front === 'franchise'
    ? ['lead','contact','recall','fqc','visit_call','cof','pre_contract','waiting','contract','implementation']
    : ['lead','contact','recall','fqa','visit_proposal','assembly','contract','implementation'];
  return { version:1, origin:'manual', front, kind:'snapshot', period:null,
    values:{ stages:Object.fromEntries(stages.map((s,i) => [s, i === 0 ? lead : i+2])), stage_days:{} } };
}
const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k,canonical(x[k])])) : x;

export async function runSuite(c, http, { frozen = false, report = x => console.log(JSON.stringify(x)) } = {}) {
  const tokens = {}; let passed = 0;
  const check = async (name, f) => {
    try { await f(); passed++; report({test:name,status:'PASS'}); }
    catch { report({test:name,status:'FAIL'}); throw new Error('Falha no caso; detalhes sensiveis omitidos'); }
  };
  for (const a of ACTORS) tokens[a] = await login(http,c.accounts[a]);
  const rest = (a, table, query = '', method = 'GET', body, prefer) =>
    http(`/rest/v1/${table}${query}`, a ? tokens[a] : null, method, body, prefer);
  const A=c.clientA, B=c.clientB;
  const expected = { viewer:[[A,'viewer']], editor:[[A,'editor']], admin:[[A,'admin']], other:[[B,'admin']], dual:[[A,'editor'],[B,'editor']] };
  for (const a of ACTORS) await check(`perfil autenticado ${a}`, async () => {
    const rows=requireRows(await rest(a,'dashboard_client_users','?select=client_id,user_id,role&order=client_id'));
    assert.deepEqual(rows.map(r=>[r.client_id,r.role]),expected[a]);
    assert.ok(rows.every(r=>r.user_id===c.accounts[a].userId));
  });
  const clients=requireRows(await rest('dual','dashboard_clients','?select=id,slug,name&order=id'),2);
  assert.deepEqual(clients.map(x=>x.id),[A,B]);
  assert.ok(clients.every(x=>x.name===MARKER), 'Cliente sem marcador de fixture isolada');
  assert.equal(clients[0].slug,'maria-gasolina'); assert.equal(clients[1].slug,'rls-sandbox-b');
  const readAll=async()=>requireRows(await rest('dual','dashboard_manual_inputs','?select=*&order=client_id,scope'));
  const row=(front,client=A)=>({client_id:client,scope:`crm_snap_${front}`,payload:snapshot(front)});
  const where=(client,scope)=>`?client_id=eq.${client}&scope=eq.${scope}`;
  const upsert=(a,item)=>rest(a,'dashboard_manual_inputs','?on_conflict=client_id,scope','POST',item,'resolution=merge-duplicates,return=representation');
  const negative=async(name, action, opts={})=>check(name,async()=>{
    const before=canonical(await readAll());
    requireBlocked(await action(),opts);
    assert.deepEqual(canonical(await readAll()),before,'Tentativa negada alterou registros');
  });
  if (frozen) {
    for (const a of ['viewer','editor','admin']) {
      await check(`leitura preservada apos reversao ${a}`, async()=>assert.ok(requireRows(await rest(a,'dashboard_manual_inputs','?select=*')).length>0));
      await negative(`INSERT congelado ${a}`,()=>upsert(a,row('company')));
      await negative(`UPDATE congelado ${a}`,()=>rest(a,'dashboard_manual_inputs',where(A,'business'),'PATCH',{payload:{goals:{media_budget:999}}}));
      await negative(`DELETE congelado ${a}`,()=>rest(a,'dashboard_manual_inputs',where(A,'crm_snap_company'),'DELETE'));
    }
    return {status:'PASS',phase:'frozen',passed,authentication:'Supabase Auth + REST',projectRef:c.projectRef};
  }
  const initial=await readAll();
  assert.equal(initial.length,1,'Fixture inicial deve ter somente business de A; usar sandbox nova');
  assert.equal(initial[0].client_id,A); assert.equal(initial[0].scope,'business');
  assert.equal(initial[0].payload?.goals?.media_budget,12345);
  // B cria dados pela API autenticada: nao usa SQL privilegiado para provar escrita.
  await check('admin B cria dados de B',async()=>{
    requireRows(await upsert('other',{client_id:B,scope:'business',payload:{goals:{media_budget:22222}}}),1);
    requireRows(await upsert('other',row('company',B)),1);
  });
  for (const front of FRONTS) await check(`editor cria snapshot ${front}`,async()=>requireRows(await upsert('editor',row(front)),1));
  const result={client_id:A,scope:'crm_res_condominium_20261001_20261023',payload:{version:1,origin:'manual',front:'condominium',kind:'result',period:{start:'2026-10-01',end:'2026-10-23'},values:{contracts_closed:2,revenue:1250}}};
  await check('editor grava resultado com periodo',async()=>requireRows(await upsert('editor',result),1));
  await check('viewer le somente cliente A',async()=>{
    const rows=requireRows(await rest('viewer','dashboard_manual_inputs','?select=*'),7);
    assert.ok(rows.every(x=>x.client_id===A));
  });
  for (const a of ['viewer','editor','admin']) {
    await check(`${a} nao le cliente B`,async()=>requireRows(await rest(a,'dashboard_manual_inputs',`?client_id=eq.${B}&select=*`),0));
    await negative(`${a} nao altera B`,()=>rest(a,'dashboard_manual_inputs',where(B,'business'),'PATCH',{payload:{}}),{zero:true});
    await negative(`${a} nao exclui B`,()=>rest(a,'dashboard_manual_inputs',where(B,'crm_snap_company'),'DELETE'),{zero:true});
    await negative(`${a} nao insere em B`,()=>upsert(a,row('gym',B)));
  }
  await negative('viewer INSERT negado',()=>rest('viewer','dashboard_manual_inputs','','POST',row('company')));
  await negative('viewer upsert negado',()=>upsert('viewer',row('company')));
  await negative('viewer UPDATE comercial negado',()=>rest('viewer','dashboard_manual_inputs',where(A,'crm_snap_company'),'PATCH',{payload:snapshot('company',100)}),{zero:true});
  await negative('viewer UPDATE metas negado',()=>rest('viewer','dashboard_manual_inputs',where(A,'business'),'PATCH',{payload:{goals:{media_budget:999}}}),{zero:true});
  for (const a of ['viewer','editor']) await negative(`${a} DELETE proprio negado`,()=>rest(a,'dashboard_manual_inputs',where(A,'crm_snap_company'),'DELETE'),{zero:true});
  for (const a of ['viewer','editor','admin']) await check(`${a} nao altera vinculo proprio`,async()=>{
    requireBlocked(await rest(a,'dashboard_client_users',`?client_id=eq.${A}&user_id=eq.${c.accounts[a].userId}`,'PATCH',{role:'admin'}));
    const own=requireRows(await rest(a,'dashboard_client_users',`?client_id=eq.${A}&select=role`),1);
    assert.equal(own[0].role,expected[a][0][1]);
  });
  await check('viewer nao cria vinculo em B',async()=>requireBlocked(await rest('viewer','dashboard_client_users','','POST',{client_id:B,user_id:c.accounts.viewer.userId,role:'editor'})));
  await negative('editor nao altera client_id mesmo com acesso aos dois',()=>rest('dual','dashboard_manual_inputs',where(A,'crm_snap_company'),'PATCH',{client_id:B}));
  await negative('scope imutavel',()=>rest('editor','dashboard_manual_inputs',where(A,'crm_snap_company'),'PATCH',{scope:'crm_snap_gym',payload:snapshot('gym')}));
  await negative('scope comercial nao vira business',()=>rest('editor','dashboard_manual_inputs',where(A,'crm_snap_company'),'PATCH',{scope:'business'}));
  await negative('created_at imutavel',()=>rest('editor','dashboard_manual_inputs',where(A,'crm_snap_company'),'PATCH',{created_at:'2000-01-01T00:00:00Z'}));
  const bad=snapshot('company'); bad.front='gym';
  await negative('frente adulterada negada',()=>rest('editor','dashboard_manual_inputs',where(A,'crm_snap_company'),'PATCH',{payload:bad}),{validation:true});
  const demo=snapshot('company'); demo.origin='demo';
  await negative('origem demonstrativa negada',()=>rest('editor','dashboard_manual_inputs',where(A,'crm_snap_company'),'PATCH',{payload:demo}),{validation:true});
  const badPeriod=structuredClone(result.payload); badPeriod.period.end='2026-10-24';
  await negative('periodo incompativel negado',()=>rest('editor','dashboard_manual_inputs',where(A,result.scope),'PATCH',{payload:badPeriod}),{validation:true});
  const before=(await readAll()).find(x=>x.client_id===A&&x.scope==='crm_snap_company');
  await check('autoria e horario definidos no servidor; upsert preserva identidade',async()=>{
    const time=Date.now();
    const [saved]=requireRows(await upsert('editor',{...row('company'),updated_by:c.accounts.viewer.userId,updated_at:'2000-01-01T00:00:00Z'}),1);
    assert.equal(saved.updated_by,c.accounts.editor.userId); assert.equal(saved.id,before.id); assert.equal(saved.created_at,before.created_at);
    assert.ok(Math.abs(Date.parse(saved.updated_at)-time)<120000,'Horario servidor fora da tolerancia de relogio');
  });
  await check('editor atualiza metas sem apagar campos restantes',async()=>{
    const current=(await readAll()).find(x=>x.client_id===A&&x.scope==='business');
    const [saved]=requireRows(await upsert('editor',{client_id:A,scope:'business',payload:{...current.payload,goals:{...current.payload.goals,media_budget:23456}}}),1);
    assert.equal(saved.payload.legacy_note,'preservar'); assert.equal(saved.payload.goals.media_budget,23456);
  });
  await check('admin atualiza comercial proprio',async()=>requireRows(await rest('admin','dashboard_manual_inputs',where(A,'crm_snap_company'),'PATCH',{payload:snapshot('company',20)}),1));
  await negative('admin nao exclui metas',()=>rest('admin','dashboard_manual_inputs',where(A,'business'),'DELETE'),{zero:true});
  await check('admin DELETE comercial permitido: grant e policy efetivos',async()=>{
    requireRows(await rest('admin','dashboard_manual_inputs',where(A,'crm_snap_hospital'),'DELETE'),1);
    requireRows(await rest('editor','dashboard_manual_inputs',where(A,'crm_snap_hospital')+'&select=*'),0);
  });
  await negative('anon SELECT negado',()=>rest(null,'dashboard_manual_inputs','?select=*'),{anon:true});
  await negative('anon INSERT negado',()=>rest(null,'dashboard_manual_inputs','','POST',row('gym')),{anon:true});
  await check('cliente B e metas preservados',async()=>{
    const rows=await readAll();
    assert.deepEqual(rows.find(x=>x.client_id===B&&x.scope==='crm_snap_company').payload,snapshot('company'));
    assert.equal(rows.find(x=>x.client_id===B&&x.scope==='business').payload.goals.media_budget,22222);
    assert.equal(rows.find(x=>x.client_id===A&&x.scope==='business').payload.legacy_note,'preservar');
  });
  for (const a of ACTORS) await check(`sessao permaneceu valida ${a}`,async()=>assert.equal((await http('/auth/v1/user',tokens[a])).status,200));
  return {status:'PASS',phase:'baseline',passed,authentication:'Supabase Auth + REST',projectRef:c.projectRef};
}

async function main() {
  const file=process.argv[2]; assert.ok(file,'Informar arquivo privado de configuracao');
  const inside=relative(fileURLToPath(new URL('../../',import.meta.url)),resolve(file));
  assert.ok(inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside),'Configuracao com senhas deve ficar fora do repositorio');
  const c=validateConfig(JSON.parse(await readFile(file,'utf8')),process.env.RLS_TEST_PROJECT_REF);
  const result=await runSuite(c,createHttp(c),{frozen:process.argv.includes('--frozen')});
  console.log(JSON.stringify(result));
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(()=>{ console.error('FAIL: homologacao interrompida. Verificar ultimo caso no relatorio privado; detalhes sensiveis omitidos.'); process.exitCode=1; });
}
