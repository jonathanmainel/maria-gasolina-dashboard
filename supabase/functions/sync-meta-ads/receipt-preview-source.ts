import { PreviewError } from "./preview-media.ts";
import type { BoundApprovedSource } from "./approved-preview-source.ts";
import type { ApprovedAsset, PreviewSnapshot } from "../_shared/preview-operation.ts";

/** A terminal receipt, immutable previous object and fresh reservation replace
 * the old fixed-ID manifest ONLY for restoring that exact previous revision. */
export async function receiptRestoreSource(admin: any, clientId: number, accountId: string,
  approved: ApprovedAsset, snapshot: PreviewSnapshot, current: any,
  creative: { creativeId: string | null; videoId: string | null; assetKey?: string | null; representationCertain?: boolean },
): Promise<{ source: BoundApprovedSource; origin: string }> {
  const previous = current?.metadata?.preview_previous;
  const fail = (): never => { throw new PreviewError("preview_restore_origin_unconfirmed"); };
  if (!previous || creative.representationCertain !== true || !creative.videoId ||
    approved.ad_id !== snapshot.ad_id || approved.creative_id !== creative.creativeId ||
    approved.video_id !== creative.videoId || previous.creative_id !== creative.creativeId ||
    approved.sha256 !== previous.sha256 || !/^[a-f0-9]{64}$/.test(previous.sha256 ?? "") ||
    !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(previous.mime) ||
    typeof previous.path !== "string" || previous.path.includes("..") || previous.path.includes("?") ||
    !previous.path.startsWith(`${clientId}/meta_ads/${accountId}/ad/${approved.ad_id}/`) ||
    snapshot.creative_id !== creative.creativeId || snapshot.video_id !== creative.videoId ||
    snapshot.asset_key !== creative.assetKey || snapshot.previous_path !== current.preview_storage_path ||
    snapshot.previous_sha256 !== current.preview_sha256 || snapshot.previous_updated_at !== current.updated_at ||
    previous.sha256 === current.preview_sha256) fail();
  const { data, error } = await admin.from("dashboard_automation_runs")
    .select("id,status,preview_selection,preview_results").eq("client_id", clientId).eq("source", "meta_ads")
    .eq("account_id", accountId).eq("operation", "previews").in("status", ["success", "failed"])
    .contains("preview_results", { results: [{ ad_id: approved.ad_id, outcome: "updated", path: current.preview_storage_path, sha256: current.preview_sha256 }] })
    .contains("preview_selection", { ads: [{ ad_id: approved.ad_id, creative_id: creative.creativeId, video_id: creative.videoId, previous_path: previous.path, previous_sha256: previous.sha256 }] })
    .order("completed_at", { ascending: false }).limit(1);
  const audit = data?.[0];
  const old = audit?.preview_selection?.ads?.find((a: any) => a.ad_id === approved.ad_id);
  if (error || !audit || !["success", "failed"].includes(audit.status) || audit.preview_results?.status !== audit.status ||
    !/^[a-f0-9-]{36}$/i.test(audit.id ?? "") || !old || !Number.isFinite(Date.parse(old.previous_updated_at))) fail();
  return { origin: audit.id, source: {
    provenance: "receipt", intent: "restore_previous", client_id: clientId, source: "meta_ads", account_id: accountId,
    ad_id: approved.ad_id, creative_id: creative.creativeId!, video_id: creative.videoId!, asset_key: creative.assetKey!,
    sha256: current.preview_sha256, width: Number(current.metadata.preview_width), height: Number(current.metadata.preview_height),
    mime: current.preview_mime_type, url: "",
    previous: { creative_id: creative.creativeId!, video_id: creative.videoId!, asset_key: old.asset_key ?? null,
      sha256: previous.sha256, path: previous.path, mime: previous.mime, updated_at: old.previous_updated_at,
      metadata: { video_id: creative.videoId, preview_asset_key: old.asset_key ?? null, preview_source: previous.source ?? null,
        preview_width: previous.width, preview_height: previous.height, preview_media_type: "video" },
    },
  } };
}
