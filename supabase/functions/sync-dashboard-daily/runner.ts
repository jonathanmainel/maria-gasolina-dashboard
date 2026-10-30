import { safeSyncErrorCode, type SyncSource } from "../_shared/sync-control.ts";
import {previewSelection,SHA256,type PreviewSelection} from '../_shared/preview-operation.ts';

type RpcResult = { data: any; error: unknown };
export type SyncAdmin = { rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult> };
export type ClaimedRun = { id: string; source: SyncSource; client_id: number; client_slug: string; range_start: string; range_end: string; operation?:'metrics'|'previews';account_id?:string;preview_selection?:PreviewSelection;selection_fingerprint?:string };

const COUNT_KEYS = ["daily", "campaigns", "ads", "ad_sets", "ad_groups", "keywords", "pmax_asset_groups", "pmax_assets", "acquisition", "events", "landing_pages"];
export function safeCounts(source: SyncSource, body: Record<string, any>) {
  const raw = source === "meta_ads" ? {
    daily: body.meta_insights?.daily_count, campaigns: body.meta_insights?.campaign_count,
    ad_sets: body.meta_insights?.ad_set_count, ads: body.meta_insights?.ad_count,
  } : body.counts;
  return Object.fromEntries(COUNT_KEYS.filter((key) => Number.isSafeInteger(raw?.[key]) && raw[key] >= 0).map((key) => [key, raw[key]]));
}

export async function runReservedSync(id: string, admin: SyncAdmin, url: string, headers: HeadersInit, transport: typeof fetch = fetch) {
  const { data, error } = await admin.rpc("start_dashboard_sync_run", { p_run_id: id });
  if (error) throw new Error("RUN_CLAIM_FAILED");
  if (!data) return { run_id: id, ok: false, state: "not_claimed" };
  const run = data as ClaimedRun;
  let status: "success" | "failed" | "indeterminate" = "indeterminate";
  let code: string | null = "SYNC_OUTCOME_UNKNOWN";
  let httpStatus: number | null = null;
  let counts = {};
  let writeStatus: string | null = null;
  try {
    const name = { google_ads: "sync-google-ads", meta_ads: "sync-meta-ads", ga4: "sync-ga4" }[run.source];
    if (!name) throw new Error("UNKNOWN_SOURCE");
    if(run.operation!==undefined&&!['metrics','previews'].includes(run.operation))throw new Error('INVALID_OPERATION');
    const preview=run.operation==='previews';
    if(preview&&(run.source!=='meta_ads'||!previewSelection(run.preview_selection)||!run.account_id||!SHA256.test(run.selection_fingerprint??'')))throw new Error('INVALID_PREVIEW_RESERVATION');
    const response = await transport(`${url}/functions/v1/${name}`, {
      method: "POST", redirect: "error", headers,
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({ client_slug: run.client_slug, start_date: run.range_start,
        end_date: run.range_end, dry_run: false, automation_run_id: run.id,
        ...(preview?{operation:'previews',preview_ad_ids:run.preview_selection!.ad_ids,preview_selection:run.preview_selection,
          preview_account_id:run.account_id,selection_fingerprint:run.selection_fingerprint}:{}) }),
    });
    httpStatus = response.status;
    // A gateway timeout/invalid body does not prove the collector has stopped.
    const body = await response.json();
    if (!body || typeof body !== "object" || typeof body.ok !== "boolean") throw new Error("INVALID_COLLECTOR_RESPONSE");
    if(preview){
      const verified=await admin.rpc('verify_dashboard_preview_results',{p_run_id:run.id,p_results:body.preview_results??null});
      if(!verified.error&&verified.data&&['success','failed'].includes(verified.data.status)){
        status=verified.data.status;counts=verified.data.counts;code=status==='success'?null:'PREVIEW_BATCH_FAILED';
        if(status==='success'&&(!response.ok||body.ok!==true)){status='indeterminate';code='PREVIEW_RESPONSE_DIVERGENCE';}
      } else {status='indeterminate';code='PREVIEW_RESULT_UNCONFIRMED';}
    } else {
    counts = safeCounts(run.source, body);
    if (["success", "partial_success", "already_processed", "no_data"].includes(body.database_write_status)) writeStatus = body.database_write_status;
    if (writeStatus === "already_processed" && Object.keys(counts).length > 0 && Object.values(counts).every((count) => count === 0)) writeStatus = "no_data";
    if (response.ok && body.ok === true && ["success", "already_processed", "no_data"].includes(writeStatus ?? "")) { status = "success"; code = null; }
    else if (body.ok === true) { status = "indeterminate"; code = "SYNC_RESULT_UNCONFIRMED"; }
    else if (body.error_code === "SYNC_RESERVATION_CONFLICT") {
      // Could be an already-running duplicate: retain exclusion until investigated.
      status = "indeterminate"; code = "SYNC_RESERVATION_CONFLICT";
    } else { status = "failed"; code = safeSyncErrorCode(body, response.status); }
    }
  } catch {
    // Keep the active reservation. A privileged operator reconciles actual termination.
  }
  const finished = await admin.rpc("finish_dashboard_sync_run", {
    p_run_id: run.id, p_status: status, p_http_status: httpStatus,
    p_counts: counts, p_write_status: writeStatus, p_error_code: code,
  });
  if (finished.error) throw new Error("RUN_RESULT_NOT_RECORDED");
  return { run_id: run.id, source: run.source, ok: status === "success", state: status, error_code: code };
}
