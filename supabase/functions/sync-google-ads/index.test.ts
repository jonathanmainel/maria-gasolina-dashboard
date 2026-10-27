import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import collector from "./index.ts";
import { serviceAccountFixture } from "./test-fixtures.ts";

let fixture: Awaited<ReturnType<typeof serviceAccountFixture>>;
let env: Record<string, string | undefined>;
beforeAll(async () => { fixture = await serviceAccountFixture(); });
beforeEach(() => {
  env = {
    GOOGLE_ADS_AUTH_MODE: "service_account",
    GOOGLE_ADS_SERVICE_ACCOUNT_JSON: JSON.stringify(fixture.json),
    GOOGLE_ADS_DEVELOPER_TOKEN: "synthetic-developer-token",
  };
  vi.stubGlobal("Deno", { env: { get: (name: string) => env[name] } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function database() {
  const chain = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({ data: { id: 1, slug: "maria-gasolina", name: "Synthetic Maria Gasolina" }, error: null })),
    order: vi.fn(async () => ({ data: [{ id: 1, account_id: "6072699813", account_name: "Synthetic Maria Gasolina" }], error: null })),
    insert: vi.fn(() => { throw new Error("Unexpected table write"); }),
    update: vi.fn(() => { throw new Error("Unexpected table write"); }),
    delete: vi.fn(() => { throw new Error("Unexpected table write"); }),
    upsert: vi.fn(() => { throw new Error("Unexpected table write"); }),
  };
  return {
    chain,
    from: vi.fn((table: string) => {
      if (!["dashboard_clients", "dashboard_source_accounts"].includes(table)) {
        throw new Error("Unexpected table access");
      }
      return chain;
    }),
    rpc: vi.fn(async (_name: string, _args: unknown) => ({
      data: { status: "success" },
      error: null,
    })),
  };
}

function request(dryRun = true, extra = {}) {
  return new Request("https://local.invalid/sync-google-ads", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_slug: "maria-gasolina", start_date: "2026-09-27", end_date: "2026-09-27", dry_run: dryRun, ...extra }),
  });
}

// Known synthetic metrics, not a comparison against historical production data.
function queryResult(query: string) {
  const row = {
    customer: { id: "6072699813" }, segments: { date: "2026-09-27" },
    metrics: { impressions: "100", clicks: "10", costMicros: "1230000", conversions: 0.5, allConversions: 1, conversionsValue: 12 },
    campaign: { id: "2", name: "Synthetic campaign", status: "ENABLED", advertisingChannelType: "PERFORMANCE_MAX" },
    adGroup: { id: "3", name: "Synthetic group", status: "ENABLED" },
    adGroupAd: { ad: { id: "4", name: "Synthetic ad", type: "TEXT_AD" } },
    adGroupCriterion: { criterionId: "5", keyword: { text: "synthetic keyword", matchType: "EXACT" } },
    assetGroup: { id: "6", name: "Synthetic PMax group" },
    assetGroupAsset: { asset: "customers/6072699813/assets/7", fieldType: "HEADLINE" },
    asset: { id: "7", resourceName: "customers/6072699813/assets/7", textAsset: { text: "Synthetic headline" } },
  };
  if (!query.includes("segments.date BETWEEN")) {
    const { metrics: _metrics, ...metadata } = row;
    return metadata;
  }
  return row;
}

function successfulGoogle() {
  return vi.fn(async (url: string, init: RequestInit) => {
    if (url === "https://oauth2.googleapis.com/token") {
      expect(new URLSearchParams(init.body as URLSearchParams).get("grant_type"))
        .toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
      return Response.json({ access_token: "synthetic-access-token", expires_in: 3600, token_type: "Bearer" });
    }
    expect(url).toBe("https://googleads.googleapis.com/v25/customers/6072699813/googleAds:searchStream");
    const headers = new Headers(init.headers);
    expect(headers.has("developer-token")).toBe(false);
    expect(headers.get("authorization")).toBe("Bearer synthetic-access-token");
    const query = JSON.parse(init.body as string).query;
    return Response.json([{ results: [queryResult(query)] }]);
  });
}

