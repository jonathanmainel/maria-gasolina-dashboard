import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import {
  executeIsolatedTargets,
  getLastCompleteDaysRange,
  isSuccessfulSync,
  type DashboardSource,
  uniqueAutomatedTargets,
} from "./scheduler.ts";

type AutomationTrigger = "cron" | "manual";
type SyncResponse = {
  ok?: boolean;
  counts?: Record<string, number>;
  meta_insights?: {
    daily_count?: number;
    campaign_count?: number;
    ad_set_count?: number;
    ad_count?: number;
  };
  database_write_status?: string | null;
  error?: string;
};

function requestTrigger(body: unknown): AutomationTrigger {
  if (
    typeof body === "object" && body !== null && "trigger" in body &&
    body.trigger === "cron"
  ) return "cron";
  return "manual";
}

async function safeJson(response: Response): Promise<SyncResponse> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function syncCounts(source: DashboardSource, body: SyncResponse) {
  if (source === "google_ads" || source === "ga4") return body.counts ?? {};

  return {
    daily: body.meta_insights?.daily_count ?? 0,
    campaigns: body.meta_insights?.campaign_count ?? 0,
    ad_sets: body.meta_insights?.ad_set_count ?? 0,
    ads: body.meta_insights?.ad_count ?? 0,
  };
}

export default {
  fetch: withSupabase({ auth: "secret" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json(
        { ok: false, error: "Method not allowed. Use POST." },
        { status: 405 },
      );
    }

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      // An empty body is valid for a manual run.
    }

    const authorization = req.headers.get("authorization");
    const apiKey = req.headers.get("apikey");
    if (!authorization || !apiKey) {
      return Response.json(
        { ok: false, error: "Missing internal authentication headers." },
        { status: 401 },
      );
    }

    const trigger = requestTrigger(body);
    const range = getLastCompleteDaysRange(new Date(), 7);
    const { data: rows, error: sourceError } = await ctx.supabaseAdmin
      .from("dashboard_source_accounts")
      .select(
        "client_id, source, account_id, active, automation_enabled, dashboard_clients!inner(id, slug, name, active)",
      )
      .in("source", ["google_ads", "meta_ads", "ga4"])
      .eq("active", true)
      .eq("automation_enabled", true)
      .eq("dashboard_clients.active", true)
      .order("client_id", { ascending: true });

    if (sourceError) {
      return Response.json(
        {
          ok: false,
          error: "Failed to list automated dashboard sources.",
          details: sourceError.message,
        },
        { status: 500 },
      );
    }

    const targets = uniqueAutomatedTargets(rows ?? []);
    const isolatedResults = await executeIsolatedTargets(
      targets,
      async (target): Promise<Record<string, unknown>> => {
        const startedAt = Date.now();
        const { data: run, error: runInsertError } = await ctx.supabaseAdmin
          .from("dashboard_automation_runs")
          .insert({
            client_id: target.id,
            source: target.source,
            account_id: target.accountIds.length === 1
              ? target.accountIds[0]
              : null,
            trigger,
            range_start: range.startDate,
            range_end: range.endDate,
            status: "running",
          })
          .select("id")
          .single();

        if (runInsertError || !run) {
          throw new Error("Failed to create automation run.");
        }

        let httpStatus = 0;
        let syncBody: SyncResponse = {};
        let errorMessage: string | null = null;

        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL");
          if (!supabaseUrl) throw new Error("SUPABASE_URL is not configured.");
          const functionName = target.source === "google_ads"
            ? "sync-google-ads"
            : target.source === "meta_ads"
            ? "sync-meta-ads"
            : "sync-ga4";
          const syncResponse = await fetch(
            `${supabaseUrl}/functions/v1/${functionName}`,
            {
              method: "POST",
              redirect: "error",
              headers: {
                authorization,
                apikey: apiKey,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                client_slug: target.slug,
                start_date: range.startDate,
                end_date: range.endDate,
                dry_run: false,
              }),
            },
          );
          httpStatus = syncResponse.status;
          syncBody = await safeJson(syncResponse);
          if (!isSuccessfulSync(syncResponse.ok, syncBody.ok)) {
            errorMessage = syncBody.error ??
              `${target.source} sync returned HTTP ${syncResponse.status}.`;
          }
        } catch (error) {
          errorMessage = error instanceof Error
            ? error.message
            : `${target.source} sync request failed.`;
        }

        const succeeded = errorMessage === null;
        const counts = syncCounts(target.source, syncBody);
        const { error: runUpdateError } = await ctx.supabaseAdmin
          .from("dashboard_automation_runs")
          .update({
            status: succeeded ? "success" : "failed",
            http_status: httpStatus || null,
            counts,
            database_write_status: syncBody.database_write_status ?? null,
            error_message: errorMessage,
            duration_ms: Date.now() - startedAt,
            completed_at: new Date().toISOString(),
          })
          .eq("id", run.id);

        return {
          client_slug: target.slug,
          source: target.source,
          account_ids: target.accountIds,
          ok: succeeded && !runUpdateError,
          http_status: httpStatus || null,
          counts,
          database_write_status: syncBody.database_write_status ?? null,
          error: errorMessage ?? runUpdateError?.message ?? null,
        };
      },
    );

    const results: Array<Record<string, unknown>> = isolatedResults.map(
      (result) => result.ok
        ? result.value
        : {
          client_slug: result.target.slug,
          source: result.target.source,
          account_ids: result.target.accountIds,
          ok: false,
          error: result.error,
        },
    );

    const failures = results.filter((result) => result.ok !== true).length;
    return Response.json(
      {
        ok: failures === 0,
        trigger,
        range: { ...range, time_zone: "America/Sao_Paulo" },
        automated_clients: new Set(targets.map((target) => target.id)).size,
        automated_targets: targets.length,
        successes: results.length - failures,
        failures,
        results,
      },
      { status: failures === 0 ? 200 : 207 },
    );
  }),
};
