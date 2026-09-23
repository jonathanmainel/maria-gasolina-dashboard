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
import {
  createPayloadHash,
  exchangeGoogleOAuthToken,
  fetchGoogleAdsAccountData,
  type GoogleAdsCredentials,
  type GoogleAdsRawData,
  normalizeCustomerId,
  normalizeGoogleAdsData,
} from "./google-ads.ts";

const RESPONSE_PREVIEW_LIMIT = 25;

type WriteDomain =
  | "paid_media"
  | "ad_groups"
  | "keywords"
  | "pmax_asset_groups"
  | "pmax_assets";

type WriteResults = Record<WriteDomain, unknown>;

function emptyRawData(): GoogleAdsRawData {
  return {
    daily: [],
    campaigns: [],
    adGroups: [],
    ads: [],
    keywords: [],
    pmaxAssetGroups: [],
    pmaxAssets: [],
    pmaxAssetMetadata: [],
  };
}

function appendRawData(target: GoogleAdsRawData, source: GoogleAdsRawData) {
  for (const key of Object.keys(target) as Array<keyof GoogleAdsRawData>) {
    target[key].push(...source[key]);
  }
}

function getGoogleAdsCredentials():
  | { ok: true; value: GoogleAdsCredentials }
  | { ok: false; missing: string[]; invalid?: string } {
  const requiredEnv = {
    clientId: Deno.env.get("GOOGLE_ADS_CLIENT_ID"),
    clientSecret: Deno.env.get("GOOGLE_ADS_CLIENT_SECRET"),
    refreshToken: Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN"),
  };
  const missing = Object.entries(requiredEnv)
    .filter(([, value]) => !value)
    .map(([key]) => ({
      clientId: "GOOGLE_ADS_CLIENT_ID",
      clientSecret: "GOOGLE_ADS_CLIENT_SECRET",
      refreshToken: "GOOGLE_ADS_REFRESH_TOKEN",
    })[key as keyof typeof requiredEnv]);

  if (missing.length > 0) return { ok: false, missing };

  const apiVersion = Deno.env.get("GOOGLE_ADS_API_VERSION") ?? "v25";

  if (!/^v\d+$/.test(apiVersion)) {
    return {
      ok: false,
      missing: [],
      invalid: "GOOGLE_ADS_API_VERSION must use a major REST version such as v25.",
    };
  }

  return {
    ok: true,
    value: {
      developerToken: Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ??
        undefined,
      clientId: requiredEnv.clientId!,
      clientSecret: requiredEnv.clientSecret!,
      refreshToken: requiredEnv.refreshToken!,
      loginCustomerId: Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ??
        undefined,
      apiVersion,
    },
  };
}

function getResultStatus(result: unknown): string | null {
  if (typeof result !== "object" || result === null || !("status" in result)) {
    return null;
  }

  return String(result.status);
}

function noDataResult(rows = 0) {
  return { status: "no_data", rows };
}

async function idempotencyKey(
  namespace: string,
  clientSlug: string,
  startDate: string,
  endDate: string,
  payload: unknown,
) {
  const hash = await createPayloadHash(payload);
  return [
    "google_ads",
    namespace,
    clientSlug,
    startDate,
    endDate,
    hash,
  ].join(":");
}

function preview<T>(rows: T[]) {
  return {
    count: rows.length,
    rows: rows.slice(0, RESPONSE_PREVIEW_LIMIT),
    truncated: rows.length > RESPONSE_PREVIEW_LIMIT,
  };
}

