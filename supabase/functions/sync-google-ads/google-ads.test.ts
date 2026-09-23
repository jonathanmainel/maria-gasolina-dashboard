import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleAdsQueries,
  createPayloadHash,
  exchangeGoogleOAuthToken,
  fetchGoogleAdsRows,
  microsToUnits,
  normalizeCustomerId,
  normalizeGoogleAdsData,
  type GoogleAdsRawData,
} from "./google-ads.ts";

const credentials = {
  developerToken: "developer-token-test",
  clientId: "client-id-test",
  clientSecret: "client-secret-test",
  refreshToken: "refresh-token-test",
  loginCustomerId: "123-456-7890",
  apiVersion: "v25",
};

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

describe("Google Ads ingestion helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes customer IDs and converts micros", () => {
    expect(normalizeCustomerId("607-269-9813")).toBe("6072699813");
    expect(microsToUnits("1234567")).toBe(1.234567);
  });

  it("builds date-bounded GAQL and keeps PMax metadata separate", () => {
    const queries = buildGoogleAdsQueries("2026-09-01", "2026-09-02");

    expect(queries.campaigns).toContain(
      "segments.date BETWEEN '2026-09-01' AND '2026-09-02'",
    );
    expect(queries.pmaxAssets).toContain("metrics.cost_micros");
    expect(queries.pmaxAssetMetadata).not.toContain("metrics.cost_micros");
  });

  it("normalizes all domains without inventing reach or ad names", () => {
    const metrics = {
      impressions: "100",
      clicks: "7",
      conversions: 2.5,
      allConversions: 3,
      costMicros: "2500000",
      conversionsValue: 12,
    };
    const raw = emptyRawData();
    raw.daily.push({
      customer: { id: "6072699813" },
      segments: { date: "2026-09-01" },
      metrics,
    });
    raw.campaigns.push({
      customer: { id: "6072699813" },
      campaign: {
        id: "20",
        name: "Search",
        status: "ENABLED",
        advertisingChannelType: "SEARCH",
      },
      segments: { date: "2026-09-01" },
      metrics,
    });
    raw.adGroups.push({
      customer: { id: "6072699813" },
      campaign: { id: "20", name: "Search" },
      adGroup: { id: "30", name: "Core", status: "ENABLED" },
      segments: { date: "2026-09-01" },
      metrics,
    });
    raw.ads.push({
      customer: { id: "6072699813" },
      campaign: { id: "20", name: "Search" },
      adGroup: { id: "30", name: "Core" },
      adGroupAd: { status: "ENABLED", ad: { id: "40", type: "TEXT_AD" } },
      segments: { date: "2026-09-01" },
      metrics,
    });
    raw.keywords.push({
      customer: { id: "6072699813" },
      campaign: { id: "20", name: "Search" },
      adGroup: { id: "30", name: "Core" },
      adGroupCriterion: {
        criterionId: "50",
        status: "ENABLED",
        keyword: { text: "curso de vendas", matchType: "PHRASE" },
      },
      segments: { date: "2026-09-01" },
      metrics,
    });

    const normalized = normalizeGoogleAdsData(raw);

    expect(normalized.daily[0]).toMatchObject({
      account_id: "6072699813",
      spend: 2.5,
      reach: null,
      link_clicks: null,
    });
    expect(normalized.campaigns[0].campaign_status).toBe("ENABLED");
    expect(normalized.adGroups[0].group_id).toBe("30");
    expect(normalized.ads[0]).toMatchObject({ ad_id: "40", ad_name: null });
    expect(normalized.keywords[0]).toMatchObject({
      keyword_id: "50",
      keyword_match_type: "PHRASE",
    });
  });

  it("joins PMax asset metadata and leaves unsupported labels null", () => {
    const raw = emptyRawData();
    const resource = "customers/6072699813/assets/900";
    raw.pmaxAssets.push({
      customer: { id: "6072699813" },
      campaign: { id: "100", name: "PMax" },
      assetGroup: { id: "200", name: "Main" },
      assetGroupAsset: {
        asset: resource,
        fieldType: "HEADLINE",
        status: "ENABLED",
        primaryStatus: "ELIGIBLE",
      },
      segments: { date: "2026-09-01" },
      metrics: { impressions: "10", costMicros: "500000" },
    });
    raw.pmaxAssetMetadata.push({
      customer: { id: "6072699813" },
      assetGroup: { id: "200" },
      assetGroupAsset: { asset: resource, fieldType: "HEADLINE" },
      asset: {
        resourceName: resource,
        id: "900",
        name: "Headline one",
        type: "TEXT",
        textAsset: { text: "Venda mais" },
      },
    });

    const row = normalizeGoogleAdsData(raw).pmaxAssets[0];

    expect(row).toMatchObject({
      asset_id: "900",
      asset_name: "Headline one",
      text_content: "Venda mais",
      spend: 0.5,
      performance_label: null,
    });
    expect(row.extra_metrics.asset_group_asset_primary_status).toBe(
      "ELIGIBLE",
    );
  });

  it("hashes already-sorted payloads deterministically", async () => {
    const payload = [{ account_id: "1", metric_date: "2026-09-01" }];
    expect(await createPayloadHash(payload)).toBe(
      await createPayloadHash(payload),
    );
  });

  it("exchanges OAuth refresh credentials without putting them in the URL", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(_url).toBe("https://oauth2.googleapis.com/token");
      expect(String(init?.body)).toContain("refresh_token=refresh-token-test");
      return new Response(JSON.stringify({ access_token: "access-token-test" }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeGoogleOAuthToken(credentials)).resolves.toBe(
      "access-token-test",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("sends the developer token when configured", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(url).toContain("/v25/customers/6072699813/googleAds:searchStream");
      expect(headers.get("authorization")).toBe("Bearer access-token-test");
      expect(headers.get("developer-token")).toBe("developer-token-test");
      expect(headers.get("login-customer-id")).toBe("1234567890");
      return new Response(
        JSON.stringify([
          { results: [{ customer: { id: "6072699813" } }] },
          { results: [{ customer: { id: "6072699813" } }] },
        ]),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchGoogleAdsRows(
      credentials,
      "access-token-test",
      "607-269-9813",
      "SELECT customer.id FROM customer",
    );

    expect(rows).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("omits the developer token when it is not configured", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer access-token-test");
      expect(headers.has("developer-token")).toBe(false);
      expect(headers.get("login-customer-id")).toBe("1234567890");
      return new Response(JSON.stringify([{ results: [] }]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { developerToken: _developerToken, ...tokenlessCredentials } =
      credentials;

    await expect(
      fetchGoogleAdsRows(
        tokenlessCredentials,
        "access-token-test",
        "6072699813",
        "SELECT customer.id FROM customer",
      ),
    ).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
