export type GoogleAdsMetrics = {
  impressions?: string;
  clicks?: string;
  conversions?: number | string;
  allConversions?: number | string;
  costMicros?: string;
  conversionsValue?: number | string;
};

export type GoogleAdsRow = {
  customer?: { id?: string };
  segments?: { date?: string };
  metrics?: GoogleAdsMetrics;
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
    advertisingChannelType?: string;
  };
  adGroup?: { id?: string; name?: string; status?: string };
  adGroupAd?: {
    status?: string;
    ad?: { id?: string; name?: string; type?: string };
  };
  adGroupCriterion?: {
    criterionId?: string;
    status?: string;
    keyword?: { text?: string; matchType?: string };
  };
  assetGroup?: {
    id?: string;
    name?: string;
    status?: string;
    primaryStatus?: string;
    adStrength?: string;
  };
  assetGroupAsset?: {
    asset?: string;
    fieldType?: string;
    status?: string;
    primaryStatus?: string;
  };
  asset?: {
    resourceName?: string;
    id?: string;
    name?: string;
    type?: string;
    textAsset?: { text?: string };
    imageAsset?: { fullSize?: { url?: string } };
    youtubeVideoAsset?: { youtubeVideoId?: string };
  };
};

type SearchStreamBatch = {
  results?: GoogleAdsRow[];
  error?: GoogleAdsErrorResponse["error"];
};

type GoogleAdsErrorResponse = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{ errors?: Array<{ errorCode?: Record<string, string> }> }>;
  };
};

export type GoogleAdsCredentials = {
  developerToken: string;
  loginCustomerId?: string;
  apiVersion: string;
};

export type GoogleAdsAccessToken = string | ((forceRefresh?: boolean) => Promise<string>);
export class GoogleAdsApiError extends Error {}

const API_STATUSES = new Set([
  "UNAUTHENTICATED", "PERMISSION_DENIED", "INVALID_ARGUMENT", "NOT_FOUND",
  "RESOURCE_EXHAUSTED", "UNAVAILABLE", "INTERNAL", "DEADLINE_EXCEEDED",
]);
const API_REASONS = new Set([
  "DEVELOPER_TOKEN_NOT_APPROVED", "DEVELOPER_TOKEN_INVALID", "DEVELOPER_TOKEN_PROHIBITED",
  "DEVELOPER_TOKEN_NOT_ON_ALLOWLIST", "USER_PERMISSION_DENIED", "CUSTOMER_NOT_FOUND",
  "CUSTOMER_NOT_ENABLED", "ACCOUNT_NOT_ENABLED", "SERVICE_ACCESS_DENIED",
  "INVALID_LOGIN_CUSTOMER_ID", "LOGIN_CUSTOMER_ID_PARAMETER_MISSING",
  "OAUTH_TOKEN_INVALID", "OAUTH_TOKEN_EXPIRED", "GOOGLE_ACCOUNT_DELETED",
]);

export type GoogleAdsRawData = {
  daily: GoogleAdsRow[];
  campaigns: GoogleAdsRow[];
  adGroups: GoogleAdsRow[];
  ads: GoogleAdsRow[];
  keywords: GoogleAdsRow[];
  pmaxAssetGroups: GoogleAdsRow[];
  pmaxAssets: GoogleAdsRow[];
  pmaxAssetMetadata: GoogleAdsRow[];
};

const METRIC_FIELDS = [
  "metrics.impressions",
  "metrics.clicks",
  "metrics.conversions",
  "metrics.all_conversions",
  "metrics.cost_micros",
  "metrics.conversions_value",
];

function dateFilter(startDate: string, endDate: string): string {
  return `segments.date BETWEEN '${startDate}' AND '${endDate}'`;
}

