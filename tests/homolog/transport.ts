// TEST PACKAGE ONLY. Never import into a production entrypoint.
// Supabase authentication, RPCs, queue, persistence and audit remain real.
import { withSupabase } from "@supabase/server";
import {createPreviewProvider} from './preview-provider.ts';
import {fixtures} from './preview-fixtures.ts';
declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };
const REF = "uwafdxsdsgqysjjxfywo";
const ORIGIN = `https://${REF}.supabase.co`;
if (Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") !== ORIGIN) throw new Error("HOMOLOG_PROJECT_GUARD");
const nativeFetch = globalThis.fetch;
type Source = "google_ads" | "meta_ads" | "ga4";
type Control = { scenario: string; generation: number };
let control: Control = { scenario: "partial", generation: 1 };
let providerStarted: (() => void) | undefined;
let previewProvider:ReturnType<typeof createPreviewProvider>|undefined;
const fixtureEnvironment = new Map<string, string>();
export const homologEnv = (name: string): string | undefined => fixtureEnvironment.get(name);
const today = () => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map(key => p.find(x => x.type === key)!.value).join("-");
};
function days(start: string, end: string) {
  const rows: string[] = [];
  for (let value = Date.parse(start + "T12:00:00Z"); value <= Date.parse(end + "T12:00:00Z"); value += 86400000) rows.push(new Date(value).toISOString().slice(0, 10));
  if (rows.length > 8 || rows.length < 1) throw new Error("HOMOLOG_RANGE_GUARD");
  return rows;
}
const factor = (date: string) => date === today() ? control.generation : 1;
const json = (data: unknown, status = 200) => Response.json(data, { status });

async function syntheticCredential() {
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const bytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  const pem = "-----BEGIN PRIVATE KEY-----\n" + btoa(binary).match(/.{1,64}/g)!.join("\n") + "\n-----END PRIVATE KEY-----\n";
  return JSON.stringify({ type: "service_account", project_id: "homolog-controlled-only", client_email: "collector@homolog-controlled-only.iam.gserviceaccount.com", private_key: pem, token_uri: "https://oauth2.googleapis.com/token" });
}

