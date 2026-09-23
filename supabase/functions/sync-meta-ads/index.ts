import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

type SyncMetaAdsRequest = {
  client_slug?: string;
  start_date?: string;
  end_date?: string;
  dry_run?: boolean;
};

type MetaAdAccount = {
  id: string;
  account_id?: string;
  name?: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
};

type MetaAction = {
  action_type: string;
  value: string;
};

type MetaCampaignInsight = {
  account_id?: string;
  campaign_id?: string;
  campaign_name?: string;
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

type MetaCampaignInsightsResponse = {
  data?: MetaCampaignInsight[];
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

type MetaAdAccountsResponse = {
  data?: MetaAdAccount[];
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

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

async function fetchMetaAdAccounts(
  apiVersion: string,
  accessToken: string,
): Promise<MetaAdAccount[]> {
  const url = new URL(
    `https://graph.facebook.com/${apiVersion}/me/adaccounts`,
  );

  url.searchParams.set(
    "fields",
    "id,account_id,name,account_status,currency,timezone_name",
  );

  url.searchParams.set("limit", "100");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = (await response.json()) as MetaAdAccountsResponse;

  if (!response.ok || payload.error) {
    throw new Error(
      payload.error?.message ??
        `Meta API request failed with HTTP ${response.status}`,
    );
  }

  return payload.data ?? [];
}

async function fetchMetaCampaignInsights(
  apiVersion: string,
  accessToken: string,
  accountId: string,
  startDate: string,
  endDate: string,
): Promise<MetaCampaignInsight[]> {
  const results: MetaCampaignInsight[] = [];

  const url = new URL(
    `https://graph.facebook.com/${apiVersion}/act_${accountId}/insights`,
  );

  url.searchParams.set("level", "campaign");

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
    [
      "account_id",
      "campaign_id",
      "campaign_name",
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
    ].join(","),
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

    const payload =
      (await response.json()) as MetaCampaignInsightsResponse;

    if (!response.ok || payload.error) {
      throw new Error(
        payload.error?.message ??
          `Meta Insights API request failed with HTTP ${response.status}`,
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

function normalizeMetaCampaignInsight(
  row: MetaCampaignInsight,
) {
  const impressions = Number(row.impressions ?? 0);
  const linkClicks = Number(row.inline_link_clicks ?? 0);

  const linkCtr =
    impressions > 0
      ? (linkClicks / impressions) * 100
      : 0;

  return {
    source: "meta_ads",

    account_id: row.account_id ?? null,
    campaign_id: row.campaign_id ?? null,
    campaign_name: row.campaign_name ?? null,
    campaign_status: null,

    metric_date: row.date_start ?? null,

    impressions,
    reach: Number(row.reach ?? 0),
    clicks: Number(row.clicks ?? 0),
    link_clicks: linkClicks,

    conversions: getActionValue(
      row.actions,
      "lead",
    ),

    all_conversions: null,

    spend: Number(row.spend ?? 0),
    conversion_value: 0,

    source_updated_at: null,

    extra_metrics: {
      cpc: Number(row.cpc ?? 0),
      cpm: Number(row.cpm ?? 0),
      ctr: Number(row.ctr ?? 0),
      link_ctr: linkCtr,
      frequency: Number(row.frequency ?? 0),

      actions: row.actions ?? [],
      action_values: row.action_values ?? [],
    },
  };
}

export default {
  fetch: withSupabase(
    { auth: ["publishable", "secret"] },
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

      let body: SyncMetaAdsRequest;

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

      const {
        client_slug,
        start_date,
        end_date,
        dry_run,
      } = body;

      if (!client_slug) {
        return Response.json(
          {
            ok: false,
            error: "client_slug is required.",
          },
          { status: 400 },
        );
      }

      if (!start_date || !isValidDate(start_date)) {
        return Response.json(
          {
            ok: false,
            error: "start_date must be a valid YYYY-MM-DD date.",
          },
          { status: 400 },
        );
      }

      if (!end_date || !isValidDate(end_date)) {
        return Response.json(
          {
            ok: false,
            error: "end_date must be a valid YYYY-MM-DD date.",
          },
          { status: 400 },
        );
      }

      if (start_date > end_date) {
        return Response.json(
          {
            ok: false,
            error: "start_date cannot be after end_date.",
          },
          { status: 400 },
        );
      }

      if (dry_run !== true) {
        return Response.json(
          {
            ok: false,
            error:
              "For now, dry_run must be true. Database writes are disabled.",
          },
          { status: 400 },
        );
      }

      const metaAdAccountId = Deno.env.get("META_AD_ACCOUNT_ID");
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

      const { data: client, error: clientError } =
        await ctx.supabaseAdmin
          .from("dashboard_clients")
          .select("id, slug, name")
          .eq("slug", client_slug)
          .eq("active", true)
          .maybeSingle();

      if (clientError) {
        return Response.json(
          {
            ok: false,
            error: "Failed to resolve dashboard client.",
            details: clientError.message,
          },
          { status: 500 },
        );
      }

      if (!client) {
        return Response.json(
          {
            ok: false,
            error: `Active dashboard client not found for slug: ${client_slug}`,
          },
          { status: 404 },
        );
      }

      try {
        if (!metaAdAccountId) {
          return Response.json(
            {
              ok: false,
              error: "META_AD_ACCOUNT_ID is not configured.",
            },
            { status: 500 },
          );
        }

        const insights = await fetchMetaCampaignInsights(
          metaApiVersion,
          metaAccessToken,
          metaAdAccountId,
          start_date,
          end_date,
        );

        const normalizedRows = insights.map(
          normalizeMetaCampaignInsight,
        );

        return Response.json({
          ok: true,
          mode: "dry_run",

          request: {
            client_slug,
            start_date,
            end_date,
            dry_run,
          },

          dashboard_client: {
            id: client.id,
            slug: client.slug,
            name: client.name,
          },

          meta_configuration: {
            api_version: metaApiVersion,
            account_id: metaAdAccountId,
            token_configured: true,
          },

          meta_api_called: true,

          campaign_insights: {
            count: insights.length,
            rows: insights,
          },

          normalized_preview: {
            count: normalizedRows.length,
            rows: normalizedRows,
          },

          database_write_performed: false,

          message:
            "Meta Ads campaign insights fetched successfully. No database write was performed.",
        });
      } catch (error) {
        return Response.json(
          {
            ok: false,
            mode: "dry_run",
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
