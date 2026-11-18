import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { handleMetaBalance, type BalanceDependencies } from "../../supabase/functions/_shared/meta-balance-runner.ts";
import { readMetaAvailableFunds } from "../../supabase/functions/_shared/meta-balance.ts";
import { META_BALANCE_ACCOUNT_ID as account } from "../../supabase/functions/_shared/meta-balance-config.ts";

const container = process.env.META_BALANCE_LOCAL_CONTAINER;
describe.skipIf(!container)("SQL scheduler → actual shared handler → immutable financial table (isolated)", () => {
  it("pre-reserves, dispatches, claims once, stores real fixture cents and shares the manual flow", async () => {
    const inspect = spawnSync("docker", ["inspect", container!], { encoding: "utf8" });
    expect(inspect.status).toBe(0); const info = JSON.parse(inspect.stdout)[0];
    expect(info.HostConfig.NetworkMode).toBe("none"); expect(info.Config.Labels["codex.task"]).toBe("meta-balance-sql");
    const sql = (query: string) => {
      const r = spawnSync("docker", ["exec", "-i", container!, "psql", "-U", "postgres", "-X", "-Aqt", "-v", "ON_ERROR_STOP=1"],
        { input: query, encoding: "utf8", timeout: 20000 });
      expect(r.status, r.stderr).toBe(0); return r.stdout.trim();
    };
    expect(sql("select token from private.meta_balance_test_marker")).toBe("isolated-synthetic-meta-balance");
    expect(sql("select active from cron.job where jobname='retaguarda-meta-balance-hourly'")).toBe("f");
    expect(JSON.parse(sql("select private.dispatch_retaguarda_meta_balance()"))).toEqual({ state: "disabled" });
    const author = "00000000-0000-4000-8000-000000000001";
    sql(`insert into auth.users values('${author}'); insert into public.dashboard_clients values(1,'maria-gasolina','Synthetic only',true);
      insert into public.dashboard_client_users values(1,'${author}','editor');
      insert into public.dashboard_source_accounts values(1,'meta_ads','${account}','Synthetic only',true);
      insert into vault.secrets values('dashboard_project_url'),('dashboard_cron_secret_key');
      insert into vault.decrypted_secrets values('dashboard_project_url','https://hlqrpreqvvxtkruwsolg.supabase.co'),('dashboard_cron_secret_key','synthetic-no-real-key');
      update cron.job set active=true where jobname='retaguarda-meta-balance-hourly';`);
    const dispatched = JSON.parse(sql("select private.dispatch_retaguarda_meta_balance()"));
    expect(dispatched.state).toBe("dispatched");
    const body = JSON.parse(sql("select body from net.test_requests order by id desc limit 1"));
    expect(body.account_id).toBe(account); expect(body.client_slug).toBe("maria-gasolina");
    expect(sql("select count(*) from private.retaguarda_balance_runs where claimed_at is null and client_id=1")).toBe("1");
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ id: `act_${account}`, account_id: account, currency: "BRL", is_prepay_account: true,
      funding_source_details: { type: 20, display_string: "Saldo disponível (R$123,45 BRL)" } })));
    const literal = (value: unknown) => value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
    const deps: BalanceDependencies = { mode: "scheduled", enabled: true, accountId: account, clientSlug: "maria-gasolina",
      getUser: vi.fn().mockResolvedValue({ id: author }),
      rpc: async (name, args) => {
        if (!["reserve_retaguarda_meta_balance","claim_retaguarda_meta_balance","finish_retaguarda_meta_balance","get_retaguarda_meta_balance_context"].includes(name)) throw new Error("RPC not allowed in fixture");
        const data = JSON.parse(sql(`select public.${name}(${Object.entries(args).map(([key,value]) => `${key} => ${literal(value)}`).join(",")});`));
        return { data, error: null };
      }, collect: () => readMetaAvailableFunds({ accountId: account, token: "synthetic-only", version: "v26.0", fetcher }) };
    const request = (payload = body) => new Request("http://synthetic.invalid/balance", { method: "POST", headers: { Authorization: "Bearer synthetic-only" }, body: JSON.stringify(payload) });
    const first = await handleMetaBalance(request(), deps); expect(first.status).toBe(200); expect((await first.json()).state).toBe("success");
    await handleMetaBalance(request(), deps); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sql("select available_balance_brl from public.dashboard_retaguarda_financial_entries where client_id=1")).toBe("123.45");
    expect(sql("select created_by is null from public.dashboard_retaguarda_financial_entries where client_id=1")).toBe("t");
    expect(JSON.parse(sql("select private.dispatch_retaguarda_meta_balance()"))).toMatchObject({ state: "success", replayed: true });
    expect(sql("select count(*) from net.test_requests")).toBe("1");
    sql("update private.retaguarda_balance_runs set requested_at=requested_at-interval '6 minutes' where client_id=1");
    deps.mode = "manual";
    const manual = await handleMetaBalance(request({ ...body, request_key: randomUUID() }), deps);
    expect(manual.status).toBe(200); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sql("select count(*) from public.dashboard_retaguarda_financial_entries where client_id=1")).toBe("2");
    expect(sql("select count(*) from public.dashboard_retaguarda_financial_entries where client_id=1 and source_key like 'meta-stored-balance-pt-br-v2:%'")).toBe("2");
    expect(sql("select count(*) from public.dashboard_retaguarda_financial_entries where client_id=1 and previous_id is not null")).toBe("1");
    expect(sql(`select count(*) from public.dashboard_retaguarda_financial_entries where created_by='${author}'`)).toBe("1");
    sql(readFileSync("supabase/operations/retaguarda-meta-hourly-disable.sql", "utf8"));
    expect(sql("select active from cron.job where jobname='retaguarda-meta-balance-hourly'")).toBe("f");
    expect(sql("select active from cron.job where jobname='existing-synthetic-media-job'")).toBe("t");
    expect(JSON.parse(sql("select private.dispatch_retaguarda_meta_balance()"))).toEqual({ state: "disabled" });
    sql(readFileSync("supabase/operations/retaguarda-meta-hourly-enable.sql", "utf8"));
    expect(sql("select active from cron.job where jobname='retaguarda-meta-balance-hourly'")).toBe("t");
    // Admin/editor status is server-owned; the browser never provides a role.
    deps.enabled = false;
    const state = await handleMetaBalance(request({ action: "status", client_slug: "maria-gasolina" }), deps);
    expect(await state.json()).toMatchObject({ available: false, can_request: false });
    // A manual correction must prevent the hourly path from replacing its same-day leaf.
    sql(`set request.jwt.claim.sub='${author}';
      insert into public.dashboard_retaguarda_financial_entries(client_id,platform,account_id,reference_date,measured_at,available_balance_brl,previous_id,request_key)
      select 1,'meta_ads','${account}',reference_date,clock_timestamp(),100,id,'${randomUUID()}'
      from public.dashboard_retaguarda_financial_entries e where client_id=1
        and not exists(select 1 from public.dashboard_retaguarda_financial_entries n where n.previous_id=e.id);`);
    deps.enabled = true; deps.mode = "scheduled";
    sql("update private.retaguarda_balance_runs set requested_at=requested_at-interval '2 hours' where client_id=1");
    const conflict = await handleMetaBalance(request({ ...body, request_key: randomUUID() }), deps);
    expect(conflict.status).toBe(409); expect((await conflict.json()).state).toBe("conflict");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sql("select count(*) from public.dashboard_retaguarda_financial_entries where client_id=1")).toBe("3");
  }, 60000);
});
