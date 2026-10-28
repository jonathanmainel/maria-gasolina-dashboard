// Operator-run preflight. Credentials come only from a private backend environment.
// No deployment, secret update, ingestion, coordinator or backfill is supported.
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import {
  createGoogleAdsAccessTokenProvider,
  getGoogleAdsConfiguration,
  GoogleAdsAuthError,
} from "../supabase/functions/sync-google-ads/auth.ts";
import {
  fetchGoogleAdsRows,
  GoogleAdsApiError,
} from "../supabase/functions/sync-google-ads/google-ads.ts";
import { handleGoogleAds } from "../supabase/functions/sync-google-ads/index.ts";

const SUPABASE_ORIGIN = "https://hlqrpreqvvxtkruwsolg.supabase.co";
const ACCOUNT = "6072699813";
const IDENTITY =
  "maria-gasolina-google-ads@thermal-apricot-508813-q7.iam.gserviceaccount.com";

export async function runReadonlyPreflight() {
  const configuration = getGoogleAdsConfiguration((name) => Deno.env.get(name));
  if (!configuration.ok) throw new Error("PREFLIGHT_CONFIGURATION_INVALID");
  const config = configuration.value;
  if (
    config.authMode !== "service_account" ||
    config.serviceAccount.clientEmail !== IDENTITY
  ) {
    throw new Error("PREFLIGHT_IDENTITY_MISMATCH");
  }
  if (
    Deno.env.get("SUPABASE_URL") !== SUPABASE_ORIGIN ||
    !Deno.env.get("SUPABASE_SECRET_KEY")
  ) {
    throw new Error("PREFLIGHT_BACKEND_CONFIGURATION_MISSING");
  }
  const originalFetch = globalThis.fetch;
  const counts = {
    google_ads_reads: 0,
    supabase_reads: 0,
    token_exchanges: 0,
    database_write_attempts: 0,
  };
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (
      url.href === "https://oauth2.googleapis.com/token" &&
      req.method === "POST"
    ) {
      counts.token_exchanges++;
    } else if (
      url.origin === "https://googleads.googleapis.com" &&
      req.method === "POST" &&
      url.pathname ===
        `/${config.apiVersion}/customers/${ACCOUNT}/googleAds:searchStream`
    ) {
      counts.google_ads_reads++;
    } else if (
      url.origin === SUPABASE_ORIGIN && req.method === "GET" &&
      [
        "/rest/v1/dashboard_clients",
        "/rest/v1/dashboard_source_accounts",
        "/rest/v1/dashboard_daily_metrics",
      ].includes(url.pathname)
    ) {
      counts.supabase_reads++;
    } else {
      counts.database_write_attempts++;
      throw new Error("PREFLIGHT_NETWORK_REQUEST_BLOCKED");
    }
    return originalFetch(req, {
      redirect: "error",
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(45000)]),
    });
  };
  try {
    const accessToken = createGoogleAdsAccessTokenProvider(config);
    await accessToken();
    const identityRows = await fetchGoogleAdsRows(
      config,
      accessToken,
      ACCOUNT,
      "SELECT customer.id FROM customer",
    );
    if (identityRows.length !== 1 || identityRows[0].customer?.id !== ACCOUNT) {
      throw new Error("PREFLIGHT_ACCOUNT_MISMATCH");
    }
    const supabaseAdmin = createClient(
      SUPABASE_ORIGIN,
      Deno.env.get("SUPABASE_SECRET_KEY")!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const clientLookup = await supabaseAdmin.from("dashboard_clients").select(
      "id",
    ).eq("slug", "maria-gasolina").eq("active", true).maybeSingle();
    if (clientLookup.error || !clientLookup.data) {
      throw new Error("PREFLIGHT_CLIENT_READ_FAILED");
    }
    const clientId = clientLookup.data.id;
    const readBaseline = async (date: string) => {
      const result = await supabaseAdmin.from("dashboard_daily_metrics").select(
        "metric_date, spend, impressions, clicks, conversions, all_conversions, updated_at",
      )
        .eq("client_id", clientId).eq("source", "google_ads").eq(
          "account_id",
          ACCOUNT,
        ).eq("metric_date", date);
      if (result.error) throw new Error("PREFLIGHT_BASELINE_READ_FAILED");
      return result.data;
    };
    // Even a future handler regression cannot invoke a persistence RPC here.
    supabaseAdmin.rpc = (() => {
      counts.database_write_attempts++;
      throw new Error("PREFLIGHT_RPC_BLOCKED");
    }) as typeof supabaseAdmin.rpc;
    const results = [];
    for (const date of ["2026-09-27", "2026-10-25"]) {
      const before = await readBaseline(date);
      const response = await handleGoogleAds(
        new Request("http://localhost/readonly-preflight", {
          method: "POST",
          body: JSON.stringify({
            client_slug: "maria-gasolina",
            start_date: date,
            end_date: date,
            dry_run: true,
          }),
        }),
        { supabaseAdmin },
      );
      const body = await response.json();
      if (
        !response.ok || !body.ok || body.mode !== "dry_run" ||
        body.database_write_performed !== false ||
        body.google_ads_configuration?.account_id !== ACCOUNT
      ) {
        if (
          typeof body.details === "string" &&
          /^Google Ads (API request|OAuth token exchange)/.test(body.details)
        ) {
          throw new GoogleAdsApiError(body.details);
        }
        throw new Error("PREFLIGHT_DRY_RUN_FAILED");
      }
      const after = await readBaseline(date);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        throw new Error("PREFLIGHT_BASELINE_CHANGED");
      }
      results.push({
        date,
        counts: body.counts,
        api_daily: body.normalized_preview.daily.rows,
        stored_daily: before,
        stored_rows_unchanged: true,
        database_write_performed: false,
      });
    }
    if (counts.database_write_attempts !== 0) {
      throw new Error("PREFLIGHT_WRITE_ATTEMPT_BLOCKED");
    }
    return {
      ok: true,
      account_id: ACCOUNT,
      token_issued: true,
      database_write_performed: false,
      network: counts,
      results,
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(await runReadonlyPreflight(), null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({
        ok: false,
        diagnostic: error instanceof GoogleAdsAuthError ||
            error instanceof GoogleAdsApiError
          ? error.message
          : error instanceof Error &&
              /^PREFLIGHT_[A-Z_]+$/.test(error.message)
          ? error.message
          : "PREFLIGHT_FAILED",
        database_write_performed: false,
      }),
    );
    Deno.exit(1);
  }
}