export default {
  fetch: withSupabase(
    { auth: "secret" },
    async (req, ctx) => {
      if (req.method !== "POST") {
        return Response.json(
          { ok: false, error: "Method not allowed. Use POST." },
          { status: 405 },
        );
      }

      let body: IngestionRequest;

      try {
        body = await req.json();
      } catch {
        return Response.json(
          { ok: false, error: "Invalid JSON body." },
          { status: 400 },
        );
      }

      const validation = validateIngestionRequest(body);

      if (!validation.ok) {
        return Response.json(
          { ok: false, error: validation.error },
          { status: validation.status },
        );
      }

      const {
        clientSlug: client_slug,
        startDate: start_date,
        endDate: end_date,
        dryRun: dry_run,
      } = validation.value;

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

      const { data: sourceAccounts, error: sourceAccountsError } =
        await listSourceAccounts(ctx.supabaseAdmin, {
          clientId: dashboardClient.id,
          source: "google_ads",
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
            error:
              "No active Google Ads account configured for this dashboard client.",
            client_slug,
            google_ads_api_called: false,
            database_write_performed: false,
          },
          { status: 404 },
        );
      }

      const credentialsResult = getGoogleAdsCredentials();

      if (!credentialsResult.ok) {
        return Response.json(
          {
            ok: false,
            error: credentialsResult.invalid ??
              "Google Ads credentials are not fully configured.",
            missing_configuration: credentialsResult.missing,
            google_ads_api_called: false,
            database_write_performed: false,
          },
          { status: 500 },
        );
      }

      const credentials = credentialsResult.value;
      let accessToken: string;

      try {
        accessToken = await exchangeGoogleOAuthToken(credentials);
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error: "Failed to authenticate with Google Ads.",
            details: error instanceof Error ? error.message : String(error),
            google_ads_api_called: false,
            database_write_performed: false,
          },
          { status: 502 },
        );
      }

      const raw = emptyRawData();

      try {
        for (const sourceAccount of sourceAccounts) {
          const accountData = await fetchGoogleAdsAccountData(
            credentials,
            accessToken,
            sourceAccount.account_id,
            start_date,
            end_date,
          );
          appendRawData(raw, accountData);
        }
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error: "Failed to query Google Ads data.",
            details: error instanceof Error ? error.message : String(error),
            google_ads_api_called: true,
            database_write_performed: false,
          },
          { status: 502 },
        );
      }

      const normalized = normalizeGoogleAdsData(raw);
      let databaseWritePerformed = false;
      let databaseWriteStatus: string | null = null;
      let databaseWriteResult: WriteResults | null = null;

      if (!dry_run) {
        const results: WriteResults = {
          paid_media: noDataResult(),
          ad_groups: noDataResult(),
          keywords: noDataResult(),
          pmax_asset_groups: noDataResult(),
          pmax_assets: noDataResult(),
        };

        const paidMediaHasData = normalized.daily.length > 0 ||
          normalized.campaigns.length > 0 || normalized.ads.length > 0;
        const paidMediaKey = paidMediaHasData
          ? await idempotencyKey(
            "paid_media_v1",
            client_slug,
            start_date,
            end_date,
            {
              daily: normalized.daily,
              campaigns: normalized.campaigns,
              ads: normalized.ads,
            },
          )
          : null;
        const adGroupsKey = normalized.adGroups.length > 0
          ? await idempotencyKey(
            "ad_groups_v1",
            client_slug,
            start_date,
            end_date,
            normalized.adGroups,
          )
          : null;
        const keywordsKey = normalized.keywords.length > 0
          ? await idempotencyKey(
            "keywords_v1",
            client_slug,
            start_date,
            end_date,
            normalized.keywords,
          )
          : null;
        const pmaxAssetGroupsKey = normalized.pmaxAssetGroups.length > 0
          ? await idempotencyKey(
            "pmax_asset_groups_v1",
            client_slug,
            start_date,
            end_date,
            normalized.pmaxAssetGroups,
          )
          : null;
        const pmaxAssetsKey = normalized.pmaxAssets.length > 0
          ? await idempotencyKey(
            "pmax_assets_v1",
            client_slug,
            start_date,
            end_date,
            normalized.pmaxAssets,
          )
          : null;

        const writes: Array<{
          domain: WriteDomain;
          rpc: string;
          args: unknown;
          enabled: boolean;
        }> = [
          {
            domain: "paid_media",
            rpc: "upsert_dashboard_paid_media_batch",
            enabled: paidMediaHasData,
            args: {
              p_client_slug: client_slug,
              p_source: "google_ads",
              p_idempotency_key: paidMediaKey,
              p_range_start: start_date,
              p_range_end: end_date,
              p_daily_metrics: normalized.daily,
              p_campaign_daily: normalized.campaigns,
              p_ad_daily: normalized.ads,
            },
          },
          {
            domain: "ad_groups",
            rpc: "upsert_dashboard_paid_media_group_batch",
            enabled: normalized.adGroups.length > 0,
            args: {
              p_client_slug: client_slug,
              p_source: "google_ads",
              p_group_kind: "ad_group",
              p_idempotency_key: adGroupsKey,
              p_range_start: start_date,
              p_range_end: end_date,
              p_group_daily: normalized.adGroups,
            },
          },
          {
            domain: "keywords",
            rpc: "upsert_dashboard_keyword_batch",
            enabled: normalized.keywords.length > 0,
            args: {
              p_client_slug: client_slug,
              p_idempotency_key: keywordsKey,
              p_range_start: start_date,
              p_range_end: end_date,
              p_keyword_daily: normalized.keywords,
            },
          },
          {
            domain: "pmax_asset_groups",
            rpc: "ingest_dashboard_pmax_rows",
            enabled: normalized.pmaxAssetGroups.length > 0,
            args: normalized.pmaxAssetGroups.map((row) => ({
              client_slug,
              source: "google_ads",
              record_kind: "pmax_asset_group",
              idempotency_key: pmaxAssetGroupsKey,
              range_start: start_date,
              range_end: end_date,
              ...row,
            })),
          },
          {
            domain: "pmax_assets",
            rpc: "ingest_dashboard_pmax_rows",
            enabled: normalized.pmaxAssets.length > 0,
            args: normalized.pmaxAssets.map((row) => ({
              client_slug,
              source: "google_ads",
              record_kind: "pmax_asset",
              idempotency_key: pmaxAssetsKey,
              range_start: start_date,
              range_end: end_date,
              ...row,
            })),
          },
        ];

        for (const write of writes) {
          if (!write.enabled) continue;

          const { data, error } = await ctx.supabaseAdmin.rpc(
            write.rpc,
            write.args as never,
          );

          if (error) {
            const statuses = Object.values(results).map(getResultStatus);
            const priorWriteSucceeded = statuses.includes("success");

            return Response.json(
              {
                ok: false,
                mode: "write",
                google_ads_api_called: true,
                database_write_performed: priorWriteSucceeded,
                database_write_status: priorWriteSucceeded
                  ? "partial_success"
                  : null,
                database_write_result: results,
                failed_domain: write.domain,
                error: `Failed to write Google Ads ${write.domain} data.`,
                details: error.message,
              },
              { status: 500 },
            );
          }

          results[write.domain] = data;
        }

        const statuses = Object.values(results).map(getResultStatus);
        databaseWritePerformed = statuses.includes("success");
        databaseWriteStatus = databaseWritePerformed
          ? "success"
          : statuses.some((status) => status === "already_processed")
          ? "already_processed"
          : "no_data";
        databaseWriteResult = results;
      }

      const normalizedAccountIds = sourceAccounts.map((sourceAccount) =>
        normalizeCustomerId(sourceAccount.account_id)
      );

      return Response.json({
        ok: true,
        mode: dry_run ? "dry_run" : "write",
        request: { client_slug, start_date, end_date, dry_run },
        dashboard_client: {
          id: dashboardClient.id,
          slug: dashboardClient.slug,
          name: dashboardClient.name,
        },
        google_ads_configuration: {
          api_version: credentials.apiVersion,
          account_id: normalizedAccountIds.length === 1
            ? normalizedAccountIds[0]
            : null,
          account_ids: normalizedAccountIds,
          login_customer_id_configured: Boolean(credentials.loginCustomerId),
          developer_token_configured: Boolean(credentials.developerToken),
          oauth_configured: true,
        },
        google_ads_api_called: true,
        counts: {
          daily: normalized.daily.length,
          campaigns: normalized.campaigns.length,
          ad_groups: normalized.adGroups.length,
          ads: normalized.ads.length,
          keywords: normalized.keywords.length,
          pmax_asset_groups: normalized.pmaxAssetGroups.length,
          pmax_assets: normalized.pmaxAssets.length,
        },
        normalized_preview: {
          row_limit: RESPONSE_PREVIEW_LIMIT,
          daily: preview(normalized.daily),
          campaigns: preview(normalized.campaigns),
          ad_groups: preview(normalized.adGroups),
          ads: preview(normalized.ads),
          keywords: preview(normalized.keywords),
          pmax_asset_groups: preview(normalized.pmaxAssetGroups),
          pmax_assets: preview(normalized.pmaxAssets),
        },
        database_write_performed: databaseWritePerformed,
        database_write_status: databaseWriteStatus,
        database_write_result: databaseWriteResult,
        limitations: {
          reach_and_link_clicks:
            "Kept null because Google Ads does not provide equivalent fields in these reports.",
          pmax_asset_performance_label:
            "Kept null because Google Ads API v25 rejected asset_group_asset.performance_label in the tested reporting queries; primary status remains available in extra_metrics.",
          pmax_asset_metadata:
            "Fetched separately from daily metrics and joined by account, asset group, and asset resource name.",
        },
      });
    },
  ),
};
