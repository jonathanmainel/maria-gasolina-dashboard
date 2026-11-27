// Use a disposable PostgreSQL container with synthetic Auth and pg_net.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const container = `dashboard-intraday-sql-${process.pid}`;
const cmd = (args, input) => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 90_000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
};
const args = ["exec", "-i", container, "psql", "-U", "postgres", "-X", "-Aqt", "-v", "ON_ERROR_STOP=1"];
const sql = (text) => cmd(args, text);
const file = (path) => sql(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const concurrent = (query) => new Promise((resolve, reject) => {
  const child = spawn("docker", args);
  let out = "", err = "";
  child.stdout.on("data", data => out += data);
  child.stderr.on("data", data => err += data);
  child.on("error", reject);
  child.on("close", code => code === 0 ? resolve(JSON.parse(out.trim())) : reject(new Error(err)));
  child.stdin.end(query);
});
const viewer = "10000000-0000-4000-8000-000000000001";
const editor = "10000000-0000-4000-8000-000000000002";
const foreign = "10000000-0000-4000-8000-000000000003";
const service = "set role service_role; set timezone='Pacific/Auckland';";
const check = (user) => `select public.request_dashboard_intraday_sync('maria-gasolina','${user}');`;
const today = "(now() at time zone 'America/Sao_Paulo')::date";
let started = false;
try {
  cmd(["run", "-d", "--name", container, "--network", "none", "--tmpfs", "/var/lib/postgresql/data",
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17"]);
  started = true;
  assert.equal(cmd(["inspect", "-f", "{{.HostConfig.NetworkMode}}", container]), "none");
  let ready = false;
  for (let i = 0; i < 60; i++) {
    ready = spawnSync("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], { stdio: "ignore" }).status === 0;
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, "isolated postgres is ready");

  file("tests/homolog/dashboard-intraday.local-baseline.sql");
  for (const migration of [
    "20260909024415_create_dashboard_ingestion_schema",
    "20260909025150_harden_dashboard_membership_helper",
    "20260909045422_paid_media_first_version",
    "20260909050744_paid_media_groups",
    "20260909061515_google_ads_performance_max",
    "20260909073420_dashboard_read_api",
    "20260909121751_dashboard_read_api_invoker",
    "20260909185220_add_dashboard_google_keywords",
    "20260913193355_add_ga4_lead_generation_detail_contracts",
    "20260913193524_extend_dashboard_overview_for_ga4_leads",
    "20260913193539_fix_ga4_overview_function_identifiers",
    "20260913202343_use_form_submit_as_primary_ga4_conversion",
    "20260923024640_add_dashboard_source_accounts",
    "20260923135624_fix_google_ads_keyword_natural_key",
    "20260923141017_add_dashboard_sync_automation",
    "20260923172702_finalize_meta_ads_automation",
    "20260924135445_meta_creative_previews",
    "20260925021426_ga4_native_pipeline",
    "20261027200303_dashboard_manual_sync",
    "20261028181122_meta_preview_reservation_protocol",
    "20261103110504_allow_editor_manual_sync",
    "20261127200016_dashboard_intraday_sync_mtd",
  ]) file(`supabase/migrations/${migration}.sql`);

  // These are the Supabase defaults for the service role on application tables.
  sql(`grant all on all tables in schema public to service_role;
    alter table public.dashboard_client_users drop constraint dashboard_client_users_role_check;
    alter table public.dashboard_client_users add constraint dashboard_client_users_role_check check (role in ('viewer','editor','admin'));
    insert into auth.users values ('${viewer}'),('${editor}'),('${foreign}');
    insert into public.dashboard_clients(slug,name,timezone) values ('foreign','Foreign','America/Sao_Paulo');
    insert into public.dashboard_client_users(client_id,user_id,role)
      select id,'${viewer}'::uuid,'viewer' from public.dashboard_clients where slug='maria-gasolina' union all
      select id,'${editor}'::uuid,'editor' from public.dashboard_clients where slug='maria-gasolina' union all
      select id,'${foreign}'::uuid,'viewer' from public.dashboard_clients where slug='foreign';
    delete from public.dashboard_source_accounts;
    insert into public.dashboard_source_accounts(client_id,source,account_id,automation_enabled)
      select c.id,s.source,s.account_id,true from public.dashboard_clients c
      cross join (values ('ga4','101'),('google_ads','102'),('meta_ads','103')) s(source,account_id);
  `);
  assert.equal(sql(`select private.dashboard_intraday_cron_window('2026-11-27T03:54:59Z'),
    private.dashboard_intraday_cron_window('2026-11-27T03:55:00Z'),
    private.dashboard_intraday_cron_window('2026-11-27T04:00:00Z'),
    private.dashboard_intraday_cron_window('2026-11-27T04:05:00Z');`), "f|t|t|f");
  // Make the rest of the scenarios independent of the wall-clock time in CI.
  sql("create or replace function private.dashboard_intraday_cron_window(p_now timestamptz) returns boolean language sql as 'select false';");
  assert.throws(() => sql(`set role authenticated;${check(viewer)}`), /permission denied/);
  assert.throws(() => sql(service + check(foreign)), /SYNC_FORBIDDEN/);
  assert.throws(() => sql(`${service}select public.request_dashboard_sync('maria-gasolina','${viewer}',array['ga4'],gen_random_uuid());`), /SYNC_FORBIDDEN/);
  assert.equal(sql(`select has_function_privilege('anon','public.save_dashboard_intraday_metrics(uuid,jsonb)','EXECUTE');`), "f");

  const clients = "(select id from public.dashboard_clients where slug='maria-gasolina')";
  sql(`insert into public.dashboard_automation_runs(client_id,source,trigger,range_start,range_end,status,requested_by,period_mode,completed_at,database_write_status)
    values (${clients},'meta_ads','manual',${today}-7,${today},'success','${editor}','including_today',now()-interval '10 minutes','success'),
           (${clients},'google_ads','manual',${today}-7,${today},'success','${editor}','including_today',now()-interval '45 minutes','success'),
           (${clients},'google_ads','cron',${today}-7,${today}-1,'success',null,'complete_days',now()-interval '1 minute','success');`);
  const requests = await Promise.all(Array.from({ length: 8 }, (_, i) => concurrent(service + check(i % 2 ? viewer : editor))));
  const ids = requests.flatMap(({ results }) => results.filter(row => row.state === "accepted"));
  assert.deepEqual(ids.map(row => row.source).sort(), ["ga4", "google_ads"]);
  assert.ok(requests.every(({ range_start, range_end, results }) =>
    range_start === range_end && results.find(row => row.source === "meta_ads").state === "fresh"));
  assert.equal(sql("select count(*) from net.dispatches;"), "1");
  const google = ids.find(row => row.source === "google_ads").run_id;
  const ga4 = ids.find(row => row.source === "ga4").run_id;
  const day = requests[0].range_end;
  const reservation = `'${google}',${clients},'google_ads','${day}','${day}'`;
  assert.equal(sql(`${service}select public.reserve_dashboard_sync(${clients},'google_ads','cron',${today}-7,${today}-1)->>'state';`), "active");
  assert.equal(sql(`${service}select public.request_dashboard_sync('maria-gasolina','${editor}',array['google_ads'],gen_random_uuid())->'results'->0->>'state';`), "active");
  assert.equal(sql(`${service}select public.start_dashboard_sync_run('${google}')->>'trigger';`), "intraday");
  assert.equal(sql(`${service}select public.begin_dashboard_sync_collection(${reservation});`), "f");
  assert.equal(sql(`${service}select public.begin_dashboard_sync_collection(${reservation},true);`), "t");
  assert.equal(sql(`${service}select public.begin_dashboard_sync_collection(${reservation},true);`), "f");

  const batches = (spend, conversions) => ({
    paid_media: [[{ account_id: "102", metric_date: day, spend, conversions }], [], []],
  });
  const save = (run, payload) => `${service}select public.save_dashboard_intraday_metrics('${run}','${JSON.stringify(payload)}');`;
  sql(`select public.upsert_dashboard_paid_media_batch('maria-gasolina','google_ads','synthetic-initial-1','${day}','${day}',
    '${JSON.stringify(batches(100, 1.25).paid_media[0])}');`);
  assert.throws(() => sql(save(google, { ...batches(500, 5), pmax_asset: [{ metric_date: "1900-01-01" }] })), /date|invalid/i);
  assert.equal(sql("select spend,conversions from public.dashboard_daily_metrics where source='google_ads';"), "100.000000|1.250000");
  assert.equal(sql(save(google, batches(125, 1.75))), "success");
  assert.equal(sql(save(google, batches(999, 9))), "success");
  sql(`${service}select public.finish_dashboard_sync_run('${google}','indeterminate',null,'{}',null,'SYNC_OUTCOME_UNKNOWN');
    select public.start_dashboard_sync_run('${ga4}');
    select public.finish_dashboard_sync_run('${ga4}','failed',502,'{}',null,'PLATFORM_SYNC_FAILED');`);
  assert.equal(sql("select spend,conversions from public.dashboard_daily_metrics where source='google_ads';"), "125.000000|1.750000");

  const status = JSON.parse(sql(service + check(viewer))).results;
  assert.equal(status.find(row => row.source === "google_ads").state, "fresh");
  assert.equal(status.find(row => row.source === "ga4").state, "backoff");
  assert.equal(sql(`${service}select public.request_dashboard_sync('maria-gasolina','${editor}',array['ga4'],gen_random_uuid())->'results'->0->>'state';`), "accepted");
  assert.equal(sql(`${service}select public.request_dashboard_sync('maria-gasolina','${editor}',array['meta_ads'],gen_random_uuid())->'results'->0->>'state';`), "cooldown");
  assert.equal(sql(`${service}select public.reserve_dashboard_sync(${clients},'google_ads','cron',${today}-7,${today}-1)->>'state';`), "accepted");
  assert.equal(sql("select min(range_end-range_start),max(range_end-range_start) from public.dashboard_automation_runs where trigger='intraday';"), "0|0");

  const missed = sql(`insert into public.dashboard_automation_runs(client_id,source,trigger,range_start,range_end,status,requested_by,period_mode,requested_at)
    select id,'meta_ads','intraday',${today},${today},'queued','${foreign}','today_only',now()-interval '6 minutes'
    from public.dashboard_clients where slug='foreign' returning id;`);
  assert.equal(sql(`${service}select public.reserve_dashboard_sync(
    (select id from public.dashboard_clients where slug='foreign'),'meta_ads','cron',${today}-7,${today}-1)->>'state';`), "accepted");
  assert.equal(sql(`select error_code from public.dashboard_automation_runs where id='${missed}';`), "DISPATCH_EXPIRED");

  const asViewer = `set role authenticated; select set_config('request.jwt.claim.sub','${viewer}',false);`;
  sql(`insert into public.dashboard_daily_metrics(client_id,source,account_id,metric_date,sessions,engaged_sessions)
    values (${clients},'ga4','101','2028-03-31',200,100),(${clients},'ga4','101','2028-02-01',10,2),
    (${clients},'ga4','101','2028-02-02',90,45),(${clients},'ga4','101','2028-01-31',5000,5000);`);
  const overview = JSON.parse(sql(`${asViewer}select public.get_dashboard_overview('maria-gasolina','2028-03-01','2028-03-31','2028-02-01','2028-02-29');`).split("\n").at(-1));
  assert.deepEqual(overview.comparison_period, { start: "2028-02-01", end: "2028-02-29", days: 29 });
  assert.equal(overview.analytics.current.sessions, 200);
  assert.equal(overview.analytics.previous.sessions, 100);
  assert.equal(overview.analytics.previous.engagement_rate, 47);
  assert.equal(sql(`${asViewer}select public.get_dashboard_overview('maria-gasolina','2028-03-01','2028-03-31')->'comparison_period'->>'days';`).split("\n").at(-1), "31");
  console.log("PostgreSQL 17: atomic D0 reservations, per-source expiry and backoff, permissions, preserved history, rollback on failed batches, manual/cron and GA4 comparison passed.");
} finally {
  if (started) cmd(["rm", "-f", container]);
}
