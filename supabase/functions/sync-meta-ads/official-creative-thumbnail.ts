import type { VideoPreviewCandidate } from "./meta-creative.ts";
import { trustedMediaUrl, videoPreviewQuality } from "./preview-media.ts";

type Identity = { accountId: string; adId: string; creativeId: string | null; videoId: string | null; assetKey?: string | null; representationCertain?: boolean };

/** Official AdCreative.api_get parameters, never fabricated CDN transforms.
 * Native video dimensions must come from the official video/account response.
 * The caller still verifies decoded bytes, native bounds and the approved hash. */
export async function officialCreativeThumbnail(version: string, token: string, identity: Identity,
  native: { width: number; height: number } | undefined, fetchImpl: typeof fetch) {
  const errors: string[] = [];
  const reject = (code: string) => ({ candidates: [] as VideoPreviewCandidate[], errors: [code] });
  if (!identity.representationCertain || !identity.creativeId || !identity.videoId || identity.assetKey !== `video:${identity.videoId}`)
    return reject("creative_thumbnail_identity_unproven");
  if (!native || videoPreviewQuality(native) === "insufficient") return reject("creative_thumbnail_native_hd_unproven");
  const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(identity.creativeId)}`);
  url.searchParams.set("fields", "id,account_id,object_type,video_id,object_story_spec,asset_feed_spec,thumbnail_url");
  const scale = Math.min(1, 1080 / Math.min(native.width, native.height));
  url.searchParams.set("thumbnail_width", String(Math.floor(native.width * scale)));
  url.searchParams.set("thumbnail_height", String(Math.floor(native.height * scale)));
  try {
    const response = await fetchImpl(url.toString(), { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(15_000) });
    const value = await response.json();
    if (!response.ok || value.error) return reject(value.error?.code ? `meta_${Number(value.error.code)}` : `meta_http_${response.status}`);
    const ids = [value.video_id, value.object_story_spec?.video_data?.video_id,
      ...(Array.isArray(value.asset_feed_spec?.videos) ? value.asset_feed_spec.videos.map((v: any) => v.video_id ?? v.id) : [])]
      .filter((v: unknown) => typeof v === "string" && v.length > 0);
    if (value.id !== identity.creativeId || String(value.account_id) !== identity.accountId ||
      new Set(ids).size !== 1 || ids[0] !== identity.videoId || typeof value.thumbnail_url !== "string")
      return reject("creative_thumbnail_identity_mismatch");
    try { trustedMediaUrl(value.thumbnail_url); } catch { return reject("creative_thumbnail_url_untrusted"); }
    const candidate: VideoPreviewCandidate = { url: value.thumbnail_url, source: "creative.requested_thumbnail",
      policy: "official_creative_exact_identity", width: null, height: null, preferred: false,
      originalRatio: native.width / native.height, nativeWidth: native.width, nativeHeight: native.height,
      verifiedIdentity: { accountId: identity.accountId, adId: identity.adId, creativeId: identity.creativeId, videoId: identity.videoId },
    };
    return { candidates: [candidate], errors };
  } catch { return reject("creative_thumbnail_lookup_unavailable"); }
}
