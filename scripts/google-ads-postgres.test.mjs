// Integration test for the existing ingestion RPCs. Never connects to Supabase.
// Uses synthetic data and an empty, dedicated local PostgreSQL database only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const target = new URL(process.env.GOOGLE_ADS_TEST_DATABASE_URL ?? '');
if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '55437' || target.pathname !== '/google_ads_recovery_test') {
  throw new Error('Only the dedicated local disposable PostgreSQL database is permitted.');
}
const { default: pg } = await import(pathToFileURL(process.env.GOOGLE_ADS_TEST_PG_MODULE).href);
const db = new pg.Client({ connectionString: target.toString() });
await db.connect();
let assertions = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
const migration = async (name) => fs.readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
try {
  check(+(await db.query("select count(*) from information_schema.tables where table_schema='public'")).rows[0].count, 0);
  await db.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema private; create function private.is_dashboard_client_member(bigint) returns boolean language sql as $$select false$$;
    create table public.dashboard_clients(id bigint primary key,slug text unique,name text,active boolean);
    insert into public.dashboard_clients values(1,'synthetic-client','Synthetic',true),(2,'other-client','Synthetic other',true);`);
  const schema = await migration('20260909024415_create_dashboard_ingestion_schema.sql');
  for (const table of ['dashboard_daily_metrics', 'dashboard_campaign_daily', 'dashboard_sync_runs']) {
    const start = schema.indexOf(`create table if not exists public.${table} (`);
    assert.ok(start >= 0);
    await db.query(schema.slice(start, schema.indexOf('\n);', start) + 4));
  }
  for (const file of [
    '20260909045422_paid_media_first_version.sql', '20260909050744_paid_media_groups.sql',
    '20260909061515_google_ads_performance_max.sql', '20260909185220_add_dashboard_google_keywords.sql',
    '20260923135624_fix_google_ads_keyword_natural_key.sql',
  ]) await db.query(await migration(file));
  // Optionally use the definitions read from production, kept in ignored artifacts.
  // This contains function definitions, never credentials or business records.
  if (process.env.GOOGLE_ADS_TEST_RPC_DEFINITIONS) {
    const definitions = JSON.parse(await fs.readFile(process.env.GOOGLE_ADS_TEST_RPC_DEFINITIONS, 'utf8'));
    assert.equal(definitions.length, 4);
    for (const { definition } of definitions) await db.query(definition);
  }
  await db.query("insert into dashboard_daily_metrics(client_id,source,account_id,metric_date,spend) values (1,'google_ads','1234567890','2026-09-27',99),(2,'google_ads','9999999999','2026-10-01',77),(1,'meta_ads','meta-synthetic','2026-10-01',55)");
  const base = { account_id: '1234567890', metric_date: '2026-10-01', campaign_id: '10', impressions: 100, clicks: 7, spend: 1.234567, conversions: 2.5, all_conversions: 3, conversion_value: 12 };
  const args = (key) => ['synthetic-client', key, '2026-10-01', '2026-10-01'];
  const cases = [
    { tables: ['dashboard_daily_metrics','dashboard_campaign_daily','dashboard_ad_daily'],
      run: (key, spend) => db.query('select public.upsert_dashboard_paid_media_batch($1,$2,$3,$4,$5,$6,$7,$8) result', ['synthetic-client','google_ads',key,'2026-10-01','2026-10-01', JSON.stringify([{ ...base, spend }]), JSON.stringify([{ ...base, spend }]), JSON.stringify([{ ...base, spend, ad_id:'30',adset_id:'20' }])]) },
    { tables: ['dashboard_ad_group_daily'],
      run: (key, spend) => db.query('select public.upsert_dashboard_paid_media_group_batch($1,$2,$3,$4,$5,$6,$7) result', ['synthetic-client','google_ads','ad_group',key,'2026-10-01','2026-10-01', JSON.stringify([{ ...base,spend,group_id:'20' }])]) },
    { tables: ['dashboard_keyword_daily'],
      run: (key, spend) => db.query('select public.upsert_dashboard_keyword_batch($1,$2,$3,$4,$5) result', [...args(key), JSON.stringify([{ ...base,spend,ad_group_id:'20',keyword_id:'40' }])]) },
    ...['pmax_asset_group','pmax_asset'].map((kind) => ({ tables: [kind === 'pmax_asset' ? 'dashboard_pmax_asset_daily' : 'dashboard_pmax_asset_group_daily'],
      run: (key, spend) => db.query('select public.ingest_dashboard_pmax_rows($1) result', [JSON.stringify([{ ...base,spend,client_slug:'synthetic-client',source:'google_ads',record_kind:kind,idempotency_key:key,range_start:'2026-10-01',range_end:'2026-10-01',asset_group_id:'50',asset_id:'60',field_type:'HEADLINE' }])]) })),
  ];
  for (const [index, item] of cases.entries()) {
    const key = `synthetic-domain-${index}-payload-v1`;
    check((await item.run(key,1.234567)).rows[0].result.status,'success');
    check((await item.run(key,1.234567)).rows[0].result.status,'already_processed');
    check((await item.run(key+'-changed',2.5)).rows[0].result.status,'success');
    for (const table of item.tables) {
      const row = (await db.query(`select count(*) as rows,sum(spend) as spend,sum(conversions) as conversions from public.${table} where client_id=1 and source='google_ads' and metric_date='2026-10-01'`)).rows[0];
      check(+row.rows,1); check(+row.spend,2.5); check(+row.conversions,2.5);
    }
  }
  // Keyword IDs are unique within ad group, not globally within an account.
  const keywords = [{...base,ad_group_id:'21',keyword_id:'40'}, {...base,ad_group_id:'22',keyword_id:'40'}];
  await db.query('select public.upsert_dashboard_keyword_batch($1,$2,$3,$4,$5)', [...args('synthetic-keyword-groups'),JSON.stringify(keywords)]);
  check(+(await db.query("select count(*) from public.dashboard_keyword_daily where keyword_id='40'")).rows[0].count,3);
  check(+(await db.query("select spend from public.dashboard_daily_metrics where client_id=1 and source='google_ads' and metric_date='2026-09-27'")).rows[0].spend,99);
  check(+(await db.query("select spend from public.dashboard_daily_metrics where client_id=2")).rows[0].spend,77);
  check(+(await db.query("select spend from public.dashboard_daily_metrics where source='meta_ads'")).rows[0].spend,55);
  const before = (await db.query('select count(*) from public.dashboard_daily_metrics')).rows[0].count;
  await assert.rejects(db.query('select public.upsert_dashboard_paid_media_batch($1,$2,$3,$4,$5,$6,$7,$8)', ['synthetic-client','google_ads','synthetic-invalid-range','2026-10-01','2026-10-01',JSON.stringify([{ ...base,metric_date:'2026-10-02' }]),'[]','[]'])); assertions++;
  check((await db.query('select count(*) from public.dashboard_daily_metrics')).rows[0].count,before);
  console.log(JSON.stringify({ status:'passed',assertions,domains:7,synthetic:true,production_writes:0 }));
} finally { await db.end(); }