export function buildGoogleAdsQueries(startDate: string, endDate: string) {
  const dates = dateFilter(startDate, endDate);
  const metrics = METRIC_FIELDS.join(",\n    ");

  return {
    daily: `
      SELECT
        customer.id,
        segments.date,
        ${metrics}
      FROM customer
      WHERE ${dates}
    `,
    campaigns: `
      SELECT
        customer.id,
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        segments.date,
        ${metrics}
      FROM campaign
      WHERE ${dates}
    `,
    adGroups: `
      SELECT
        customer.id,
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        ad_group.id,
        ad_group.name,
        ad_group.status,
        segments.date,
        ${metrics}
      FROM ad_group
      WHERE ${dates}
    `,
    ads: `
      SELECT
        customer.id,
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        ad_group.id,
        ad_group.name,
        ad_group.status,
        ad_group_ad.ad.id,
        ad_group_ad.ad.name,
        ad_group_ad.ad.type,
        ad_group_ad.status,
        segments.date,
        ${metrics}
      FROM ad_group_ad
      WHERE ${dates}
    `,
    keywords: `
      SELECT
        customer.id,
        campaign.id,
        campaign.name,
        campaign.status,
        ad_group.id,
        ad_group.name,
        ad_group.status,
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        segments.date,
        ${metrics}
      FROM keyword_view
      WHERE ${dates}
    `,
    pmaxAssetGroups: `
      SELECT
        customer.id,
        campaign.id,
        campaign.name,
        campaign.status,
        asset_group.id,
        asset_group.name,
        asset_group.status,
        asset_group.primary_status,
        asset_group.ad_strength,
        segments.date,
        ${metrics}
      FROM asset_group
      WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
        AND ${dates}
    `,
    pmaxAssets: `
      SELECT
        customer.id,
        campaign.id,
        campaign.name,
        campaign.status,
        asset_group.id,
        asset_group.name,
        asset_group.status,
        asset_group_asset.asset,
        asset_group_asset.field_type,
        asset_group_asset.status,
        asset_group_asset.primary_status,
        segments.date,
        ${metrics}
      FROM asset_group_asset
      WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
        AND ${dates}
    `,
    pmaxAssetMetadata: `
      SELECT
        customer.id,
        campaign.id,
        asset_group.id,
        asset_group_asset.asset,
        asset_group_asset.field_type,
        asset.resource_name,
        asset.id,
        asset.name,
        asset.type,
        asset.text_asset.text,
        asset.image_asset.full_size.url,
        asset.youtube_video_asset.youtube_video_id
      FROM asset_group_asset
      WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
    `,
  };
}

export function normalizeCustomerId(value: string): string {
  const normalized = value.replace(/\D/g, "");

  if (!normalized) {
    throw new Error("Google Ads customer ID must contain digits.");
  }

  return normalized;
}

export async function fetchGoogleAdsRows(
  credentials: GoogleAdsCredentials,
  accessToken: GoogleAdsAccessToken,
  customerId: string,
  query: string,
): Promise<GoogleAdsRow[]> {
  if (!credentials.developerToken?.trim()) {
    throw new GoogleAdsApiError("GOOGLE_ADS_DEVELOPER_TOKEN is required.");
  }
  const normalizedCustomerId = normalizeCustomerId(customerId);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "developer-token": credentials.developerToken,
  };

  if (credentials.loginCustomerId) {
    headers["login-customer-id"] = normalizeCustomerId(
      credentials.loginCustomerId,
    );
  }

  const request = async (forceRefresh = false) => {
    const token = typeof accessToken === "function" ? await accessToken(forceRefresh) : accessToken;
    try {
      return await fetch(
        `https://googleads.googleapis.com/${credentials.apiVersion}/customers/${normalizedCustomerId}/googleAds:searchStream`,
        {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(60_000),
          headers: { ...headers, Authorization: `Bearer ${token}` },
          body: JSON.stringify({ query: query.trim() }),
        },
      );
    } catch {
      throw new GoogleAdsApiError("Google Ads API request failed: transport error or timeout.");
    }
  };
  let response = await request();
  // Renew once on an expired/rejected access token; never fall back to user OAuth.
  if (response.status === 401 && typeof accessToken === "function") {
    await response.body?.cancel();
    response = await request(true);
  }
  let payload:
    | SearchStreamBatch[]
    | GoogleAdsErrorResponse;
  try {
    payload = await response.json();
  } catch {
    throw new GoogleAdsApiError(`Google Ads API request failed: HTTP ${response.status}; invalid JSON response.`);
  }

  if (!response.ok || !Array.isArray(payload) || payload.some((batch) => batch.error)) {
    const apiError = Array.isArray(payload)
      ? payload.find((batch) => batch.error)?.error
      : payload?.error;
    const status = apiError?.status && API_STATUSES.has(apiError.status) ? apiError.status : "UNKNOWN";
    const codes = apiError?.details?.flatMap((detail) =>
      detail.errors?.flatMap((error) => Object.values(error.errorCode ?? {})) ?? []
    ) ?? [];
    const reason = codes.find((code) => API_REASONS.has(code)) ?? "UNKNOWN";
    throw new GoogleAdsApiError(`Google Ads API request failed: HTTP ${response.status} ${status}; reason=${reason}.`);
  }

  return payload.flatMap((batch) => batch.results ?? []);
}

