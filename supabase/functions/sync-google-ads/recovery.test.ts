import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleGoogleAds } from "./handler.ts";
import { diagnosticSummary, safeDiagnostic } from "./diagnostics.ts";
import { exchangeGoogleOAuthToken, fetchGoogleAdsRows } from "./google-ads.ts";

const credentials = {
  clientId: "client-test",
  clientSecret: "SECRET_MUST_NOT_LEAK",
  refreshToken: "REFRESH_MUST_NOT_LEAK",
  developerToken: "developer-test",
  apiVersion: "v25",
};
const values: Record<string, string> = {
  GOOGLE_ADS_CLIENT_ID: credentials.clientId,
  GOOGLE_ADS_CLIENT_SECRET: credentials.clientSecret,
  GOOGLE_ADS_REFRESH_TOKEN: credentials.refreshToken,
  GOOGLE_ADS_DEVELOPER_TOKEN: credentials.developerToken,
};
const request = (dry_run = true, overrides = {}) =>
  new Request("https://test.invalid", {
    method: "POST",
    body: JSON.stringify({
      client_slug: "test-client",
      start_date: "2026-10-01",
      end_date: "2026-10-01",
      dry_run,
      ...overrides,
    }),
  });
function database(accounts = ["1234567890"]) {
  const rpc = vi.fn(async () => ({ data: { status: "success" }, error: null }));
  const from = vi.fn((table: string) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({
        data: { id: 1, slug: "test-client", name: "Synthetic" },
        error: null,
      }),
      order: async () => ({
        data: accounts.map((account_id) => ({ account_id })),
        error: null,
      }),
    };
    if (!["dashboard_clients", "dashboard_source_accounts"].includes(table)) {
      throw new Error("Unexpected table");
    }
    return chain;
  });
  return { supabaseAdmin: { from, rpc } as any, rpc };
}
function response(body: unknown, status = 200) {
  return Response.json(body, { status });
}
function collected() {
  return [{
    results: [{
      customer: { id: "1234567890" },
      segments: { date: "2026-10-01" },
      campaign: {
        id: "10",
        name: "Synthetic campaign",
        advertisingChannelType: "SEARCH",
      },
      adGroup: { id: "20" },
      adGroupAd: { ad: { id: "30" } },
      adGroupCriterion: {
        criterionId: "40",
        keyword: { text: "synthetic", matchType: "EXACT" },
      },
      assetGroup: { id: "50" },
      assetGroupAsset: {
        asset: "customers/1234567890/assets/60",
        fieldType: "HEADLINE",
      },
      metrics: {
        costMicros: "1234567",
        impressions: "100",
        clicks: "7",
        conversions: 2.5,
        allConversions: 3,
        conversionsValue: 12,
      },
    }],
  }];
}
describe("Google Ads safe recovery", () => {
  it("preserves only the recognized OAuth session-policy subtype", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({
          error: "invalid_grant",
          error_subtype: "invalid_rapt",
          error_description: "SECRET_MUST_NOT_LEAK",
        }, 400)
      ),
    );
    await expect(exchangeGoogleOAuthToken(credentials)).rejects.toMatchObject({
      diagnostic: { code: "invalid_grant", subtype: "invalid_rapt" },
    });
  });
  it("does not expose unrecognized OAuth codes or descriptions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({
          error: credentials.clientSecret,
          error_description: credentials.refreshToken,
        }, 400)
      ),
    );
    await expect(exchangeGoogleOAuthToken(credentials)).rejects.toMatchObject({
      message: "Google Ads oauth: OAUTH_REJECTED",
    });
  });
  beforeEach(() => {
    vi.stubGlobal("Deno", { env: { get: (name: string) => values[name] } });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    "invalid_grant",
    "invalid_client",
    "invalid_scope",
    "deleted_client",
  ])(
    "retains %s even with generic or secret-bearing description",
    async (code) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          response({
            error: code,
            error_description:
              "Bad Request SECRET_MUST_NOT_LEAK REFRESH_MUST_NOT_LEAK",
          }, 400)
        ),
      );
      const db = database();
      const res = await handleGoogleAds(request(), db);
      const text = await res.text();
      expect(res.status).toBe(502);
      expect(JSON.parse(text).diagnostic).toEqual({
        stage: "oauth",
        code,
        upstream_status: 400,
        retryable: false,
      });
      expect(text).not.toMatch(
        /SECRET_MUST_NOT_LEAK|REFRESH_MUST_NOT_LEAK|Bad Request/,
      );
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
        "MUST_NOT_LEAK",
      );
      expect(db.rpc).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("classifies transport without exposing its exception and never retries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network REFRESH_MUST_NOT_LEAK");
      }),
    );
    await expect(exchangeGoogleOAuthToken(credentials)).rejects.toMatchObject({
      diagnostic: { code: "TRANSPORT_ERROR", stage: "oauth", retryable: true },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([null, [], { access_token: 42 }, { access_token: " " }])(
    "rejects malformed successful OAuth response %j",
    async (body) => {
      vi.stubGlobal("fetch", vi.fn(async () => response(body)));
      await expect(exchangeGoogleOAuthToken(credentials)).rejects.toMatchObject(
        { diagnostic: { code: "INVALID_RESPONSE" } },
      );
    },
  );
  it("classifies non-JSON upstream responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("SECRET_MUST_NOT_LEAK", { status: 503 })),
    );
    await expect(exchangeGoogleOAuthToken(credentials)).rejects.toMatchObject({
      diagnostic: {
        code: "INVALID_RESPONSE",
        upstream_status: 503,
        retryable: true,
      },
    });
  });
  it("preserves safe API authorization codes without provider messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({
          error: {
            status: "PERMISSION_DENIED",
            message: credentials.clientSecret,
            details: [{
              errors: [{
                errorCode: { authorizationError: "USER_PERMISSION_DENIED" },
              }],
            }],
          },
        }, 403)
      ),
    );
    await expect(
      fetchGoogleAdsRows(
        credentials,
        "ACCESS_PRIVATE",
        "1234567890",
        "SELECT customer.id FROM customer",
      ),
    ).rejects.toMatchObject({
      diagnostic: {
        stage: "google_ads_api",
        code: "USER_PERMISSION_DENIED",
        upstream_status: 403,
      },
    });
  });
  it("rejects error batches even on HTTP 200 instead of treating them as no data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response([{ error: { status: "UNAVAILABLE" } }])),
    );
    await expect(
      fetchGoogleAdsRows(
        credentials,
        "test",
        "1234567890",
        "SELECT customer.id FROM customer",
      ),
    ).rejects.toMatchObject({ diagnostic: { code: "UNAVAILABLE" } });
  });
  it("rejects malformed result batches", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response([{ results: {} }])));
    await expect(
      fetchGoogleAdsRows(
        credentials,
        "test",
        "1234567890",
        "SELECT customer.id FROM customer",
      ),
    ).rejects.toMatchObject({ diagnostic: { code: "INVALID_RESPONSE" } });
  });
  it("dry run authenticates, collects every domain and prepares unchanged metrics without RPC", async () => {
    const network = vi.fn(async (url: string, init: RequestInit) =>
      url.includes("oauth2")
        ? response({ access_token: "ACCESS_PRIVATE" })
        : response(collected())
    );
    vi.stubGlobal("fetch", network);
    const db = database();
    const body = await (await handleGoogleAds(
      request(true, { expected_account_ids: ["1234567890"] }),
      db,
    )).json();
    expect(body.ok).toBe(true);
    expect(body.database_write_performed).toBe(false);
    expect(network).toHaveBeenCalledTimes(9);
    expect(body.counts).toEqual({
      daily: 1,
      campaigns: 1,
      ad_groups: 1,
      ads: 1,
      keywords: 1,
      pmax_asset_groups: 1,
      pmax_assets: 1,
    });
    expect(body.normalized_preview.daily.rows[0]).toMatchObject({
      spend: 1.234567,
      impressions: 100,
      clicks: 7,
      conversions: 2.5,
      all_conversions: 3,
      conversion_value: 12,
    });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("ACCESS_PRIVATE");
    for (
      const [url, init] of network.mock.calls.filter(([url]) =>
        !url.includes("oauth2")
      )
    ) {
      expect(url).toContain("/v25/customers/1234567890/");
      expect(init.redirect).toBe("error");
      expect(init.signal).toBeDefined();
    }
  });
  it("fails before OAuth and writes if the approved account changed", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    const db = database();
    expect(
      (await handleGoogleAds(
        request(false, { expected_account_ids: ["9999999999"] }),
        db,
      )).status,
    ).toBe(409);
    expect(network).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("reports partial persistence and preserves successful domain results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("oauth2")
          ? response({ access_token: "ACCESS_PRIVATE" })
          : response(collected())
      ),
    );
    const db = database();
    db.rpc.mockResolvedValueOnce({ data: { status: "success" }, error: null });
    db.rpc.mockResolvedValueOnce({
      data: null as any,
      error: { message: credentials.refreshToken } as any,
    });
    const res = await handleGoogleAds(request(false), db);
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.database_write_status).toBe("partial_success");
    expect(body.failed_domain).toBe("ad_groups");
    expect(body.database_write_performed).toBe(true);
    expect(db.rpc).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(body)).not.toContain("REFRESH_MUST_NOT_LEAK");
  });
  it("coordinator summary rejects arbitrary fields, codes and raw messages", () => {
    expect(
      diagnosticSummary({
        stage: "oauth",
        code: "invalid_grant",
        upstream_status: 400,
        details: credentials.clientSecret,
      }),
    ).toBe("Google Ads oauth: invalid_grant (upstream HTTP 400).");
    expect(
      diagnosticSummary({
        stage: "oauth",
        code: credentials.refreshToken,
        upstream_status: 400,
      }),
    ).toBeNull();
    expect(safeDiagnostic(new Error(credentials.clientSecret), "oauth").code)
      .toBe("UNEXPECTED_ERROR");
  });
});