export async function createHomologCollector(source: Source, collector: { fetch: (...args: any[]) => Response | Promise<Response> }) {
  const credential = await syntheticCredential();
  fixtureEnvironment.set("GOOGLE_ADS_SERVICE_ACCOUNT_JSON", credential);
  fixtureEnvironment.set("GOOGLE_ADS_AUTH_MODE", "service_account");
  fixtureEnvironment.set("GOOGLE_ADS_WRITES_ENABLED", "true");
  fixtureEnvironment.set("GA4_SERVICE_ACCOUNT_JSON", credential);
  fixtureEnvironment.set("META_ACCESS_TOKEN", "HOMOLOG_CONTROLLED_ONLY");
  fixtureEnvironment.set("META_API_VERSION", "v25.0");
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init); const url = new URL(request.url);
    const preview=previewProvider&&await previewProvider(request);if(preview)return preview;
    if (url.origin === ORIGIN) return nativeFetch(request, { redirect: "error" });
    if (url.href === "https://oauth2.googleapis.com/token" && request.method === "POST") {
      providerStarted?.();
      return json({ access_token: "HOMOLOG_CONTROLLED_ONLY", token_type: "Bearer", expires_in: 3600 });
    }
    if (url.origin === "https://googleads.googleapis.com" && request.method === "POST") {
      if (!/^\/v\d+\/customers\/900000000002\/googleAds:searchStream$/.test(url.pathname)) throw new Error("HOMOLOG_GOOGLE_ACCOUNT_GUARD");
      const query = (await request.json()).query as string;
      if (control.scenario === "indeterminate") await new Promise(resolve => setTimeout(resolve, 12000));
      const match = query.match(/BETWEEN '(\d{4}-\d{2}-\d{2})' AND '(\d{4}-\d{2}-\d{2})'/);
      const dates = match ? days(match[1], match[2]) : [today()];
      return json([{ results: dates.map(date => ({ customer: { id: "900000000002" }, segments: { date },
        ...(match ? { metrics: { impressions: String(100 * factor(date)), clicks: String(10 * factor(date)), costMicros: String(12000000 * factor(date)), conversions: 2 * factor(date), allConversions: 2 * factor(date), conversionsValue: factor(date) } } : {}),
        campaign: { id: "900101", name: "HOMOLOG FRANQUIA", status: "ENABLED", advertisingChannelType: "PERFORMANCE_MAX" },
        adGroup: { id: "900201", name: "HOMOLOG GROUP", status: "ENABLED" },
        adGroupAd: { status: "ENABLED", ad: { id: "900301", name: "HOMOLOG AD", type: "TEXT_AD" } },
        adGroupCriterion: { criterionId: "900401", status: "ENABLED", keyword: { text: "homolog", matchType: "EXACT" } },
        assetGroup: { id: "900501", name: "HOMOLOG PMAX", status: "ENABLED" },
        assetGroupAsset: { asset: "customers/900000000002/assets/900601", fieldType: "HEADLINE", status: "ENABLED" },
        asset: { id: "900601", resourceName: "customers/900000000002/assets/900601", type: "TEXT", textAsset: { text: "HOMOLOG ONLY" } },
      })) }]);
    }
    if (url.origin === "https://analyticsdata.googleapis.com" && request.method === "POST") {
      if (!url.pathname.includes("properties/900000003:runReport")) throw new Error("HOMOLOG_GA4_PROPERTY_GUARD");
      const spec = await request.json();
      const rows = days(spec.dateRanges[0].startDate, spec.dateRanges[0].endDate).map(date => ({
        dimensionValues: spec.dimensions.map((dim: { name: string }) => ({ value: ({ date: date.replaceAll("-", ""), sessionDefaultChannelGroup: "Organic Search", sessionSourceMedium: "google / organic", eventName: "form_submit", landingPage: "/homolog" } as Record<string, string>)[dim.name] ?? "homolog" })),
        metricValues: spec.metrics.map((metric: { name: string }) => ({ value: String((({ sessions: 30, engagedSessions: 20, activeUsers: 25, newUsers: 15, screenPageViews: 40, eventCount: 50, keyEvents: 3, totalRevenue: 0 } as Record<string, number>)[metric.name] ?? 0) * factor(date)) })),
      }));
      return json({ dimensionHeaders: spec.dimensions, metricHeaders: spec.metrics, rows, rowCount: rows.length, metadata: { timeZone: "America/Sao_Paulo" } });
    }
    if (url.origin === "https://graph.facebook.com") {
      if (control.scenario === "partial") return json({ error: { code: 190, error_subcode: 463, type: "OAuthException", message: "HOMOLOG_CONTROLLED_FAILURE" } }, 401);
      if (url.pathname.endsWith("/insights")) {
        const range = JSON.parse(url.searchParams.get("time_range")!); const level = url.searchParams.get("level");
        return json({ data: days(range.since, range.until).map(date => ({ date_start: date, date_stop: date, account_id: "900000000001", account_name: "HOMOLOG ONLY", impressions: String(80 * factor(date)), clicks: String(8 * factor(date)), reach: String(60 * factor(date)), spend: String(8 * factor(date)),
          ...(level !== "account" ? { campaign_id: "800101", campaign_name: "HOMOLOG FRANQUIA" } : {}), ...(level === "adset" || level === "ad" ? { adset_id: "800201", adset_name: "HOMOLOG SET" } : {}), ...(level === "ad" ? { ad_id: "800301", ad_name: "HOMOLOG AD" } : {}),
          actions: [{ action_type: "lead", value: String(2 * factor(date)) }, { action_type: "link_click", value: String(8 * factor(date)) }],
        })) });
      }
      if (/\/act_900000000001$/.test(url.pathname)) return json({ id: "act_900000000001", account_id: "900000000001", name: "HOMOLOG ONLY", account_status: 1, currency: "BRL", timezone_name: "America/Sao_Paulo", timezone_offset_hours_utc: -3 });
      // No external preview media: metadata is deliberately unavailable in this fixture.
      return json({ data: [], id: "800301", name: "HOMOLOG AD" });
    }
    throw new Error("HOMOLOG_EXTERNAL_NETWORK_BLOCKED");
  };
  return {
    fetch: withSupabase({ auth: "secret" }, async (req, ctx) => {
      const { data, error } = await ctx.supabaseAdmin.from("manual_sync_homolog_control").select("scenario,generation").eq("id", true).single();
      if (error || !data) return json({ ok: false, error_code: "HOMOLOG_CONTROL_MISSING" }, 503);
      control = data as Control;
      const body = await req.clone().json(); const id = typeof body.automation_run_id === "string" ? body.automation_run_id : null;
      if (id) await ctx.supabaseAdmin.from("manual_sync_homolog_receipts").upsert({ run_id: id, source, execution_id: Deno.env.get("SB_EXECUTION_ID"), started_at: new Date().toISOString() });
      let signalStarted!: () => void;
      const started = new Promise<void>(resolve => { signalStarted = resolve; }); providerStarted = signalStarted;
      previewProvider=source==='meta_ads'&&body.operation==='previews'?createPreviewProvider(nativeFetch,control,()=>providerStarted?.(),fixtures):undefined;
      const native = Promise.resolve().then(()=>collector.fetch(req)).catch(async error=>{
        const diagnostic={test_error_name:error?.name??'unknown',test_error_type:'COLLECTOR_REJECTED'};
        if(id)await ctx.supabaseAdmin.from('manual_sync_homolog_receipts').update({finished_at:new Date().toISOString(),outcome:'failed',counts:diagnostic}).eq('run_id',id);
        return Response.json({ok:false,error_code:'HOMOLOG_COLLECTOR_REJECTED',...diagnostic},{status:500});
      });
      const finish = async (response: Response) => {
        let output: Record<string, unknown> = {}; try { output = await response.clone().json(); } catch { /* safe status only */ }
        if (id) await ctx.supabaseAdmin.from("manual_sync_homolog_receipts").update({ finished_at: new Date().toISOString(), http_status: response.status, write_performed: output.database_write_performed === true, write_status: output.database_write_status ?? null, counts: body.operation==='previews'?{preview_results:output.preview_results??null}:output.counts ?? {}, outcome: response.ok && output.ok === true ? "success" : "failed" }).eq("run_id", id);
        return response;
      };
      if ((source === "google_ads"||source==='meta_ads'&&body.operation==='previews') && control.scenario === "indeterminate") {
        const early = await Promise.race([started.then(() => null), native]);
        if (early) return finish(early);
        EdgeRuntime.waitUntil(native.then(finish).catch(async () => { if (id) await ctx.supabaseAdmin.from("manual_sync_homolog_receipts").update({ finished_at: new Date().toISOString(), outcome: "failed" }).eq("run_id", id); }));
        return new Response("HOMOLOG_GATEWAY_RESPONSE_INTERRUPTED", { status: 504 });
      }
      return finish(await native);
    }),
  };
}
