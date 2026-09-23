import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import {
  getLastCompleteDaysRange,
  isSuccessfulSync,
  uniqueAutomatedClients,
} from "./scheduler.ts";

type AutomationTrigger = "cron" | "manual";
type SyncResponse = {
  ok?: boolean;
  counts?: Record<string, number>;
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
        "client_id, source, active, automation_enabled, dashboard_clients!inner(id, slug, name, active)",
      )
      .eq("source", "google_ads")
      .eq("active", true)
      .eq("automation_enabled", true)
      .eq("dashboard_clients.active", true)
      .order("client_id", { ascending: true });

    if (sourceError) {
      return Response.json(
        {
          ok: false,
          error: "Failed to list automated Google Ads clients.",
          details: sourceError.message,
        },
        { status: 500 },
      );
    }

    const clients = uniqueAutomatedClients(rows ?? []);
    const results: Array<Record<string, unknown>> = [];

    for (const client of clients) {
      const { data: run, error: runInsertError } = await ctx.supabaseAdmin
        .from("dashboard_automation_runs")
        .insert({
          client_id: client.id,
          source: "google_ads",
          trigger,
          range_start: range.startDate,
          range_end: range.endDate,
          status: "running",
        })
        .select("id")
        .single();

      if (runInsertError || !run) {
        results.push({
          client_slug: client.slug,
          ok: false,
          error: "Failed to create automation run.",
        });
        continue;
      }

      let httpStatus = 0;
      let syncBody: SyncResponse = {};
      let errorMessage: string | null = null;

      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        if (!supabaseUrl) throw new Error("SUPABASE_URL is not configured.");
        const syncResponse = await fetch(
          `${supabaseUrl}/functions/v1/sync-google-ads`,
          {
            method: "POST",
            redirect: "error",
            headers: {
              authorization,
              apikey: apiKey,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              client_slug: client.slug,
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
            `Google Ads sync returned HTTP ${syncResponse.status}.`;
        }
      } catch (error) {
        errorMessage = error instanceof Error
          ? error.message
          : "Google Ads sync request failed.";
      }

      const succeeded = errorMessage === null;
      const { error: runUpdateError } = await ctx.supabaseAdmin
        .from("dashboard_automation_runs")
        .update({
          status: succeeded ? "success" : "failed",
          http_status: httpStatus || null,
          counts: syncBody.counts ?? {},
          database_write_status: syncBody.database_write_status ?? null,
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);

      results.push({
        client_slug: client.slug,
        ok: succeeded && !runUpdateError,
        http_status: httpStatus || null,
        counts: syncBody.counts ?? {},
        database_write_status: syncBody.database_write_status ?? null,
        error: errorMessage ?? runUpdateError?.message ?? null,
      });
    }

    const failures = results.filter((result) => result.ok !== true).length;
    return Response.json(
      {
        ok: failures === 0,
        trigger,
        range: { ...range, time_zone: "America/Sao_Paulo" },
        automated_clients: clients.length,
        successes: results.length - failures,
        failures,
        results,
      },
      { status: failures === 0 ? 200 : 207 },
    );
  }),
};
