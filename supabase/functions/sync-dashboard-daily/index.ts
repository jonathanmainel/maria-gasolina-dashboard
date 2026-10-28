import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { executeIsolatedTargets, getLastCompleteDaysRange, uniqueAutomatedTargets } from "./scheduler.ts";
import { UUID } from "../_shared/sync-control.ts";
import { runReservedSync } from "./runner.ts";

export default {
  fetch: withSupabase({ auth: "secret" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ ok: false, error_code: "METHOD_NOT_ALLOWED" }, { status: 405 });
    let body: { trigger?: unknown; run_ids?: unknown };
    try { body = await req.json(); } catch { return Response.json({ ok: false, error_code: "INVALID_REQUEST" }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ ok: false }, { status: 400 });
    const authorization = req.headers.get("authorization");
    const apikey = req.headers.get("apikey");
    const url = Deno.env.get("SUPABASE_URL");
    if (!authorization || !apikey || !url) return Response.json({ ok: false, error_code: "INTERNAL_CONFIGURATION_ERROR" }, { status: 500 });
    const headers = { authorization, apikey, "content-type": "application/json" };
    const ids: string[] = [];
    const blocked: unknown[] = [];
    if (Array.isArray(body.run_ids) && body.run_ids.length >= 1 && body.run_ids.length <= 3 && body.run_ids.every((id) => typeof id === "string" && UUID.test(id))) {
      ids.push(...new Set(body.run_ids as string[]));
    } else if (body.trigger === "cron" && body.run_ids === undefined) {
      const { data, error } = await ctx.supabaseAdmin.from("dashboard_source_accounts")
        .select("client_id, source, account_id, active, automation_enabled, dashboard_clients!inner(id, slug, name, active)")
        .in("source", ["google_ads", "meta_ads", "ga4"]).eq("active", true).eq("automation_enabled", true)
        .eq("dashboard_clients.active", true).order("client_id", { ascending: true });
      if (error) return Response.json({ ok: false, error_code: "SOURCES_UNAVAILABLE" }, { status: 503 });
      const range = getLastCompleteDaysRange(new Date(), 7);
      // Same atomic reservation used by manual requests. No check-then-insert race.
      for (const target of uniqueAutomatedTargets(data ?? [])) {
        const { data: reserved, error: reserveError } = await ctx.supabaseAdmin.rpc("reserve_dashboard_sync", {
          p_client_id: target.id, p_source: target.source, p_trigger: "cron", p_start: range.startDate, p_end: range.endDate,
        });
        if (reserveError) blocked.push({ source: target.source, state: "reservation_failed" });
        else if (reserved.state === "accepted") ids.push(reserved.run_id);
        else blocked.push(reserved);
      }
    } else return Response.json({ ok: false, error_code: "INVALID_REQUEST" }, { status: 400 });
    const admin = { rpc: (name: string, args: Record<string, unknown>) => ctx.supabaseAdmin.rpc(name, args).abortSignal(AbortSignal.timeout(10000)) };
    const results = await executeIsolatedTargets(ids, (id) => runReservedSync(id, admin, url, headers));
    const safeResults = results.map((result) => result.ok ? result.value : { run_id: result.target, ok: false, state: "verification_required" });
    const ok = blocked.length === 0 && safeResults.every((result) => result.ok);
    return Response.json({ ok, results: safeResults, blocked }, { status: ok ? 200 : 207 });
  }),
};
