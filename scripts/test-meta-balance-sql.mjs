// Disposable PostgreSQL only: no URL, production key or remote connection accepted.
import { spawnSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const container = `retaguarda-meta-sql-${process.pid}`;
const run = (...args) => {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 60000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
};
const sql = text => {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-X", "-Aqt", "-v", "ON_ERROR_STOP=1"],
    { input: text, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
};
let created = false;
try {
  run("run", "-d", "--name", container, "--label", "codex.task=meta-balance-sql", "--network", "none", "--tmpfs", "/var/lib/postgresql/data",
    "--tmpfs", "/tmp", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17.6");
  created = true;
  const info = JSON.parse(run("inspect", container))[0];
  assert.equal(info.HostConfig.NetworkMode, "none"); assert.equal(info.HostConfig.PortBindings && Object.keys(info.HostConfig.PortBindings).length, 0);
  for (let i = 0; i < 40; i++) {
    if (spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], { stdio: "ignore" }).status === 0) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  for (const file of ["tests/homolog/meta-balance.local-baseline.sql", "supabase/migrations/20261117045349_retaguarda_financial_entries.sql",
    "supabase/migrations/20261117150000_allow_retaguarda_balance_without_manual_estimate.sql",
    "supabase/migrations/20261118150949_retaguarda_meta_balance_collection.sql",
    "supabase/migrations/20261118183030_complete_retaguarda_meta_automation.sql", "tests/homolog/meta-balance.local.sql"]) {
    sql(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
  }
  console.log("PostgreSQL 17: schema, grants, roles, manual history, replay, cooldown, conflicts, precision and isolation passed.");
  sql(`insert into public.dashboard_clients values(50,'concurrency','Synthetic concurrency',true);
    insert into public.dashboard_source_accounts values(50,'meta_ads','5050','Synthetic',true);`);
  const concurrent = text => new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-X", "-Aqt", "-v", "ON_ERROR_STOP=1"]);
    let out = "", err = ""; child.stdout.on("data", data => out += data); child.stderr.on("data", data => err += data);
    child.on("error", reject); child.on("exit", code => code === 0 ? resolve(out.trim()) : reject(new Error(err)));
    child.stdin.end(text);
  });
  const reserve = () => `begin; select public.reserve_retaguarda_meta_balance('concurrency','5050','${randomUUID()}','scheduled',null)->>'state'; select pg_sleep(0.2); commit;`;
  const states = await Promise.all([concurrent(reserve()), concurrent(reserve())]);
  assert.deepEqual(states.map(x => x.split(/\s+/)[0]).sort(), ["accepted", "running"]);
  const runId = sql("select id from private.retaguarda_balance_runs where client_id=50;");
  const claims = await Promise.all([concurrent(`select public.claim_retaguarda_meta_balance('${runId}')->>'state';`),
    concurrent(`select public.claim_retaguarda_meta_balance('${runId}')->>'state';`)]);
  assert.deepEqual(claims.sort(), ["accepted", "running"]);
  const results = await Promise.all([concurrent(`select public.finish_retaguarda_meta_balance('${runId}',10.01,clock_timestamp(),null)->>'entry_id';`),
    concurrent(`select public.finish_retaguarda_meta_balance('${runId}',10.01,clock_timestamp(),null)->>'entry_id';`)]);
  assert.equal(results[0], results[1]);
  assert.equal(sql("select count(*) from public.dashboard_retaguarda_financial_entries where client_id=50;"), "1");
  console.log("Concurrent PostgreSQL sessions: one reservation and one claim; concurrent finalization produced exactly one immutable entry.");
  // Run the real shared TS handler against this database, using only a synthetic
  // Graph response and the captured SQL dispatcher request. No external network.
  const flow = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "supabase/functions/sync-vitest.config.ts", "--configLoader", "runner", "tests/homolog/meta-balance-flow.test.ts"],
    { encoding: "utf8", timeout: 120000, env: { ...process.env, META_BALANCE_LOCAL_CONTAINER: container } });
  assert.equal(flow.status, 0, flow.stdout + flow.stderr);
  console.log(flow.stdout);
} finally {
  if (created) {
    assert.equal(run("inspect", "--format", '{{index .Config.Labels "codex.task"}}', container), "meta-balance-sql");
    run("rm", "-f", container);
  }
}
