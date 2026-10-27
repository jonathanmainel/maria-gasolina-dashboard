// Real PostgreSQL concurrency/permissions. Auth identity and HTTP transport here
// are synthetic fixtures; this is NOT Supabase Auth/Edge end-to-end validation.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const url = new URL(process.env.SYNC_TEST_DATABASE_URL ?? '');
if (url.hostname !== '127.0.0.1' || url.pathname !== '/mg_sync_sandbox_only' || url.port !== '55436') throw new Error('Only the dedicated local disposable database is permitted');
const { default: pg } = await import(pathToFileURL(process.env.SYNC_TEST_PG_MODULE).href);
const pool = new pg.Pool({ connectionString: url.toString(), max: 16 });
const editor = '10000000-0000-4000-8000-000000000001';
const viewer = '10000000-0000-4000-8000-000000000002';
const admin = '10000000-0000-4000-8000-000000000003';
const foreign = '10000000-0000-4000-8000-000000000004';
const manager = '10000000-0000-4000-8000-000000000005';
const base = `
do $$begin
if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end$$;
create schema auth; create schema private; create schema vault; create schema net;
create table auth.users(id uuid primary key);
create table public.dashboard_clients(id bigint primary key,slug text unique,name text,active boolean);
create table public.dashboard_client_users(client_id bigint references public.dashboard_clients,user_id uuid references auth.users,role text,primary key(client_id,user_id));
create table public.dashboard_source_accounts(client_id bigint references public.dashboard_clients,source text,account_id text,active boolean,automation_enabled boolean);
create table public.dashboard_daily_metrics(client_id bigint,source text,account_id text,metric_date date,spend numeric,conversions numeric,unique(client_id,source,account_id,metric_date));
create table public.dashboard_automation_runs(id uuid primary key default gen_random_uuid(),client_id bigint references public.dashboard_clients,
source text,trigger text,range_start date,range_end date,status text,http_status integer,counts jsonb not null default '{}',database_write_status text,
error_message text,started_at timestamptz not null default now(),completed_at timestamptz,account_id text,duration_ms bigint,
constraint dashboard_automation_runs_source_check check(source in ('google_ads','meta_ads','ga4')),
constraint dashboard_automation_runs_trigger_check check(trigger in ('cron','manual')),
constraint dashboard_automation_runs_status_check check(status in ('running','success','failed')),
constraint dashboard_automation_runs_range_check check(range_start<=range_end));
alter table public.dashboard_automation_runs enable row level security;
grant usage on schema public,auth to service_role;
grant all on all tables in schema public to service_role;
grant select on public.dashboard_automation_runs to authenticated;
create table vault.decrypted_secrets(name text primary key,decrypted_secret text);
insert into vault.decrypted_secrets values ('dashboard_project_url','https://transport.invalid'),('dashboard_cron_secret_key','SYNTHETIC_ONLY');
create table net.dispatches(id bigserial primary key,body jsonb,timeout_ms integer);
create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds int default 5000)
returns bigint language sql as 'insert into net.dispatches(body,timeout_ms) values(body,timeout_milliseconds) returning id';
insert into auth.users values ('${editor}'),('${viewer}'),('${admin}'),('${foreign}'),('${manager}');
insert into public.dashboard_clients values (1,'maria-gasolina','SYNC_SANDBOX_ONLY',true),(2,'other-client','SYNC_SANDBOX_B',true);
insert into public.dashboard_client_users values(1,'${editor}','editor'),(1,'${viewer}','viewer'),(1,'${admin}','admin'),(2,'${foreign}','admin'),(1,'${manager}','manager');
insert into public.dashboard_source_accounts select c,source,'account-'||c,true,true from unnest(array[1,2]) c cross join unnest(array['google_ads','meta_ads','ga4']) source;
`;
let assertions = 0;
function check(value, message) { assert.ok(value, message); assertions++; }
async function query(sql, params = [], role = 'service_role') {
  const conn = await pool.connect();
  try { await conn.query(`set role ${role}`); return await conn.query(sql, params); }
  finally { await conn.query('reset role'); conn.release(); }
}
const rpc = async (sql, params) => (await query(sql, params)).rows[0].result;
async function denied(sql, params, role = 'service_role') {
  await assert.rejects(query(sql, params, role), (error) => error.code === '42501'); assertions++;
}
const request = (user, sources, key = randomUUID(), slug = 'maria-gasolina') => rpc('select public.request_dashboard_sync($1,$2,$3,$4) result', [slug,user,sources,key]);
try {
  const tables = await pool.query("select count(*) from information_schema.tables where table_schema='public'");
  if (+tables.rows[0].count !== 0) throw new Error('Refusing non-empty database; use a new disposable cluster');
  // Load original production table definitions, not a reimplementation of upsert.
  const schema = await fs.readFile(new URL('../supabase/migrations/20260909024415_create_dashboard_ingestion_schema.sql',import.meta.url),'utf8');
  const tableDefinition = (name) => {
    const start = schema.indexOf(`create table if not exists public.${name} (`);
    assert.ok(start>=0); return schema.slice(start,schema.indexOf('\n);',start)+4);
  };
  const faithfulBase = base.replace(/create table public.dashboard_daily_metrics\([^;]+;/,
    tableDefinition('dashboard_daily_metrics')+tableDefinition('dashboard_campaign_daily')+tableDefinition('dashboard_sync_runs'));
  await pool.query(faithfulBase);
  await pool.query('create function private.is_dashboard_client_member(bigint) returns boolean language sql as $$select false$$');
  await pool.query(await fs.readFile(new URL('../supabase/migrations/20260909045422_paid_media_first_version.sql',import.meta.url),'utf8'));
  await pool.query(await fs.readFile(new URL('../supabase/migrations/20261027200303_dashboard_manual_sync.sql', import.meta.url), 'utf8'));
  await denied('select public.request_dashboard_sync($1,$2,$3,$4)', ['maria-gasolina',editor,['google_ads'],randomUUID()], 'authenticated');
  await denied('select public.get_dashboard_sync_status($1,$2)', ['maria-gasolina',viewer], 'anon');
  await denied('select private.dispatch_dashboard_sync($1)', [[]], 'authenticated');
  for (const user of [viewer,editor,foreign,manager]) await denied('select public.request_dashboard_sync($1,$2,$3,$4)', ['maria-gasolina',user,['google_ads'],randomUUID()]);
  const view = await rpc('select public.get_dashboard_sync_status($1,$2) result', ['maria-gasolina',viewer]);
  check(view.can_request === false && view.sources.length === 3,'Viewer can read');
  await denied('select public.get_dashboard_sync_status($1,$2)', ['other-client',viewer]);

  const sameKey = randomUUID();
  const concurrent = await Promise.all(Array.from({length:12},()=>request(admin,['google_ads'])));
  check(concurrent.filter(r=>r.results[0].state==='accepted').length===1,'Exactly one of twelve concurrent requests accepted');
  check(concurrent.filter(r=>r.results[0].state==='active').length===11,'Others attach to existing run');
  const googleId = concurrent.find(r=>r.results[0].state==='accepted').results[0].run_id;
  check(+(await pool.query('select count(*) from net.dispatches')).rows[0].count===1,'Only one dispatch');
  const claims = await Promise.all(Array.from({length:8},()=>rpc('select public.start_dashboard_sync_run($1) result',[googleId])));
  check(claims.filter(Boolean).length===1,'Exactly one worker claims a run');
  const range = claims.find(Boolean);
  const databaseToday=(await pool.query("select (now() at time zone 'America/Sao_Paulo')::date::text today")).rows[0].today;
  check(range.range_end===databaseToday,'Manual range includes today in Sao Paulo');
  check((await pool.query('select period_mode from public.dashboard_automation_runs where id=$1',[googleId])).rows[0].period_mode==='including_today','Partial period recorded');
  check(await rpc('select public.begin_dashboard_sync_collection($1,2,$2,$3,$4) result',[googleId,'google_ads',range.range_start,range.range_end])===false,'Foreign client collector denied');
  const collectors = await Promise.all(Array.from({length:8},()=>rpc('select public.begin_dashboard_sync_collection($1,1,$2,$3,$4) result',[googleId,'google_ads',range.range_start,range.range_end])));
  check(collectors.filter(Boolean).length===1,'Exactly one collector claims a reservation');
  await query("select public.finish_dashboard_sync_run($1,'success',200,'{\"daily\":7}','success',null)",[googleId]);
  const cooldown = await request(admin,['google_ads']); check(cooldown.results[0].state==='cooldown','Cooldown after success');
  const cron = await rpc("select public.reserve_dashboard_sync(1,'google_ads','cron',$1,$2) result",[range.range_start,new Date(Date.parse(range.range_end+'T12:00:00Z')-86400000).toISOString().slice(0,10)]);
  check(cron.state==='accepted','Cron uses same lock but does not inherit manual cooldown');
  const tracked=await rpc('select public.get_dashboard_sync_status($1,$2,$3) result',['maria-gasolina',viewer,[googleId]]);
  check(tracked.requested_runs[0].id===googleId&&tracked.requested_runs[0].status==='success','Original request remains trackable after newer cron run');
  check((await request(admin,['google_ads'])).results[0].state==='active','Manual cannot overlap cron');
  await rpc('select public.start_dashboard_sync_run($1) result',[cron.run_id]);
  await query("select public.finish_dashboard_sync_run($1,'indeterminate',null,'{}',null,'SYNC_OUTCOME_UNKNOWN')",[cron.run_id]);
  check((await request(admin,['google_ads'])).results[0].state==='active','Indeterminate remains excluded');
  const secondClient = await request(foreign,['google_ads'],sameKey,'other-client');
  check(secondClient.results[0].state==='accepted','Other client has independent lock');
  const idempotent = await request(foreign,['google_ads'],sameKey,'other-client');
  check(idempotent.results[0].state==='existing','Duplicate request key reuses original record');
  const multi = await Promise.all([request(admin,['ga4','meta_ads']),request(admin,['meta_ads','ga4'])]);
  check(multi.flatMap(r=>r.results).filter(r=>r.state==='accepted').length===2,'All-source requests avoid deadlock and duplicate dispatch');
  const metaId = multi.flatMap(r=>r.results).find(r=>r.source==='meta_ads').run_id;
  await pool.query("update public.dashboard_client_users set role='viewer' where user_id=$1",[admin]);
  check(await rpc('select public.start_dashboard_sync_run($1) result',[metaId])===null,'Revoked permission checked before execution');
  check((await pool.query('select status from public.dashboard_automation_runs where id=$1',[metaId])).rows[0].status==='failed','Revoked queued run recorded without API call');

  await pool.query("update public.dashboard_source_accounts set automation_enabled=false where client_id=2 and source='ga4'");
  const partlyAvailable=await request(foreign,['ga4','meta_ads'],randomUUID(),'other-client');
  check(partlyAvailable.results.find(r=>r.source==='ga4').state==='unavailable'&&partlyAvailable.results.find(r=>r.source==='meta_ads').state==='accepted','Unavailable source does not block another source');

  // Dispatch must roll back the reservation if internal configuration is unavailable.
  await pool.query("update public.dashboard_client_users set role='admin' where user_id=$1",[admin]);
  check((await request(admin,['meta_ads'])).results[0].state==='cooldown','Cooldown also applies after a failed run');
  await pool.query("update public.dashboard_automation_runs set status='failed',completed_at=now(),requested_at=now()-interval '10 minutes' where client_id=1 and source='meta_ads'");
  const before = +(await pool.query('select count(*) from public.dashboard_automation_runs')).rows[0].count;
  await pool.query("delete from vault.decrypted_secrets where name='dashboard_cron_secret_key'");
  await assert.rejects(request(admin,['meta_ads'])); assertions++;
  check(+(await pool.query('select count(*) from public.dashboard_automation_runs')).rows[0].count===before,'Failed dispatch creates no orphan reservation');
  const status = await rpc('select public.get_dashboard_sync_status($1,$2) result',['maria-gasolina',viewer]);
  check(status.sources.find(s=>s.source==='google_ads').last_success_at !== null,'Last success preserved after failure');
  check(JSON.stringify(status).includes('SYNTHETIC_ONLY')===false,'Status contains no transport credentials');

  // Execute the unmodified existing ingestion RPC twice and with corrected data.
  const ingest = (key,spend,conversions) => rpc('select public.upsert_dashboard_paid_media_batch($1,$2,$3,$4,$5,$6,$7,$8) result',[
    'maria-gasolina','google_ads',key,databaseToday,databaseToday,
    JSON.stringify([{account_id:'account-1',metric_date:databaseToday,spend,conversions}]),
    JSON.stringify([{account_id:'account-1',metric_date:databaseToday,campaign_id:'campaign-1',campaign_name:'FRANQUIA',spend,conversions}]),
    JSON.stringify([{account_id:'account-1',metric_date:databaseToday,campaign_id:'campaign-1',ad_id:'ad-1',spend,conversions}]),
  ]);
  check((await ingest('intraday-test-payload-hash-1',100,5)).status==='success','Existing ingestion succeeds');
  check((await ingest('intraday-test-payload-hash-1',100,5)).status==='already_processed','Identical payload idempotent');
  check((await ingest('intraday-test-payload-hash-2',125,6)).status==='success','Corrected payload updates existing natural key');
  for (const table of ['dashboard_daily_metrics','dashboard_campaign_daily','dashboard_ad_daily']) {
    const totals=(await pool.query(`select count(*) n,sum(spend) spend,sum(conversions) conversions from public.${table} where client_id=1 and source='google_ads'`)).rows[0];
    check(+totals.n===1 && +totals.spend===125 && +totals.conversions===6,`${table}: no duplicate investment, leads or entities`);
  }
  await pool.query("insert into public.dashboard_source_accounts values(1,'google_ads','older-account',true,true),(1,'google_ads','empty-account',true,true)");
  await pool.query("insert into public.dashboard_daily_metrics(client_id,source,account_id,metric_date) values(1,'google_ads','older-account','2026-09-27'),(2,'google_ads','account-2','2026-10-22')");
  const scoped = await rpc('select public.get_dashboard_sync_status($1,$2) result',['maria-gasolina',viewer]);
  const coverage=scoped.sources.find(source=>source.source==='google_ads');
  check(coverage.available_through==='2026-09-27','Coverage uses oldest known account, not the freshest or foreign client');
  check(coverage.missing_accounts===1,'Account with no rows remains explicitly unavailable');
  check(coverage.accounts.length===3 && coverage.accounts.every(account=>account.account_id!=='account-2'),'Source accounts are client-scoped');
  await denied("select public.reserve_dashboard_sync(1,'meta_ads','backfill','2026-09-28','2026-10-04',$1,$2)",[editor,randomUUID()]);
  await fs.mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
  await fs.writeFile(new URL('../artifacts/sync-database-result.json',import.meta.url),JSON.stringify({passed:true,assertions,postgres:(await pool.query('show server_version')).rows[0].server_version,transport:'mock pg_net',auth:'synthetic database identities; not real Supabase Auth'},null,2));
  console.log(JSON.stringify({passed:true,assertions,scope:'real PostgreSQL locks/concurrency/grants; synthetic HTTP/Auth'}));
} finally { await pool.end(); }
