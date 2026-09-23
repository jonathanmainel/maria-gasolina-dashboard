import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import {
  listSourceAccounts,
  resolveDashboardClient,
} from "../_shared/dashboard.ts";
import {
  type IngestionRequest,
  validateIngestionRequest,
} from "../_shared/ingestion.ts";

type MetaAction = {
  action_type: string;
  value: string;
};

type MetaInsightLevel = "account" | "campaign" | "adset" | "ad";

type MetaInsight = {
  account_id?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
  date_stop?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  spend?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  frequency?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
};

type MetaInsightsResponse = {
  data?: MetaInsight[];
  paging?: {
    next?: string;
  };
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

const META_COMMON_INSIGHT_FIELDS = [
  "account_id",
  "date_start",
  "date_stop",
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "spend",
  "cpc",
  "cpm",
  "ctr",
  "frequency",
  "actions",
  "action_values",
];

const RESPONSE_PREVIEW_LIMIT = 25;

const META_LEVEL_FIELDS: Record<MetaInsightLevel, string[]> = {
  account: [],
  campaign: ["campaign_id", "campaign_name"],
  adset: [
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
  ],
  ad: [
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "ad_id",
    "ad_name",
  ],
};

async function fetchMetaInsights(
  apiVersion: string,
  accessToken: string,
  accountId: string,
  startDate: string,
  endDate: string,
  level: MetaInsightLevel,
): Promise<MetaInsight[]> {
  const results: MetaInsight[] = [];

  const url = new URL(
    `https://graph.facebook.com/${apiVersion}/act_${accountId}/insights`,
  );

  url.searchParams.set("level", level);

  url.searchParams.set(
    "time_range",
    JSON.stringify({
      since: startDate,
      until: endDate,
    }),
  );

  url.searchParams.set("time_increment", "1");

  url.searchParams.set(
    "fields",
    [...META_COMMON_INSIGHT_FIELDS, ...META_LEVEL_FIELDS[level]].join(","),
  );

  url.searchParams.set("limit", "100");

  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const payload = (await response.json()) as MetaInsightsResponse;

    if (!response.ok || payload.error) {
      throw new Error(
        payload.error?.message ??
          `Meta ${level} insights request failed with HTTP ${response.status}`,
      );
    }

    results.push(...(payload.data ?? []));

    nextUrl = payload.paging?.next ?? null;
  }

  return results;
}

function getActionValue(
  actions: MetaAction[] | undefined,
  actionType: string,
): number {
  const action = actions?.find(
    (item) => item.action_type === actionType,
  );

  return action ? Number(action.value) || 0 : 0;
}

function buildMetaExtraMetrics(row: MetaInsight) {
  const impressions = Number(row.impressions ?? 0);
  const linkClicks = Number(row.inline_link_clicks ?? 0);

  return {
    cpc: Number(row.cpc ?? 0),
    cpm: Number(row.cpm ?? 0),
    ctr: Number(row.ctr ?? 0),
    link_ctr: impressions > 0 ? (linkClicks / impressions) * 100 : 0,
    frequency: Number(row.frequency ?? 0),
    actions: row.actions ?? [],
    action_values: row.action_values ?? [],
  };
}

function normalizeMetaCampaignInsight(row: MetaInsight) {
  return {
    source: "meta_ads",

    account_id: row.account_id ?? null,
    campaign_id: row.campaign_id ?? null,
    campaign_name: row.campaign_name ?? null,
    campaign_status: null,

    metric_date: row.date_start ?? null,

    impressions: Number(row.impressions ?? 0),
    reach: Number(row.reach ?? 0),
    clicks: Number(row.clicks ?? 0),
    link_clicks: Number(row.inline_link_clicks ?? 0),

    conversions: getActionValue(
      row.actions,
      "lead",
    ),

    all_conversions: null,

    spend: Number(row.spend ?? 0),
    conversion_value: 0,

    source_updated_at: null,

    extra_metrics: buildMetaExtraMetrics(row),
  };
}

function normalizeMetaDailyInsight(row: MetaInsight) {
  return {
    account_id: row.account_id ?? null,
    metric_date: row.date_start ?? null,

    impressions: Number(row.impressions ?? 0),
    reach: Number(row.reach ?? 0),
    clicks: Number(row.clicks ?? 0),
    link_clicks: Number(row.inline_link_clicks ?? 0),

    conversions: getActionValue(
      row.actions,
      "lead",
    ),

    all_conversions: null,

    spend: Number(row.spend ?? 0),
    conversion_value: 0,

    extra_metrics: {},
    source_updated_at: null,
  };
}

