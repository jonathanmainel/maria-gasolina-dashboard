import type { Page } from "../../e2e/fixtures";
const origin = "https://preview-quality-test.supabase.co";
export async function fixture(page: Page) {
  const errors: string[] = [];
  let signatures = 0;
  let metadataReads = 0;
  const signedPaths: string[][] = [];
  const user = {
    id: "00000000-0000-0000-0000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "fixture@example.invalid",
    user_metadata: {},
  };
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const jwt = [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({
      sub: user.id,
      role: "authenticated",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 7200,
    }),
    "synthetic-signature",
  ].join(".");
  await page.addInitScript(
    ({ jwt, user }) =>
      localStorage.setItem(
        "sb-preview-quality-test-auth-token",
        JSON.stringify({
          access_token: jwt,
          refresh_token: "synthetic-not-real",
          expires_at: Math.floor(Date.now() / 1000) + 7200,
          expires_in: 7200,
          token_type: "bearer",
          user,
        }),
      ),
    { jwt, user },
  );
  const ads = ["franchise", "condominium"].flatMap((front) =>
    Array.from({ length: 20 }, (_, i) => ({
      source: "meta_ads",
      ad_id: `${front}-${i}`,
      ad_name: `FIXTURE ${front} ${i}`,
      campaign_name:
        front === "franchise" ? "FRANQUIAS FIXTURE" : "CONDOMINIOS FIXTURE",
      impressions: 1000,
      clicks: 10,
      conversions: 30 - i,
      spend: 100,
    })),
  );
  const file = (id: string) =>
    Number(id.split("-").pop()) === 4 ? "hd.png"
    : Number(id.split("-").pop()) === 11 ? "square.png"
    : Number(id.split("-").pop()) === 12 ? "large.png"
    : Number(id.split("-").pop()) === 13 ? "wide.png"
    : Number(id.split("-").pop()) >= 10 ? "image.png"
    : id.endsWith("-2")
      ? "tiny.png"
      : id.endsWith("-1")
        ? "small.png"
        : id.endsWith("-3")
          ? "image.png"
          : "large.png";
  await page.route(`${origin}/**`, async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const reply = (body: unknown) =>
      route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
        },
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (method === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
        },
      });
    if (url.pathname.includes("/auth/")) return reply(user);
    if (
      url.pathname.endsWith("/functions/v1/request-dashboard-sync") &&
      route.request().postDataJSON().action === "status"
    )
      return reply({
        client_id: 1,
        role: "viewer",
        can_request: false,
        server_time: "2026-10-28T12:00:00Z",
        today: "2026-10-28",
        requested_runs: [],
        sources: ["google_ads", "meta_ads", "ga4"].map((source) => ({
          source,
          enabled: true,
          latest_run: null,
          last_success_at: "2026-10-28T04:00:00Z",
          available_through: "2026-10-27",
          missing_accounts: 0,
          accounts: [],
          next_manual_at: null,
        })),
      });
    if (url.pathname.includes("/functions/")) {
      errors.push("Unexpected collector call");
      return reply({});
    }
    if (url.pathname.includes("/object/sign/") && method === "POST") {
      signatures++;
      const paths = route.request().postDataJSON().paths as string[];
      signedPaths.push(paths);
      return reply(
        paths.map((path) => ({
          path,
          signedURL: `/object/sign/dashboard-creatives/${path}?token=synthetic-${signatures}`,
        })),
      );
    }
    if (url.pathname.includes("/object/sign/") && method === "GET") {
      const id = url.pathname.split("/").pop()!;
      // A controlled expired signature must trigger the existing URL-renewal flow.
      if (
        id === "franchise-0" &&
        url.searchParams.get("token") === "synthetic-1"
      )
        return route.fulfill({
          status: 200,
          contentType: "image/png",
          body: "invalid expired-signature image",
        });
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        path: `tests/fixtures/meta-previews/${file(id)}`,
      });
    }
    const table = url.pathname.split("/").pop();
    if (table === "dashboard_clients")
      return reply({ id: 1, slug: "maria-gasolina" });
    if (table === "dashboard_client_users")
      return reply({ client_id: 1, role: "viewer" });
    if (table === "dashboard_manual_inputs") return reply(null);
    if (table === "dashboard_sync_runs")
      return reply({ completed_at: "2026-10-28T04:00:00Z" });
    if (table === "dashboard_daily_metrics")
      return reply({ metric_date: "2026-10-27" });
    if (table === "dashboard_campaign_daily")
      return reply(
        ["FRANQUIAS", "CONDOMINIOS"].map((front, i) => ({
          source: "meta_ads",
          campaign_id: `campaign-${i}`,
          campaign_name: `${front} FIXTURE`,
          campaign_status: "ACTIVE",
          metric_date: "2026-10-27",
          impressions: 9000,
          reach: 8000,
          clicks: 90,
          link_clicks: 90,
          conversions: 45,
          spend: 900,
        })),
      );
    if (table === "dashboard_ad_daily") return reply(ads);
    if (table === "dashboard_creative_previews") {
      metadataReads++;
      return reply(
        ads.filter(ad => (url.searchParams.get("ad_id") ?? "").includes(ad.ad_id)).map((ad) => ({
          ad_id: ad.ad_id,
          creative_type: ad.ad_id.endsWith("-1") || ad.ad_id.endsWith("-11")
            ? "dynamic"
            : ad.ad_id.endsWith("-10") ? "carousel"
            : ad.ad_id.endsWith("-3") || Number(ad.ad_id.split("-").pop()) >= 10 ? "image" : "video",
          preview_kind: ad.ad_id.endsWith("-1")
            ? "dynamic_representative"
            : "video_thumbnail",
          preview_storage_path: `1/meta_ads/fixture/ad/${ad.ad_id}`,
          preview_available: true,
          metadata: {
            preview_media_type: ad.ad_id.endsWith("-3") || Number(ad.ad_id.split("-").pop()) >= 10 ? "image" : "video",
          },
        })),
      );
    }
    if (url.pathname.endsWith("/rpc/get_dashboard_network_units"))
      return reply({
        units: [],
        cities: [],
        summary: { total_units: 0, total_cities: 0, unresolved_cities: 0 },
        headquarters: { city: "Campinas", state: "SP" },
      });
    if (url.pathname.includes("/rpc/"))
      return reply({ items: [], total_count: 0, next_cursor: null });
    return reply([]);
  });
  return {
    errors,
    signedPaths,
    get metadataReads() { return metadataReads; },
    get signatures() {
      return signatures;
    },
  };
}