export async function fetchGoogleAdsAccountData(
  credentials: GoogleAdsCredentials,
  accessToken: GoogleAdsAccessToken,
  customerId: string,
  startDate: string,
  endDate: string,
): Promise<GoogleAdsRawData> {
  const queries = buildGoogleAdsQueries(startDate, endDate);
  const entries = Object.entries(queries) as Array<
    [keyof GoogleAdsRawData, string]
  >;
  const values = await Promise.all(
    entries.map(([, query]) =>
      fetchGoogleAdsRows(
        credentials,
        accessToken,
        customerId,
        query,
      )
    ),
  );

  return Object.fromEntries(
    entries.map(([key], index) => [key, values[index]]),
  ) as GoogleAdsRawData;
}

function numeric(value: number | string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function microsToUnits(value: string | undefined): number {
  return numeric(value) / 1_000_000;
}

function metricValues(row: GoogleAdsRow) {
  return {
    impressions: numeric(row.metrics?.impressions),
    clicks: numeric(row.metrics?.clicks),
    conversions: numeric(row.metrics?.conversions),
    all_conversions: numeric(row.metrics?.allConversions),
    spend: microsToUnits(row.metrics?.costMicros),
    conversion_value: numeric(row.metrics?.conversionsValue),
  };
}

function extractResourceId(resourceName: string | undefined): string | null {
  if (!resourceName) return null;
  return resourceName.split("/").at(-1) ?? null;
}

function sortRows<T>(rows: T[], key: (row: T) => string): T[] {
  return [...rows].sort((left, right) => key(left).localeCompare(key(right)));
}

export function normalizeGoogleAdsData(raw: GoogleAdsRawData) {
  const metadataByLink = new Map<string, GoogleAdsRow>();

  for (const row of raw.pmaxAssetMetadata) {
    const resource = row.asset?.resourceName ?? row.assetGroupAsset?.asset;
    const key = [row.customer?.id, row.assetGroup?.id, resource].join("|");
    metadataByLink.set(key, row);
  }

  const daily = sortRows(
    raw.daily.map((row) => ({
      account_id: row.customer?.id ?? null,
      metric_date: row.segments?.date ?? null,
      ...metricValues(row),
      reach: null,
      link_clicks: null,
      extra_metrics: {},
      source_updated_at: null,
    })),
    (row) => `${row.account_id ?? ""}|${row.metric_date ?? ""}`,
  );

  const campaigns = sortRows(
    raw.campaigns.map((row) => ({
      source: "google_ads",
      account_id: row.customer?.id ?? null,
      campaign_id: row.campaign?.id ?? null,
      campaign_name: row.campaign?.name ?? null,
      campaign_status: row.campaign?.status ?? null,
      metric_date: row.segments?.date ?? null,
      ...metricValues(row),
      reach: null,
      link_clicks: null,
      extra_metrics: {
        advertising_channel_type:
          row.campaign?.advertisingChannelType ?? null,
      },
      source_updated_at: null,
    })),
    (row) =>
      `${row.account_id ?? ""}|${row.campaign_id ?? ""}|${row.metric_date ?? ""}`,
  );

  const adGroups = sortRows(
    raw.adGroups.map((row) => ({
      account_id: row.customer?.id ?? null,
      campaign_id: row.campaign?.id ?? null,
      campaign_name: row.campaign?.name ?? null,
      group_id: row.adGroup?.id ?? null,
      group_name: row.adGroup?.name ?? null,
      group_status: row.adGroup?.status ?? null,
      metric_date: row.segments?.date ?? null,
      ...metricValues(row),
      reach: null,
      link_clicks: null,
      extra_metrics: {
        advertising_channel_type:
          row.campaign?.advertisingChannelType ?? null,
      },
      source_updated_at: null,
    })),
    (row) =>
      `${row.account_id ?? ""}|${row.group_id ?? ""}|${row.metric_date ?? ""}`,
  );

  const ads = sortRows(
    raw.ads.map((row) => ({
      account_id: row.customer?.id ?? null,
      campaign_id: row.campaign?.id ?? null,
      campaign_name: row.campaign?.name ?? null,
      adset_id: row.adGroup?.id ?? null,
      adset_name: row.adGroup?.name ?? null,
      ad_id: row.adGroupAd?.ad?.id ?? null,
      ad_name: row.adGroupAd?.ad?.name ?? null,
      ad_status: row.adGroupAd?.status ?? null,
      metric_date: row.segments?.date ?? null,
      ...metricValues(row),
      reach: null,
      link_clicks: null,
      extra_metrics: {
        ad_type: row.adGroupAd?.ad?.type ?? null,
        advertising_channel_type:
          row.campaign?.advertisingChannelType ?? null,
      },
      source_updated_at: null,
    })),
    (row) =>
      `${row.account_id ?? ""}|${row.ad_id ?? ""}|${row.metric_date ?? ""}`,
  );

  const keywords = sortRows(
    raw.keywords.map((row) => ({
      account_id: row.customer?.id ?? null,
      campaign_id: row.campaign?.id ?? null,
      campaign_name: row.campaign?.name ?? null,
      ad_group_id: row.adGroup?.id ?? null,
      ad_group_name: row.adGroup?.name ?? null,
      keyword_id: row.adGroupCriterion?.criterionId ?? null,
      keyword_text: row.adGroupCriterion?.keyword?.text ?? null,
      keyword_match_type:
        row.adGroupCriterion?.keyword?.matchType ?? null,
      keyword_status: row.adGroupCriterion?.status ?? null,
      metric_date: row.segments?.date ?? null,
      ...metricValues(row),
      extra_metrics: {},
      source_updated_at: null,
    })),
    (row) =>
      `${row.account_id ?? ""}|${row.keyword_id ?? ""}|${row.metric_date ?? ""}`,
  );

  const pmaxAssetGroups = sortRows(
    raw.pmaxAssetGroups.map((row) => ({
      account_id: row.customer?.id ?? null,
      campaign_id: row.campaign?.id ?? null,
      campaign_name: row.campaign?.name ?? null,
      campaign_status: row.campaign?.status ?? null,
      asset_group_id: row.assetGroup?.id ?? null,
      asset_group_name: row.assetGroup?.name ?? null,
      asset_group_status: row.assetGroup?.status ?? null,
      primary_status: row.assetGroup?.primaryStatus ?? null,
      ad_strength: row.assetGroup?.adStrength ?? null,
      metric_date: row.segments?.date ?? null,
      ...metricValues(row),
      extra_metrics: {},
      source_updated_at: null,
    })),
    (row) =>
      `${row.account_id ?? ""}|${row.asset_group_id ?? ""}|${row.metric_date ?? ""}`,
  );

  const pmaxAssets = sortRows(
    raw.pmaxAssets.map((row) => {
      const resource = row.assetGroupAsset?.asset;
      const metadataKey = [
        row.customer?.id,
        row.assetGroup?.id,
        resource,
      ].join("|");
      const metadata = metadataByLink.get(metadataKey)?.asset;

      return {
        account_id: row.customer?.id ?? null,
        campaign_id: row.campaign?.id ?? null,
        campaign_name: row.campaign?.name ?? null,
        asset_group_id: row.assetGroup?.id ?? null,
        asset_group_name: row.assetGroup?.name ?? null,
        asset_resource_name: resource ?? metadata?.resourceName ?? null,
        asset_id: metadata?.id ?? extractResourceId(resource),
        asset_name: metadata?.name ?? null,
        asset_type: metadata?.type ?? null,
        field_type: row.assetGroupAsset?.fieldType ?? null,
        asset_status: row.assetGroupAsset?.status ?? null,
        performance_label: null,
        text_content: metadata?.textAsset?.text ?? null,
        image_url: metadata?.imageAsset?.fullSize?.url ?? null,
        youtube_video_id:
          metadata?.youtubeVideoAsset?.youtubeVideoId ?? null,
        metric_date: row.segments?.date ?? null,
        ...metricValues(row),
        extra_metrics: {
          asset_group_asset_primary_status:
            row.assetGroupAsset?.primaryStatus ?? null,
        },
        source_updated_at: null,
      };
    }),
    (row) =>
      `${row.account_id ?? ""}|${row.asset_group_id ?? ""}|${row.asset_id ?? ""}|${row.field_type ?? ""}|${row.metric_date ?? ""}`,
  );

  return {
    daily,
    campaigns,
    adGroups,
    ads,
    keywords,
    pmaxAssetGroups,
    pmaxAssets,
  };
}

export async function createPayloadHash(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