function normalizeMetaAdSetInsight(row: MetaInsight) {
  return {
    account_id: row.account_id ?? null,
    campaign_id: row.campaign_id ?? null,
    campaign_name: row.campaign_name ?? null,
    group_id: row.adset_id ?? null,
    group_name: row.adset_name ?? null,
    group_status: null,
    metric_date: row.date_start ?? null,
    impressions: Number(row.impressions ?? 0),
    reach: Number(row.reach ?? 0),
    clicks: Number(row.clicks ?? 0),
    link_clicks: Number(row.inline_link_clicks ?? 0),
    conversions: getActionValue(row.actions, "lead"),
    all_conversions: null,
    spend: Number(row.spend ?? 0),
    conversion_value: 0,
    extra_metrics: buildMetaExtraMetrics(row),
    source_updated_at: null,
  };
}

function normalizeMetaAdInsight(row: MetaInsight) {
  return {
    account_id: row.account_id ?? null,
    campaign_id: row.campaign_id ?? null,
    campaign_name: row.campaign_name ?? null,
    adset_id: row.adset_id ?? null,
    adset_name: row.adset_name ?? null,
    ad_id: row.ad_id ?? null,
    ad_name: row.ad_name ?? null,
    ad_status: null,
    metric_date: row.date_start ?? null,
    impressions: Number(row.impressions ?? 0),
    reach: Number(row.reach ?? 0),
    clicks: Number(row.clicks ?? 0),
    link_clicks: Number(row.inline_link_clicks ?? 0),
    conversions: getActionValue(row.actions, "lead"),
    all_conversions: null,
    spend: Number(row.spend ?? 0),
    conversion_value: 0,
    extra_metrics: buildMetaExtraMetrics(row),
    source_updated_at: null,
  };
}

function sortRows<T>(rows: T[], getKey: (row: T) => string): T[] {
  return rows.sort((left, right) => getKey(left).localeCompare(getKey(right)));
}

async function createPayloadHash(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    encoded,
  );

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getDatabaseWriteStatus(result: unknown): string | null {
  if (
    typeof result !== "object" ||
    result === null ||
    !("status" in result)
  ) {
    return null;
  }

  return String(result.status);
}

