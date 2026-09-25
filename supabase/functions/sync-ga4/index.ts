import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { listSourceAccounts, resolveDashboardClient } from "../_shared/dashboard.ts";
import { type IngestionRequest, validateIngestionRequest } from "../_shared/ingestion.ts";
import { getGa4AccessToken } from "./ga4-auth.ts";
import { fetchGa4Dataset, fetchGa4FormAudit, sha256, type Ga4Datasets } from "./ga4.ts";

const DATASETS = ["daily", "acquisition", "events", "landing_pages"] as const;

function responseStatus(value: unknown): string {
  if (typeof value !== "object" || value === null) return "unknown";
  if ("status" in value && typeof value.status === "string") return value.status;
  if ("idempotent" in value && value.idempotent === true) return "already_processed";
  if ("success" in value && value.success === true) return "success";
  return "unknown";
}

function preview(rows: Array<Record<string, unknown>>) {
  return { count: rows.length, rows: rows.slice(0, 5), truncated: rows.length > 5 };
}

export default {
  fetch: withSupabase({ auth: "secret" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ ok: false, error: "Method not allowed. Use POST." }, { status: 405 });
    }
    let body: IngestionRequest & { audit_forms?: boolean };
    try { body = await req.json(); } catch {
      return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
    }
    const validation = validateIngestionRequest(body);
    if (!validation.ok) {
      return Response.json({ ok: false, error: validation.error }, { status: validation.status });
    }
    const { clientSlug, startDate, endDate, dryRun } = validation.value;
    const days = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000 + 1;
    if (days > 31) {
      return Response.json({ ok: false, error: "GA4 range cannot exceed 31 days per request." }, { status: 400 });
    }

    const { data: client, error: clientError } = await resolveDashboardClient(ctx.supabaseAdmin, clientSlug);
    if (clientError || !client) {
      return Response.json({ ok: false, error: "Active dashboard client not found." }, { status: clientError ? 500 : 404 });
    }
    const { data: accounts, error: accountError } = await listSourceAccounts(ctx.supabaseAdmin, {
      clientId: client.id, source: "ga4",
    });
    if (accountError || !accounts || accounts.length !== 1) {
      return Response.json({
        ok: false, error: accountError ? "Failed to list GA4 source accounts." : "Exactly one active GA4 source account is required.",
        ga4_api_called: false, database_write_performed: false,
      }, { status: accountError ? 500 : 409 });
    }
    const propertyId = accounts[0].account_id;

    let datasets: Ga4Datasets;
    let timeZone: string | null = null;
    try {
      const token = await getGa4AccessToken(Deno.env.get("GA4_SERVICE_ACCOUNT_JSON"));
      const results = await Promise.all(DATASETS.map((dataset) =>
        fetchGa4Dataset(token, propertyId, dataset, startDate, endDate)
      ));
      datasets = {
        daily: results[0].rows,
        acquisition: results[1].rows,
        events: results[2].rows,
        landing_pages: results[3].rows,
      };
      timeZone = results[0].timeZone;
      if (timeZone !== "America/Sao_Paulo") {
        throw new Error("GA4 property time zone does not match dashboard time zone.");
      }
    } catch (error) {
      return Response.json({
        ok: false, error: error instanceof Error ? error.message : "GA4 fetch failed.",
        property_id: propertyId, ga4_api_called: true, database_write_performed: false,
      }, { status: 502 });
    }

    const counts = Object.fromEntries(DATASETS.map((name) => [name, datasets[name].length]));
    const base = {
      client_slug: clientSlug, property_id: propertyId,
      range: { start_date: startDate, end_date: endDate, time_zone: timeZone },
      counts, ga4_api_called: true,
      primary_conversion_event: null,
      conversion_semantics: "keyEvents are official GA4 key events; form events require separate business validation.",
    };
    if (dryRun) {
      let formAudit: Awaited<ReturnType<typeof fetchGa4FormAudit>> | null = null;
      if (body.audit_forms === true) {
        try {
          const token = await getGa4AccessToken(Deno.env.get("GA4_SERVICE_ACCOUNT_JSON"));
          formAudit = await fetchGa4FormAudit(token, propertyId, startDate, endDate);
        } catch (error) {
          return Response.json({ ok: false, error: error instanceof Error ? error.message : "GA4 form audit failed.", ...base, database_write_performed: false }, { status: 502 });
        }
      }
      return Response.json({
        ok: true, dry_run: true, ...base, database_write_performed: false,
        previews: Object.fromEntries(DATASETS.map((name) => [name, preview(datasets[name])])),
        form_audit: formAudit,
      });
    }

    const databaseWriteResult: Record<string, unknown> = {};
    let writes = 0;
    let failures = 0;
    for (const dataset of DATASETS) {
      const rows = datasets[dataset];
      if (rows.length === 0 && (dataset === "acquisition" || dataset === "events")) {
        databaseWriteResult[dataset] = { status: "no_data", rows: 0 };
        continue;
      }
      const key = `ga4:${dataset}_v1:${clientSlug}:${startDate}:${endDate}:${await sha256(rows)}`;
      const name = dataset === "daily" ? "upsert_dashboard_batch"
        : dataset === "acquisition" ? "upsert_dashboard_ga4_acquisition_batch"
        : dataset === "events" ? "upsert_dashboard_ga4_event_batch"
        : "upsert_dashboard_ga4_landing_page_batch";
      const args = dataset === "daily"
        ? {
          p_client_slug: clientSlug, p_source: "ga4", p_idempotency_key: key,
          p_range_start: startDate, p_range_end: endDate, p_daily_metrics: rows,
          p_campaign_daily: [], p_crm_funnel_daily: [],
        }
        : {
          p_client_slug: clientSlug, p_account_id: propertyId,
          p_idempotency_key: key, p_range_start: startDate, p_range_end: endDate,
          p_rows: rows,
        };
      const { data, error } = await ctx.supabaseAdmin.rpc(name, args);
      if (error) {
        failures++;
        databaseWriteResult[dataset] = { status: "failed", error: error.message };
      } else {
        const status = responseStatus(data);
        if (status === "success") writes++;
        if (status === "unknown") failures++;
        databaseWriteResult[dataset] = { status, result: data };
      }
    }
    const statuses = Object.values(databaseWriteResult).map((value) =>
      typeof value === "object" && value !== null && "status" in value ? value.status : "unknown"
    );
    const databaseWriteStatus = failures > 0 ? "partial_success"
      : statuses.every((status) => status === "already_processed" || status === "no_data")
      ? "already_processed" : "success";
    return Response.json({
      ok: failures === 0, dry_run: false, ...base,
      database_write_performed: writes > 0,
      database_write_status: databaseWriteStatus,
      database_write_result: databaseWriteResult,
    }, { status: failures > 0 ? 207 : 200 });
  }),
};