function expectNoWrites(db: ReturnType<typeof database>) {
  expect(db.rpc).not.toHaveBeenCalled();
  for (const method of ["insert", "update", "delete", "upsert"] as const) {
    expect(db.chain[method]).not.toHaveBeenCalled();
  }
}

describe("Google Ads collector with direct service account authentication", () => {
  it("runs all eight original queries for one day and performs no database writes", async () => {
    const db = database();
    const google = successfulGoogle();
    vi.stubGlobal("fetch", google);
    const response = await collector.fetch(request(), { supabaseAdmin: db });
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      ok: true,
      mode: "dry_run",
      google_ads_api_called: true,
      database_write_performed: false,
      database_write_status: null,
      database_write_result: null,
      google_ads_configuration: {
        auth_mode: "service_account",
        account_id: "6072699813",
        developer_token_configured: false,
        oauth_configured: false,
        service_account_configured: true,
        login_customer_id_configured: false,
      },
      counts: {
        daily: 1,
        campaigns: 1,
        ad_groups: 1,
        ads: 1,
        keywords: 1,
        pmax_asset_groups: 1,
        pmax_assets: 1,
      },
    });
    expect(result.normalized_preview.daily.rows[0]).toMatchObject({ spend: 1.23, impressions: 100, clicks: 10, conversions: 0.5 });
    expect(result.normalized_preview.pmax_assets.rows[0]).toMatchObject({ asset_id: "7", text_content: "Synthetic headline" });
    expect(google).toHaveBeenCalledTimes(9);
    const queries = google.mock.calls.slice(1).map(([, init]) => JSON.parse(init.body as string).query);
    expect(queries.filter((query) => query.includes("BETWEEN '2026-09-27' AND '2026-09-27'"))).toHaveLength(7);
    expect(queries.some((query) => query.includes("FROM keyword_view"))).toBe(true);
    expect(queries.some((query) => query.includes("FROM asset_group_asset"))).toBe(true);
    expectNoWrites(db);
    expect(JSON.stringify(result)).not.toContain("synthetic-access-token");
    expect(JSON.stringify(result)).not.toContain("synthetic-developer-token");
    expect(JSON.stringify(result)).not.toContain("BEGIN PRIVATE KEY");
  });

  it("passes an explicitly configured MCC while retaining the target account", async () => {
    env.GOOGLE_ADS_SERVICE_ACCOUNT_LOGIN_CUSTOMER_ID = "123-456-7890";
    const db = database();
    const google = successfulGoogle();
    vi.stubGlobal("fetch", google);
    expect((await collector.fetch(request(), { supabaseAdmin: db })).status).toBe(200);
    for (const [, init] of google.mock.calls.slice(1)) {
      expect(new Headers(init.headers).get("login-customer-id")).toBe("1234567890");
    }
    expectNoWrites(db);
  });

  it("blocks a missing SA JSON without attempting authentication", async () => {
    delete env.GOOGLE_ADS_SERVICE_ACCOUNT_JSON;
    const db = database();
    const google = vi.fn();
    vi.stubGlobal("fetch", google);
    const response = await collector.fetch(request(), { supabaseAdmin: db });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      missing_configuration: ["GOOGLE_ADS_SERVICE_ACCOUNT_JSON"],
      google_ads_api_called: false,
      database_write_performed: false,
    });
    expect(google).not.toHaveBeenCalled();
    expectNoWrites(db);
  });

  it("returns a sanitized authentication failure without querying Ads or writing", async () => {
    const db = database();
    const google = vi.fn(async () => Response.json({ error: "invalid_grant", error_description: "private-material-must-not-escape" }, { status: 400 }));
    vi.stubGlobal("fetch", google);
    const response = await collector.fetch(request(), { supabaseAdmin: db });
    const result = await response.json();
    expect(response.status).toBe(502);
    expect(result).toMatchObject({ google_ads_api_called: false, database_write_performed: false });
    expect(result.details).toContain("invalid_grant");
    expect(JSON.stringify(result)).not.toContain("private-material");
    expect(google).toHaveBeenCalledOnce();
    expectNoWrites(db);
  });

  it("returns a safe authorization failure without writing when the Ads account denies access", async () => {
    const db = database();
    const google = successfulGoogle();
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => url.includes("oauth2")
      ? google(url, init)
      : Response.json({ error: { status: "PERMISSION_DENIED", message: "synthetic-access-token" } }, { status: 403 }));
    const response = await collector.fetch(request(), { supabaseAdmin: db });
    const result = await response.json();
    expect(response.status).toBe(502);
    expect(result).toMatchObject({ google_ads_api_called: true, database_write_performed: false });
    expect(result.details).toContain("HTTP 403 PERMISSION_DENIED");
    expect(JSON.stringify(result)).not.toContain("synthetic-access-token");
    expectNoWrites(db);
  });

  it("requires explicit dry_run and rejects malformed dates before fetching credentials", async () => {
    const db = database();
    vi.stubGlobal("fetch", vi.fn());
    for (const extra of [{ dry_run: null }, { start_date: "2026-02-30" }]) {
      expect((await collector.fetch(request(true, extra), { supabaseAdmin: db })).status).toBe(400);
    }
    expect(db.from).not.toHaveBeenCalled();
    expectNoWrites(db);
  });

  it("preserves write domains and deterministic idempotency keys with a synthetic database", async () => {
    env.GOOGLE_ADS_WRITES_ENABLED = "true";
    const db = database();
    db.rpc.mockImplementation(async name => ({ data: name === "begin_dashboard_sync_collection" ? true : { status: "success" }, error: null }));
    vi.stubGlobal("fetch", successfulGoogle());
    const first = await collector.fetch(request(false, { automation_run_id: "12345678-1234-4234-8234-123456789abc" }), { supabaseAdmin: db });
    expect((await first.json()).database_write_status).toBe("success");
    const originalCalls = structuredClone(db.rpc.mock.calls.filter(([name]) => name !== "begin_dashboard_sync_collection"));
    db.rpc.mockClear();
    db.rpc.mockImplementation(async name => ({ data: name === "begin_dashboard_sync_collection" ? true : { status: "already_processed" }, error: null }));
    const second = await collector.fetch(request(false, { automation_run_id: "12345678-1234-4234-8234-123456789abc" }), { supabaseAdmin: db });
    expect(await second.json()).toMatchObject({ database_write_performed: false, database_write_status: "already_processed" });
    expect(db.rpc.mock.calls.filter(([name]) => name !== "begin_dashboard_sync_collection")).toEqual(originalCalls);
    expect(db.rpc.mock.calls.filter(([name]) => name !== "begin_dashboard_sync_collection").map(([name]) => name)).toEqual([
      "upsert_dashboard_paid_media_batch", "upsert_dashboard_paid_media_group_batch",
      "upsert_dashboard_keyword_batch", "ingest_dashboard_pmax_rows", "ingest_dashboard_pmax_rows",
    ]);
  });

  it("blocks scheduled writes until explicitly enabled without blocking dry runs", async () => {
    const db = database();
    const google = successfulGoogle();
    vi.stubGlobal("fetch", google);
    for (const value of [undefined, "false", "TRUE", "1"]) {
      env.GOOGLE_ADS_WRITES_ENABLED = value;
      const response = await collector.fetch(request(false), { supabaseAdmin: db });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ google_ads_api_called: false, database_write_performed: false });
    }
    expect(google).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
    expectNoWrites(db);
    expect((await collector.fetch(request(), { supabaseAdmin: db })).status).toBe(200);
    expectNoWrites(db);
  });
});