export default {
  fetch: withSupabase(
    { auth: "secret" },
    async (req, ctx) => {
      if (req.method !== "POST") {
        return Response.json(
          {
            ok: false,
            error: "Method not allowed. Use POST.",
          },
          { status: 405 },
        );
      }

      let body: IngestionRequest;

      try {
        body = await req.json();
      } catch {
        return Response.json(
          {
            ok: false,
            error: "Invalid JSON body.",
          },
          { status: 400 },
        );
      }

      const validation = validateIngestionRequest(body);

      if (!validation.ok) {
        return Response.json(
          {
            ok: false,
            error: validation.error,
          },
          { status: validation.status },
        );
      }

      const {
        clientSlug: client_slug,
        startDate: start_date,
        endDate: end_date,
        dryRun: dry_run,
      } = validation.value;

      const metaAccessToken = Deno.env.get("META_ACCESS_TOKEN");
      const metaApiVersion = Deno.env.get("META_API_VERSION");

      if (!metaAccessToken) {
        return Response.json(
          {
            ok: false,
            error: "META_ACCESS_TOKEN is not configured.",
          },
          { status: 500 },
        );
      }

      if (!metaApiVersion) {
        return Response.json(
          {
            ok: false,
            error: "META_API_VERSION is not configured.",
          },
          { status: 500 },
        );
      }

      const { data: dashboardClient, error: dashboardClientError } =
        await resolveDashboardClient(ctx.supabaseAdmin, client_slug);

      if (dashboardClientError) {
        return Response.json(
          {
            ok: false,
            error: "Failed to resolve dashboard client.",
            details: dashboardClientError.message,
          },
          { status: 500 },
        );
      }

      if (!dashboardClient) {
        return Response.json(
          {
            ok: false,
            error: `Active dashboard client not found for slug: ${client_slug}`,
          },
          { status: 404 },
        );
      }

      try {
        const { data: sourceAccounts, error: sourceAccountsError } =
          await listSourceAccounts(ctx.supabaseAdmin, {
            clientId: dashboardClient.id,
            source: "meta_ads",
          });

        if (sourceAccountsError) {
          return Response.json(
            {
              ok: false,
              error: "Failed to list dashboard source accounts.",
              details: sourceAccountsError.message,
            },
            { status: 500 },
          );
        }

        if (!sourceAccounts || sourceAccounts.length === 0) {
          return Response.json(
            {
              ok: false,
              error: "No active Meta Ads account configured for this dashboard client.",
              client_slug,
              meta_api_called: false,
              database_write_performed: false,
            },
            { status: 404 },
          );
        }

        const dailyInsights: MetaInsight[] = [];
        const campaignInsights: MetaInsight[] = [];
        const adSetInsights: MetaInsight[] = [];
        const adInsights: MetaInsight[] = [];

        for (const sourceAccount of sourceAccounts) {
          const [
            accountDailyInsights,
            accountCampaignInsights,
            accountAdSetInsights,
            accountAdInsights,
          ] =
            await Promise.all([
              fetchMetaInsights(
                metaApiVersion,
                metaAccessToken,
                sourceAccount.account_id,
                start_date,
                end_date,
                "account",
              ),
              fetchMetaInsights(
                metaApiVersion,
                metaAccessToken,
                sourceAccount.account_id,
                start_date,
                end_date,
                "campaign",
              ),
              fetchMetaInsights(
                metaApiVersion,
                metaAccessToken,
                sourceAccount.account_id,
                start_date,
                end_date,
                "adset",
              ),
              fetchMetaInsights(
                metaApiVersion,
                metaAccessToken,
                sourceAccount.account_id,
                start_date,
                end_date,
                "ad",
              ),
            ]);

          dailyInsights.push(...accountDailyInsights);
          campaignInsights.push(...accountCampaignInsights);
          adSetInsights.push(...accountAdSetInsights);
          adInsights.push(...accountAdInsights);
        }

        const normalizedDailyRows = sortRows(
          dailyInsights.map(normalizeMetaDailyInsight),
          (row) => `${row.account_id ?? ""}|${row.metric_date ?? ""}`,
        );

        const normalizedCampaignRows = sortRows(
          campaignInsights.map(normalizeMetaCampaignInsight),
          (row) =>
            `${row.account_id ?? ""}|${row.campaign_id ?? ""}|${row.metric_date ?? ""}`,
        );

        const normalizedAdSetRows = sortRows(
          adSetInsights.map(normalizeMetaAdSetInsight),
          (row) =>
            `${row.account_id ?? ""}|${row.group_id ?? ""}|${row.metric_date ?? ""}`,
        );

        const normalizedAdRows = sortRows(
          adInsights.map(normalizeMetaAdInsight),
          (row) =>
            `${row.account_id ?? ""}|${row.ad_id ?? ""}|${row.metric_date ?? ""}`,
        );

        let databaseWritePerformed = false;
        let databaseWriteResult: {
          paid_media: unknown;
          ad_sets: unknown;
        } | null = null;
        let databaseWriteStatus: string | null = null;

        if (!dry_run) {
          const paidMediaPayloadHash = await createPayloadHash({
            daily: normalizedDailyRows,
            campaigns: normalizedCampaignRows,
            ads: normalizedAdRows,
          });

          const paidMediaIdempotencyKey = [
            "meta_ads",
            "paid_media_v1",
            client_slug,
            start_date,
            end_date,
            paidMediaPayloadHash,
          ].join(":");

          const adSetPayloadHash = await createPayloadHash({
            ad_sets: normalizedAdSetRows,
          });

          const adSetIdempotencyKey = [
            "meta_ads",
            "ad_sets_v1",
            client_slug,
            start_date,
            end_date,
            adSetPayloadHash,
          ].join(":");

          const { data: paidMediaWriteResult, error: paidMediaWriteError } =
            await ctx.supabaseAdmin.rpc(
              "upsert_dashboard_paid_media_batch",
              {
                p_client_slug: client_slug,
                p_source: "meta_ads",
                p_idempotency_key: paidMediaIdempotencyKey,
                p_range_start: start_date,
                p_range_end: end_date,
                p_daily_metrics: normalizedDailyRows,
                p_campaign_daily: normalizedCampaignRows,
                p_ad_daily: normalizedAdRows,
              },
            );

          if (paidMediaWriteError) {
            return Response.json(
              {
                ok: false,
                mode: "write",
                meta_api_called: true,
                database_write_performed: false,
                database_write_status: null,
                database_write_result: {
                  paid_media: null,
                  ad_sets: null,
                },
                error: "Failed to write Meta Ads paid media data.",
                details: paidMediaWriteError.message,
              },
              { status: 500 },
            );
          }

          const paidMediaWriteStatus = getDatabaseWriteStatus(
            paidMediaWriteResult,
          );

          const { data: adSetWriteResult, error: adSetWriteError } =
            await ctx.supabaseAdmin.rpc(
              "upsert_dashboard_paid_media_group_batch",
              {
                p_client_slug: client_slug,
                p_source: "meta_ads",
                p_group_kind: "ad_set",
                p_idempotency_key: adSetIdempotencyKey,
                p_range_start: start_date,
                p_range_end: end_date,
                p_group_daily: normalizedAdSetRows,
              },
            );

          if (adSetWriteError) {
            const paidMediaWritePerformed = paidMediaWriteStatus === "success";

            return Response.json(
              {
                ok: false,
                mode: "write",
                meta_api_called: true,
                database_write_performed: paidMediaWritePerformed,
                database_write_status: paidMediaWritePerformed
                  ? "partial_success"
                  : paidMediaWriteStatus,
                database_write_result: {
                  paid_media: paidMediaWriteResult,
                  ad_sets: null,
                },
                error: "Failed to write Meta Ads ad set data.",
                details: adSetWriteError.message,
              },
              { status: 500 },
            );
          }

          const adSetWriteStatus = getDatabaseWriteStatus(adSetWriteResult);

          databaseWritePerformed =
            paidMediaWriteStatus === "success" ||
            adSetWriteStatus === "success";

          databaseWriteStatus =
            paidMediaWriteStatus === "already_processed" &&
              adSetWriteStatus === "already_processed"
              ? "already_processed"
              : databaseWritePerformed
              ? "success"
              : null;

          databaseWriteResult = {
            paid_media: paidMediaWriteResult,
            ad_sets: adSetWriteResult,
          };
        }

        return Response.json({
          ok: true,
          mode: dry_run ? "dry_run" : "write",

          request: {
            client_slug,
            start_date,
            end_date,
            dry_run,
          },

          dashboard_client: {
            id: dashboardClient.id,
            slug: dashboardClient.slug,
            name: dashboardClient.name,
          },

          meta_configuration: {
            api_version: metaApiVersion,
            account_id:
              sourceAccounts.length === 1
                ? sourceAccounts[0].account_id
                : null,

            account_ids: sourceAccounts.map(
              (sourceAccount) => sourceAccount.account_id,
            ),
            token_configured: true,
          },

          meta_api_called: true,

          campaign_insights: {
            count: campaignInsights.length,
            rows: campaignInsights.slice(0, RESPONSE_PREVIEW_LIMIT),
            truncated: campaignInsights.length > RESPONSE_PREVIEW_LIMIT,
          },

          meta_insights: {
            daily_count: dailyInsights.length,
            campaign_count: campaignInsights.length,
            ad_set_count: adSetInsights.length,
            ad_count: adInsights.length,
          },

          normalized_preview: {
            row_limit: RESPONSE_PREVIEW_LIMIT,
            daily_count: normalizedDailyRows.length,
            daily_rows: normalizedDailyRows.slice(0, RESPONSE_PREVIEW_LIMIT),
            daily_truncated:
              normalizedDailyRows.length > RESPONSE_PREVIEW_LIMIT,
            campaign_count: normalizedCampaignRows.length,
            campaign_rows: normalizedCampaignRows.slice(
              0,
              RESPONSE_PREVIEW_LIMIT,
            ),
            campaign_truncated:
              normalizedCampaignRows.length > RESPONSE_PREVIEW_LIMIT,
            ad_set_count: normalizedAdSetRows.length,
            ad_set_rows: normalizedAdSetRows.slice(0, RESPONSE_PREVIEW_LIMIT),
            ad_set_truncated:
              normalizedAdSetRows.length > RESPONSE_PREVIEW_LIMIT,
            ad_count: normalizedAdRows.length,
            ad_rows: normalizedAdRows.slice(0, RESPONSE_PREVIEW_LIMIT),
            ad_truncated: normalizedAdRows.length > RESPONSE_PREVIEW_LIMIT,
          },

          database_write_performed: databaseWritePerformed,
          database_write_status: databaseWriteStatus,
          database_write_result: databaseWriteResult,

          message: dry_run
            ? "Meta Ads daily, campaign, ad set, and ad insights fetched successfully. No database write was performed."
            : databaseWriteStatus === "already_processed"
              ? "Meta Ads payload was already processed. No database write was performed."
              : "Meta Ads daily, campaign, ad set, and ad data written successfully.",
        });
      } catch (error) {
        return Response.json(
          {
            ok: false,
            mode: dry_run ? "dry_run" : "write",
            meta_api_called: true,
            database_write_performed: false,
            error:
              error instanceof Error
                ? error.message
                : "Unknown Meta API error.",
          },
          { status: 502 },
        );
      }
    },
  ),
};
