import {
  fetchMedia,
  inspectImage,
  improves,
  videoPreviewQuality,
  MAX_PREVIEW_BYTES,
  PreviewError,
  readLimitedBody,
} from "./preview-media.ts";
import type {PreviewSelection} from '../_shared/preview-operation.ts';
import { bindApprovedSource, confirmedUpgradeForRestore, defaultManifestPin, loadApprovedSources } from "./approved-preview-source.ts";
import type { BoundApprovedSource, ManifestPin } from "./approved-preview-source.ts";
export const CREATIVE_BUCKET = "dashboard-creatives";
export const CREATIVE_REFRESH_TTL_MS = 20 * 60 * 60 * 1000;
const META_AD_BATCH_SIZE = 25;
const CREATIVE_CONCURRENCY = 4;
export const PREVIEW_STRATEGY_VERSION = 4;

export function validatePreviewAdIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 50 ||
    value.some((id) => typeof id !== "string" || !/^\d{1,30}$/.test(id))
  )
    throw new PreviewError("preview_ad_ids_invalid");
  return [...new Set(value)] as string[];
}

export type MetaCreativeType =
  | "image"
  | "video"
  | "carousel"
  | "dynamic"
  | "unknown";

export type CreativeAdRef = {
  account_id: string;
  ad_id: string;
  ad_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
};

export type ExistingCreative = {
  account_id?: string;
  creative_name?: string | null;
  source_updated_at?: string | null;
  entity_id: string;
  creative_id: string | null;
  preview_storage_path: string | null;
  preview_mime_type: string | null;
  preview_sha256: string | null;
  last_error: string | null;
  refreshed_at: string;
  updated_at?: string;
  creative_type?: MetaCreativeType;
  preview_kind?: NormalizedMetaCreative["previewKind"];
  metadata?: Record<string, unknown> | null;
};

type MetaCreativePayload = {
  id?: string;
  name?: string;
  object_type?: string;
  thumbnail_url?: string;
  image_url?: string;
  image_hash?: string;
  video_id?: string;
  effective_object_story_id?: string;
  object_story_spec?: Record<string, unknown>;
  asset_feed_spec?: Record<string, unknown>;
};

type MetaAdPayload = {
  id?: string;
  name?: string;
  status?: string;
  updated_time?: string;
  campaign?: { id?: string; name?: string };
  adset?: { id?: string; name?: string };
  creative?: MetaCreativePayload;
};

export type NormalizedMetaCreative = {
  creativeId: string | null;
  creativeName: string | null;
  creativeType: MetaCreativeType;
  previewKind:
    | "image"
    | "video_thumbnail"
    | "carousel_representative"
    | "dynamic_representative"
    | "unavailable";
  previewUrl: string | null;
  videoId: string | null;
  videoIdSource: string | null;
  videoFallbacks: VideoPreviewCandidate[];
  candidates?: VideoPreviewCandidate[];
  imageHash?: string | null;
  assetKey?: string | null;
  representationCertain?: boolean;
  metadata: Record<string, unknown>;
  sourceUpdatedAt: string | null;
};

export type CreativeEnrichmentStats = {
  inspected: number;
  inserted: number;
  updated: number;
  reused: number;
  preview_downloaded: number;
  failed: number;
  would_insert: number;
  would_update: number;
  video_high_res_resolved: number;
  video_ids_resolved: number;
  video_thumbnail_candidates: number;
  video_account_picture_resolved: number;
  video_preferred_thumbnail: number;
  video_thumbnail_fallback: number;
  video_preview_failed: number;
  failures: Array<{ ad_id: string; code: string }>;
  decisions?: Array<Record<string, unknown>>;
};

type SupabaseLike = {
  from: (table: string) => any;
  storage: {
    from: (bucket: string) => any;
  };
};

type EnrichOptions = {
  supabase: SupabaseLike;
  clientId: number;
  apiVersion: string;
  accessToken: string;
  accountIds: string[];
  startDate: string;
  endDate: string;
  adRows: Array<Record<string, unknown>>;
  dryRun: boolean;
  now?: Date;
  fetchImpl?: typeof fetch;
  videoRefreshOnly?: boolean;
  videoPictureOverrides?: Record<string, string>;
  // Backend-only selection; does not add an alternate collector endpoint.
  previewAdIds?: string[];
  reservationSelection?: PreviewSelection;
  // Backend test adapter only; index.ts never reads a pin or URL from a request.
  approvedManifestPin?: ManifestPin;
  // Explicit trusted local/isolated adapter only. The collector never starts FFmpeg.
  frameFallback?: (identity: { accountId: string; adId: string; creativeId: string | null; videoId: string }) => Promise<{ videoId: string; bytes: Uint8Array<ArrayBuffer>; mime: string } | null>;
};

export type VideoPreviewCandidate = {
  url: string;
  source: string;
  policy: string;
  width: number | null;
  height: number | null;
  preferred: boolean;
  originalRatio?: number;
};

type DownloadedPreview = {
  bytes: Uint8Array<ArrayBuffer>;
  mime: string;
  sha256: string;
  width: number | null;
  height: number | null;
};

type ReviewedThumbnail = { videoId: string; sha256: string; required?: boolean };
type ApprovedPreviewDiagnostic = {
  code: string;
  approved_sha256: string;
  candidate_count: number;
  measured_count: number;
  download_failure_count: number;
  matched_sha256: string | null;
  general_selected_sha256: string | null;
};

class CreativeRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayValue(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value
        .map(objectValue)
        .filter((item): item is Record<string, unknown> => item !== null)
    : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstString(
  objects: Array<Record<string, unknown>>,
  keys: string[],
): string | null {
  for (const object of objects) {
    for (const key of keys) {
      const value = stringValue(object[key]);
      if (value) return value;
    }
  }
  return null;
}

function uniqueVideoFallbacks(
  candidates: Array<
    Omit<VideoPreviewCandidate, "width" | "height" | "preferred" | "url"> & {
      url: string | null;
    }
  >,
): VideoPreviewCandidate[] {
  const seen = new Set<string>();
  return candidates.flatMap((candidate) => {
    if (!candidate.url || seen.has(candidate.url)) return [];
    seen.add(candidate.url);
    return [
      {
        ...candidate,
        url: candidate.url,
        width: null,
        height: null,
        preferred: false,
      },
    ];
  });
}

export function sanitizeDestinationUrl(value: unknown): string | null {
  const raw = stringValue(value);
  if (!raw) return null;

  try {
    const url = new URL(raw);
    for (const key of [
      "access_token",
      "appsecret_proof",
      "signature",
      "sig",
      "token",
    ]) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeMetaCreativeBase(ad: MetaAdPayload): NormalizedMetaCreative {
  const creative = ad.creative ?? {};
  const story = objectValue(creative.object_story_spec) ?? {};
  const linkData = objectValue(story.link_data) ?? {};
  const videoData = objectValue(story.video_data) ?? {};
  const assetFeed = objectValue(creative.asset_feed_spec) ?? {};
  const childAttachments = arrayValue(linkData.child_attachments);
  const assetImages = arrayValue(assetFeed.images);
  const assetVideos = arrayValue(assetFeed.videos);
  const assetBodies = arrayValue(assetFeed.bodies);
  const assetTitles = arrayValue(assetFeed.titles);
  const assetLinks = arrayValue(assetFeed.link_urls);
  const creativeVideoId = stringValue(creative.video_id);
  const storyVideoId = stringValue(videoData.video_id);
  const assetVideoId = firstString(assetVideos, ["video_id", "id"]);
  const videoId = creativeVideoId ?? storyVideoId ?? assetVideoId;
  const videoIdSource = creativeVideoId
    ? "creative.video_id"
    : storyVideoId
      ? "object_story_spec.video_data.video_id"
      : assetVideoId
        ? "asset_feed_spec.videos"
        : null;

  const hasAssetFeed = Object.keys(assetFeed).length > 0;
  const hasCarousel = childAttachments.length > 0;
  const hasVideo =
    !!creativeVideoId ||
    Object.keys(videoData).length > 0 ||
    assetVideos.length > 0 ||
    creative.object_type === "VIDEO";

  const creativeType: MetaCreativeType = hasAssetFeed
    ? "dynamic"
    : hasCarousel
      ? "carousel"
      : hasVideo
        ? "video"
        : creative.image_url ||
            creative.image_hash ||
            creative.thumbnail_url ||
            linkData.picture ||
            linkData.image_hash
          ? "image"
          : "unknown";

  const videoFallbacks =
    creativeType === "video"
      ? uniqueVideoFallbacks([
          {
            url: stringValue(videoData.image_url),
            source: "object_story_spec.video_data.image_url",
            policy: "video_creative_image",
          },
          {
            url: stringValue(creative.image_url),
            source: "creative.image_url",
            policy: "video_creative_image",
          },
          {
            url: stringValue(creative.thumbnail_url),
            source: "creative.thumbnail_url",
            policy: "video_thumbnail_fallback",
          },
        ])
      : [];

  const previewUrl = hasCarousel
    ? firstString(childAttachments, ["picture", "image_url", "thumbnail_url"])
    : hasAssetFeed
      ? (firstString(
          [...assetImages, ...assetVideos],
          ["url", "image_url", "thumbnail_url", "picture"],
        ) ??
        stringValue(creative.image_url) ??
        stringValue(creative.thumbnail_url))
      : hasVideo
        ? (videoFallbacks[0]?.url ?? null)
        : (stringValue(creative.image_url) ??
          stringValue(linkData.picture) ??
          stringValue(creative.thumbnail_url));

  const headline = hasCarousel
    ? firstString(childAttachments, ["name", "title"])
    : firstString(
        [linkData, videoData, ...assetTitles],
        ["name", "title", "text"],
      );
  const body = firstString(
    [linkData, videoData, ...assetBodies],
    ["message", "body", "text", "link_description"],
  );
  const destinationUrl = sanitizeDestinationUrl(
    hasCarousel
      ? firstString(childAttachments, ["link", "url", "website_url"])
      : firstString(
          [linkData, videoData, ...assetLinks],
          ["link", "url", "website_url"],
        ),
  );

  return {
    creativeId: stringValue(creative.id),
    creativeName: stringValue(creative.name),
    creativeType,
    previewKind: previewUrl
      ? creativeType === "video"
        ? "video_thumbnail"
        : creativeType === "carousel"
          ? "carousel_representative"
          : creativeType === "dynamic"
            ? "dynamic_representative"
            : "image"
      : "unavailable",
    previewUrl,
    videoId,
    videoIdSource,
    videoFallbacks,
    metadata: {
      object_type: stringValue(creative.object_type),
      effective_object_story_id: stringValue(
        creative.effective_object_story_id,
      ),
      headline,
      body,
      destination_url: destinationUrl,
      has_asset_feed_spec: hasAssetFeed,
      video_id: videoId,
      video_id_source: videoIdSource,
      preview_source:
        creativeType === "video" ? (videoFallbacks[0]?.source ?? null) : null,
      representative_policy:
        creativeType === "carousel"
          ? "first_carousel_card"
          : creativeType === "dynamic"
            ? "first_available_asset"
            : creativeType === "video"
              ? (videoFallbacks[0]?.policy ?? "video_thumbnail_fallback")
              : previewUrl
                ? "primary_image"
                : "none",
    },
    sourceUpdatedAt: stringValue(ad.updated_time),
  };
}

/** Keep one representative asset; compare renditions, never unrelated pieces. */
export function normalizeMetaCreative(
  ad: MetaAdPayload,
  previous?: ExistingCreative,
): NormalizedMetaCreative {
  const result = normalizeMetaCreativeBase(ad);
  const creative = ad.creative ?? {};
  const story = objectValue(creative.object_story_spec) ?? {};
  const link = objectValue(story.link_data) ?? {};
  const video = objectValue(story.video_data) ?? {};
  const feed = objectValue(creative.asset_feed_spec) ?? {};
  const images = arrayValue(feed.images),
    videos = arrayValue(feed.videos);
  const cards = arrayValue(link.child_attachments);
  const previousKey =
    previous?.creative_id === result.creativeId
      ? stringValue(previous.metadata?.preview_asset_key)
      : null;
  let imageHash: string | null = null,
    assetKey: string | null = null;
  let videoId = result.videoId,
    mediaType = "image",
    certain = true;
  const sources: Array<{ url: string | null; source: string; policy: string }> =
    [];
  const add = (value: unknown, source: string, policy = "primary_image") =>
    sources.push({ url: stringValue(value), source, policy });
  if (
    result.creativeType === "dynamic" &&
    cards.length === 0 &&
    (images.length || videos.length)
  ) {
    const keyed = [
      ...images.map((asset) => ({
        asset,
        video: false,
        key: stringValue(asset.hash) ? `image:${asset.hash}` : null,
      })),
      ...videos.map((asset) => ({
        asset,
        video: true,
        key: stringValue(asset.video_id) ? `video:${asset.video_id}` : null,
      })),
    ];
    const chosen =
      keyed.find((item) => item.key && item.key === previousKey) ?? keyed[0];
    assetKey = chosen.key;
    imageHash = chosen.video ? null : stringValue(chosen.asset.hash);
    videoId = chosen.video ? stringValue(chosen.asset.video_id) : null;
    mediaType = chosen.video ? "video" : "image";
    for (const field of ["url", "image_url", "thumbnail_url", "picture"])
      add(
        chosen.asset[field],
        `asset_feed_spec.${chosen.video ? "videos" : "images"}.${field}`,
        "first_available_asset",
      );
    // Generic creative artwork is associated only with a unique video asset.
    if (chosen.video && !images.length && videos.length === 1) {
      add(
        video.image_url,
        "object_story_spec.video_data.image_url",
        "video_creative_image",
      );
      add(creative.image_url, "creative.image_url", "video_creative_image");
      add(
        creative.thumbnail_url,
        "creative.thumbnail_url",
        "video_thumbnail_fallback",
      );
    }
    if (previous?.preview_storage_path && !previousKey) {
      // Legacy mixed assets do not say which image was actually downloaded.
      certain =
        !images.length &&
        videos.length === 1 &&
        previous.metadata?.video_id === videoId;
    }
  } else if (cards.length) {
    const card = cards[0]; // Do not skip to a different carousel card on failure.
    imageHash = stringValue(card.image_hash);
    videoId = stringValue(card.video_id);
    assetKey = videoId
      ? `video:${videoId}`
      : imageHash
        ? `image:${imageHash}`
        : "carousel:first";
    mediaType = videoId ? "video" : "image";
    for (const field of ["image_url", "picture", "thumbnail_url"])
      add(
        card[field],
        `object_story_spec.link_data.child_attachments.0.${field}`,
        "first_carousel_card",
      );
    certain =
      result.creativeType !== "dynamic" ||
      !previous?.preview_storage_path ||
      !!previousKey;
  } else if (
    result.creativeType === "video" ||
    (result.creativeType === "dynamic" && videoId)
  ) {
    mediaType = "video";
    assetKey = videoId ? `video:${videoId}` : null;
    for (const candidate of result.videoFallbacks) sources.push(candidate);
    if (!sources.length) {
      add(
        video.image_url,
        "object_story_spec.video_data.image_url",
        "video_creative_image",
      );
      add(
        creative.thumbnail_url,
        "creative.thumbnail_url",
        "video_thumbnail_fallback",
      );
    }
    certain =
      result.creativeType !== "dynamic" ||
      !previous?.preview_storage_path ||
      !!previousKey;
  } else {
    videoId = null;
    imageHash =
      stringValue(creative.image_hash) ?? stringValue(link.image_hash);
    assetKey = imageHash ? `image:${imageHash}` : null;
    add(creative.image_url, "creative.image_url");
    add(link.picture, "object_story_spec.link_data.picture");
    add(creative.thumbnail_url, "creative.thumbnail_url");
    certain =
      result.creativeType !== "dynamic" ||
      !previous?.preview_storage_path ||
      !!previousKey;
  }
  if (creative.asset_feed_spec === undefined)
    delete result.metadata.has_asset_feed_spec;
  if (
    previous?.creative_type === "dynamic" &&
    creative.asset_feed_spec === undefined
  )
    certain = false;
  const candidates = uniqueVideoFallbacks(sources);
  const kind =
    result.creativeType === "video"
      ? "video_thumbnail"
      : result.creativeType === "dynamic"
        ? "dynamic_representative"
        : result.creativeType === "carousel"
          ? "carousel_representative"
          : result.creativeType === "image"
            ? "image"
            : "unavailable";
  return {
    ...result,
    videoId,
    assetKey,
    imageHash,
    candidates,
    representationCertain: certain,
    videoFallbacks: mediaType === "video" ? candidates : [],
    previewUrl: candidates[0]?.url ?? null,
    previewKind: kind,
    metadata: {
      ...result.metadata,
      preview_asset_key: assetKey,
      preview_media_type: mediaType,
      video_id: videoId,
      preview_source: candidates[0]?.source ?? null,
      representative_policy:
        result.creativeType === "dynamic"
          ? "first_available_asset"
          : result.creativeType === "carousel"
            ? "first_carousel_card"
            : (candidates[0]?.policy ?? "none"),
    },
  };
}

export function isCreativePreviewStale(
  existing: ExistingCreative | undefined,
  now = new Date(),
): boolean {
  if (!existing || existing.last_error || !existing.creative_id) return true;
  const refreshedAt = Date.parse(existing.refreshed_at);
  return (
    !Number.isFinite(refreshedAt) ||
    now.getTime() - refreshedAt >= CREATIVE_REFRESH_TTL_MS
  );
}

export function canReuseCreativePreview(
  existing: ExistingCreative | undefined,
  creativeId: string | null,
  creativeType: MetaCreativeType = "unknown",
): boolean {
  const reusable =
    !!existing?.creative_id &&
    existing.creative_id === creativeId &&
    !!existing.preview_storage_path &&
    !!existing.preview_mime_type &&
    !!existing.preview_sha256;
  if (!reusable) return false;
  // Existing-file upgrades require an explicit selective mode. Publishing the
  // function alone must not launch a bulk replacement through the existing cron.
  return true;
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

function extensionForMime(mime: string): string {
  return (
    (
      {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/avif": "avif",
      } as Record<string, string>
    )[mime] ?? "bin"
  );
}

export function buildCreativeStoragePath(
  clientId: number,
  accountId: string,
  adId: string,
  creativeId: string | null,
  mime: string,
  contentSha256?: string,
): string {
  const contentSuffix = contentSha256
    ? `-${safeSegment(contentSha256.slice(0, 12))}`
    : "";
  return [
    String(clientId),
    "meta_ads",
    safeSegment(accountId),
    "ad",
    safeSegment(adId),
    `${safeSegment(creativeId ?? "unknown")}${contentSuffix}.${extensionForMime(mime)}`,
  ].join("/");
}

export function buildCreativeDatabaseRow(args: {
  clientId: number;
  ref: CreativeAdRef;
  creative: NormalizedMetaCreative;
  preview?: { path: string; mime: string; sha256: string } | null;
  error?: string | null;
  nowIso: string;
}) {
  return {
    client_id: args.clientId,
    source: "meta_ads",
    account_id: args.ref.account_id,
    entity_type: "ad",
    entity_id: args.ref.ad_id,
    ad_id: args.ref.ad_id,
    ad_name: args.ref.ad_name,
    campaign_id: args.ref.campaign_id,
    campaign_name: args.ref.campaign_name,
    adset_id: args.ref.adset_id,
    adset_name: args.ref.adset_name,
    creative_id: args.creative.creativeId,
    creative_name: args.creative.creativeName,
    creative_type: args.creative.creativeType,
    preview_kind: args.preview ? args.creative.previewKind : "unavailable",
    preview_storage_path: args.preview?.path ?? null,
    preview_mime_type: args.preview?.mime ?? null,
    preview_sha256: args.preview?.sha256 ?? null,
    metadata: args.creative.metadata,
    last_error: args.error ?? null,
    source_updated_at: args.creative.sourceUpdatedAt,
    refreshed_at: args.nowIso,
    last_seen_at: args.nowIso,
    updated_at: args.nowIso,
  };
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function downloadPreview(
  url: string,
  fetchImpl: typeof fetch,
): Promise<DownloadedPreview> {
  const response = await fetchMedia(url, fetchImpl);
  const mime = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime)) {
    await response.body?.cancel();
    throw new PreviewError("preview_mime");
  }
  const bytes = await readLimitedBody(response);
  return {
    bytes,
    mime,
    sha256: await sha256(bytes),
    ...inspectImage(bytes, mime),
  };
}

export function readImageDimensions(
  bytes: Uint8Array,
  mime: string,
): { width: number | null; height: number | null } {
  try {
    return inspectImage(bytes, mime);
  } catch {
    return { width: null, height: null };
  }
}

export function selectBestVideoThumbnail(
  thumbnails: Array<Record<string, unknown>>,
): VideoPreviewCandidate | null {
  const candidates = thumbnails.flatMap((thumbnail) => {
    const url = stringValue(thumbnail.uri) ?? stringValue(thumbnail.url);
    const width = Number(thumbnail.width);
    const height = Number(thumbnail.height);
    if (
      !url ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    )
      return [];
    return [
      {
        url,
        source: "video.thumbnails",
        policy: "video_high_res_thumbnail" as const,
        width,
        height,
        preferred: thumbnail.is_preferred === true,
      },
    ];
  });
  // Legacy metadata hint only; final selection MUST use resolveCreativePreview.
  const selected = candidates.sort(
    (left, right) =>
      (right.width ?? 0) * (right.height ?? 0) -
      (left.width ?? 0) * (left.height ?? 0),
  )[0];
  if (!selected) return null;
  return {
    ...selected,
    policy: selected.preferred
      ? "video_preferred_thumbnail"
      : "video_high_res_thumbnail",
  };
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results = new Array<PromiseSettledResult<R>>(values.length);
  let cursor = 0;

  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      try {
        results[index] = {
          status: "fulfilled",
          value: await worker(values[index]),
        };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => run()),
  );
  return results;
}

async function fetchMetaAds(
  apiVersion: string,
  accessToken: string,
  accountId: string,
  adIds: string[],
  fetchImpl: typeof fetch,
): Promise<MetaAdPayload[]> {
  const ads: MetaAdPayload[] = [];
  const url = new URL(
    `https://graph.facebook.com/${apiVersion}/act_${encodeURIComponent(accountId)}/ads`,
  );
  url.searchParams.set(
    "fields",
    [
      "id",
      "name",
      "status",
      "updated_time",
      "campaign{id,name}",
      "adset{id,name}",
      "creative{id,name,object_type,thumbnail_url,image_url,image_hash,video_id,effective_object_story_id,object_story_spec,asset_feed_spec}",
    ].join(","),
  );
  url.searchParams.set(
    "filtering",
    JSON.stringify([{ field: "id", operator: "IN", value: adIds }]),
  );
  url.searchParams.set("limit", String(META_AD_BATCH_SIZE));

  let next: string | null = url.toString(),
    pages = 0;
  while (next && pages++ < 5) {
    const payload = await graphJson(next, accessToken, fetchImpl);
    ads.push(...(payload.data ?? []));
    next = payload.paging?.next ?? null;
  }
  if (next)
    throw new CreativeRequestError("Ad page limit", "meta_ad_page_limit");
  return ads;
}

async function graphJson(
  raw: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<any> {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "graph.facebook.com" ||
    url.username ||
    url.password ||
    url.port
  )
    throw new CreativeRequestError("Untrusted Graph URL", "meta_url_untrusted");
  const response = await fetchImpl(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  if (!response.ok || payload.error)
    throw new CreativeRequestError(
      "Meta lookup failed",
      payload.error?.code
        ? `meta_${Number(payload.error.code)}`
        : `meta_http_${response.status}`,
    );
  return payload;
}

export async function fetchVideoCandidates(
  apiVersion: string,
  accessToken: string,
  videoId: string,
  fetchImpl: typeof fetch,
) {
  const candidates: VideoPreviewCandidate[] = [],
    errors: string[] = [];
  const url = new URL(
    `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(videoId)}/thumbnails`,
  );
  url.searchParams.set("fields", "height,width,uri,is_preferred");
  url.searchParams.set("limit", "50");
  let next: string | null = url.toString(),
    pages = 0;
  try {
    const visited = new Set<string>();
    while (next && pages++ < 6) {
      if (visited.has(next)) { errors.push("meta_thumbnail_page_cycle"); break; }
      visited.add(next);
      const payload = await graphJson(next, accessToken, fetchImpl);
      for (const thumbnail of arrayValue(payload.data)) {
        const uri = stringValue(thumbnail.uri);
        if (uri)
          candidates.push({
            url: uri,
            source: "video.thumbnails",
            policy: thumbnail.is_preferred
              ? "video_preferred_thumbnail"
              : "video_high_res_thumbnail",
            width: Number(thumbnail.width) || null,
            height: Number(thumbnail.height) || null,
            preferred: thumbnail.is_preferred === true,
          });
      }
      next = payload.paging?.next ?? null;
    }
    if (next) errors.push("meta_thumbnail_page_limit");
  } catch (error) {
    errors.push(safeErrorCode(error));
    errors.push("meta_thumbnail_collection_incomplete");
  }
  // format dimensions refer to video, so never trust them as picture dimensions.
  try {
    const videoUrl = new URL(
      `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(videoId)}`,
    );
    videoUrl.searchParams.set("fields", "format,picture");
    const payload = await graphJson(
      videoUrl.toString(),
      accessToken,
      fetchImpl,
    );
    const native = arrayValue(payload.format).find((f) => f.filter === "native");
    const originalRatio = native && Number(native.width) > 0 && Number(native.height) > 0
      ? Number(native.width) / Number(native.height) : undefined;
    for (const candidate of candidates) candidate.originalRatio = originalRatio;
    for (const format of arrayValue(payload.format)) {
      const picture = stringValue(format.picture);
      if (picture)
        candidates.push({
          url: picture,
          source: "video.format.picture",
          policy: "video_format_thumbnail",
          width: Number(format.width) || null,
          height: Number(format.height) || null,
          preferred: false,
          originalRatio,
        });
    }
    if (stringValue(payload.picture))
      candidates.push({
        url: payload.picture,
        source: "video.picture",
        policy: "video_thumbnail_fallback",
        width: null,
        height: null,
        preferred: false,
        originalRatio,
      });
  } catch (error) {
    errors.push(safeErrorCode(error));
  }
  return {
    candidates: deduplicateCandidates(candidates),
    errors: [...new Set(errors)],
  };
}

// Kept for the existing external helper contract; enrichment compares ALL results.
export async function fetchBestVideoThumbnail(
  apiVersion: string,
  accessToken: string,
  videoId: string,
  fetchImpl: typeof fetch,
): Promise<VideoPreviewCandidate | null> {
  const { candidates } = await fetchVideoCandidates(
    apiVersion,
    accessToken,
    videoId,
    fetchImpl,
  );
  const resolved = await resolveCreativePreview(
    normalizeMetaCreative({ creative:{object_type:"VIDEO",video_id:videoId} }), candidates, fetchImpl,
  );
  return resolved.selected ? {...resolved.selected.candidate,width:resolved.selected.file.width,height:resolved.selected.file.height} : null;
}

async function fetchImageCandidates(
  apiVersion: string,
  token: string,
  accountId: string,
  hashes: string[],
  fetchImpl: typeof fetch,
): Promise<Map<string, VideoPreviewCandidate>> {
  const found = new Map<string, VideoPreviewCandidate>();
  for (const group of chunks([...new Set(hashes)], 25)) {
    const url = new URL(
      `https://graph.facebook.com/${apiVersion}/act_${accountId}/adimages`,
    );
    url.searchParams.set("hashes", JSON.stringify(group));
    url.searchParams.set("fields", "hash,url,width,height");
    const payload = await graphJson(url.toString(), token, fetchImpl);
    for (const image of arrayValue(payload.data)) {
      if (!group.includes(String(image.hash)) || !stringValue(image.url))
        continue;
      found.set(String(image.hash), {
        url: String(image.url),
        source: "ad_account.adimages.url",
        policy: "original_image",
        width: Number(image.width) || null,
        height: Number(image.height) || null,
        preferred: false,
      });
    }
  }
  return found;
}

export async function fetchAccountVideoPictures(
  apiVersion: string,
  accessToken: string,
  accountId: string,
  targetVideoIds: string[],
  fetchImpl: typeof fetch,
): Promise<Map<string, VideoPreviewCandidate>> {
  const remaining = new Set(targetVideoIds);
  const found = new Map<string, VideoPreviewCandidate>();
  if (remaining.size === 0) return found;

  const url = new URL(
    `https://graph.facebook.com/${apiVersion}/act_${accountId}/advideos`,
  );
  url.searchParams.set("fields", "id,picture");
  url.searchParams.set("limit", "100");
  let next: string | null = url.toString();
  let pages = 0;

  try {
    while (next && remaining.size > 0 && pages < 3) {
      pages++;
      const payload = await graphJson(next, accessToken, fetchImpl);
      for (const video of payload.data ?? []) {
        const id = stringValue(video.id);
        const picture = stringValue(video.picture);
        if (!id || !picture || !remaining.has(id)) continue;
        found.set(id, {
          url: picture,
          source: "ad_account.advideos.picture",
          policy: "video_account_picture",
          width: null,
          height: null,
          preferred: false,
        });
        remaining.delete(id);
      }
      next = payload.paging?.next ?? null;
    }
  } catch {
    // Keep the existing creative image when the account video library is unavailable.
  }

  return found;
}

const MAX_CANDIDATES = 320;
function deduplicateCandidates(
  candidates: VideoPreviewCandidate[],
): VideoPreviewCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

export async function resolveCreativePreview(
  creative: NormalizedMetaCreative,
  extra: VideoPreviewCandidate[],
  fetchImpl: typeof fetch,
  frameFallback?: () => Promise<{ videoId: string; bytes: Uint8Array<ArrayBuffer>; mime: string } | null>,
  reviewedThumbnail?: ReviewedThumbnail,
) {
  // API hints and is_preferred never exclude a candidate or determine its quality.
  const video = creative.metadata.preview_media_type === "video" || creative.creativeType === "video";
  const all = deduplicateCandidates([...(creative.candidates ?? []), ...extra]);
  const official = video ? all.filter(c => c.source === "video.thumbnails") : [];
  const fallback = video ? all.filter(c => c.source !== "video.thumbnails") : all;
  const candidates = [...official, ...fallback];
  const originalRatio = extra.find(c => c.originalRatio)?.originalRatio;
  let selected: {
    candidate: VideoPreviewCandidate;
    file: DownloadedPreview;
  } | null = null;
  let reviewed: {candidate:VideoPreviewCandidate;file:DownloadedPreview} | null = null;
  let matched: {candidate:VideoPreviewCandidate;file:DownloadedPreview;valid:boolean} | null = null;
  const comparisons: Array<Record<string, unknown>> = [];
  const required = reviewedThumbnail?.required === true;
  const diagnostic = (code: string): ApprovedPreviewDiagnostic | undefined => required ? {
    code, approved_sha256: reviewedThumbnail!.sha256, candidate_count: candidates.length,
    measured_count: comparisons.filter(c => typeof c.sha256 === 'string').length,
    download_failure_count: comparisons.filter(c => c.sha256 === undefined && c.result !== 'candidate_limit').length,
    matched_sha256: matched?.file.sha256 ?? null, general_selected_sha256: selected?.file.sha256 ?? null,
  } : undefined;
  if (required && reviewedThumbnail!.videoId !== creative.videoId) {
    return {selected:null,comparisons,inspected:0,visuallyReviewed:false,approval:diagnostic('preview_approved_identity_mismatch')};
  }
  if (candidates.length > MAX_CANDIDATES) {
    comparisons.push({result:"candidate_limit",omitted:candidates.length-MAX_CANDIDATES});
    return {selected:null,comparisons,inspected:0,visuallyReviewed:false,approval:diagnostic('preview_approved_candidate_limit')};
  }
  let inspected = 0;
  for (const candidate of candidates.slice(0, MAX_CANDIDATES)) {
    // Finish the entire official collection before considering alternate artwork.
    if (!required && selected?.candidate.source === "video.thumbnails" && video && candidate.source !== "video.thumbnails" &&
        videoPreviewQuality({width:selected.file.width!,height:selected.file.height!},originalRatio) === "full_hd") break;
    inspected++;
    try {
      const file = await downloadPreview(candidate.url, fetchImpl);
      const quality = video ? videoPreviewQuality({ width:file.width!, height:file.height! }, originalRatio) : null;
      comparisons.push({
        candidate_index: inspected - 1,
        source: candidate.source,
        width: file.width,
        height: file.height,
        sha256: file.sha256,
        bytes: file.bytes.length,
        preferred: candidate.preferred,
        quality,
        result: quality === "insufficient" ? "below_hd_or_ratio_mismatch" : "valid",
      });
      if (required && reviewedThumbnail!.sha256 === file.sha256) matched = {candidate,file,valid:quality !== 'insufficient'};
      if (quality === "insufficient") continue;
      if (candidate.source === "video.thumbnails" && reviewedThumbnail?.videoId === creative.videoId &&
          reviewedThumbnail.sha256 === file.sha256) reviewed = {candidate,file};
      if (
        !selected ||
        (video ?
          (quality === "full_hd" && videoPreviewQuality({width:selected.file.width!,height:selected.file.height!},originalRatio) !== "full_hd") ||
          (quality === videoPreviewQuality({width:selected.file.width!,height:selected.file.height!},originalRatio) && file.width! * file.height! > selected.file.width! * selected.file.height!)
          : improves(
          { width: file.width!, height: file.height! },
          { width: selected.file.width!, height: selected.file.height! },
        ))
      )
        selected = { candidate, file };
    } catch (error) {
      comparisons.push({
        candidate_index: inspected - 1,
        source: candidate.source,
        result: safeErrorCode(error),
      });
    }
  }
  if (reviewed && selected && reviewed.file.width! >= selected.file.width! && reviewed.file.height! >= selected.file.height!) {
    selected = reviewed;
  }
  if (required) {
    const code = matched ? !matched.valid ? 'preview_approved_file_invalid'
      : selected?.file.sha256 === matched.file.sha256 ? 'preview_approved_hash_valid' : 'preview_approved_hash_found_not_selected'
      : comparisons.some(c=>c.sha256===undefined) ? 'preview_approved_download_unconfirmed' : 'preview_approved_hash_not_found';
    const approval = diagnostic(code);
    // An explicit authorization binds bytes, not the winner of quality ranking.
    // A missing/invalid match never silently accepts another candidate or frame.
    selected = matched?.valid ? {candidate:matched.candidate,file:matched.file} : null;
    return {selected,comparisons,inspected,visuallyReviewed:!!selected,approval};
  }
  // Callback is absent in the deployed endpoint: no recurrent video processing.
  if (!selected && video && creative.videoId && frameFallback) {
    try {
      const frame = await frameFallback();
      if (frame) {
        if (frame.videoId !== creative.videoId) throw new PreviewError("frame_identity_mismatch");
        if (frame.bytes.length > MAX_PREVIEW_BYTES) throw new PreviewError("preview_size_limit");
        const dims = inspectImage(frame.bytes, frame.mime);
        const quality = videoPreviewQuality(dims, originalRatio);
        comparisons.push({source:"video.local_frame",...dims,quality,result:quality === "insufficient" ? "below_hd_or_ratio_mismatch" : "valid"});
        if (quality !== "insufficient") selected = {
          candidate:{url:"",source:"video.local_frame",policy:"explicit_frame_fallback",width:dims.width,height:dims.height,preferred:false},
          file:{bytes:frame.bytes,mime:frame.mime,sha256:await sha256(frame.bytes),...dims},
        };
      }
    } catch (error) { comparisons.push({source:"video.local_frame",result:safeErrorCode(error)}); }
  }
  return { selected, comparisons, inspected, visuallyReviewed: !!selected && selected === reviewed, approval:undefined };
}

function mergedMetadata(
  previous: ExistingCreative | undefined,
  creative: NormalizedMetaCreative,
) {
  return {
    ...previous?.metadata,
    ...Object.fromEntries(
      Object.entries(creative.metadata).filter(
        ([, v]) => v !== null && v !== undefined,
      ),
    ),
  };
}
function currentPreview(
  current: ExistingCreative | undefined,
  clientId: number,
  ref: CreativeAdRef,
) {
  if (
    !current?.preview_storage_path ||
    !current.preview_mime_type ||
    !current.preview_sha256
  )
    return null;
  const prefix = `${clientId}/meta_ads/${safeSegment(ref.account_id)}/ad/${safeSegment(ref.ad_id)}/`;
  if (!current.preview_storage_path.startsWith(prefix))
    throw new PreviewError("preview_storage_scope");
  return {
    path: current.preview_storage_path,
    mime: current.preview_mime_type,
    sha256: current.preview_sha256,
  };
}

function refFromRow(row: Record<string, unknown>): CreativeAdRef | null {
  const accountId = stringValue(row.account_id);
  const adId = stringValue(row.ad_id);
  if (!accountId || !adId) return null;
  return {
    account_id: accountId,
    ad_id: adId,
    ad_name: stringValue(row.ad_name),
    campaign_id: stringValue(row.campaign_id),
    campaign_name: stringValue(row.campaign_name),
    adset_id: stringValue(row.adset_id),
    adset_name: stringValue(row.adset_name),
  };
}

async function collectAdRefs(options: EnrichOptions): Promise<CreativeAdRef[]> {
  const refs = new Map<string, CreativeAdRef>();
  for (const row of options.adRows) {
    const ref = refFromRow(row);
    if (
      ref &&
      options.accountIds.includes(ref.account_id) &&
      (!options.previewAdIds || options.previewAdIds.includes(ref.ad_id))
    )
      refs.set(`${ref.account_id}:${ref.ad_id}`, ref);
  }

  for (const accountId of options.accountIds) {
    if (options.previewAdIds) {
      const { data, error } = await options.supabase
        .from("dashboard_creative_previews")
        .select(
          "account_id,ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name",
        )
        .eq("client_id", options.clientId)
        .eq("source", "meta_ads")
        .eq("entity_type", "ad")
        .eq("account_id", accountId)
        .in("ad_id", options.previewAdIds);
      if (error)
        throw new CreativeRequestError(
          "Failed to load selection",
          "preview_selection_read",
        );
      for (const row of data ?? []) {
        const ref = refFromRow(row);
        if (
          ref &&
          ref.account_id === accountId &&
          options.previewAdIds.includes(ref.ad_id)
        )
          refs.set(`${ref.account_id}:${ref.ad_id}`, ref);
      }
      continue;
    }
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await options.supabase
        .from("dashboard_ad_daily")
        .select(
          "account_id,ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name",
        )
        .eq("client_id", options.clientId)
        .eq("source", "meta_ads")
        .eq("account_id", accountId)
        .gte("metric_date", options.startDate)
        .lte("metric_date", options.endDate)
        .range(offset, offset + 999);
      if (error) {
        throw new Error(`Failed to load Meta ad references: ${error.message}`);
      }
      for (const row of data ?? []) {
        const ref = refFromRow(row);
        if (ref && options.accountIds.includes(ref.account_id))
          refs.set(`${ref.account_id}:${ref.ad_id}`, ref);
      }
      if ((data ?? []).length < 1000) break;
    }
  }

  return [...refs.values()].sort((left, right) =>
    `${left.account_id}:${left.ad_id}`.localeCompare(
      `${right.account_id}:${right.ad_id}`,
    ),
  );
}

async function loadExisting(
  supabase: SupabaseLike,
  clientId: number,
  refs: CreativeAdRef[],
): Promise<Map<string, ExistingCreative>> {
  const result = new Map<string, ExistingCreative>();
  for (const group of chunks(refs, 50)) {
    const { data, error } = await supabase
      .from("dashboard_creative_previews")
      .select(
        "account_id,entity_id,creative_id,creative_type,preview_kind,preview_storage_path,preview_mime_type,preview_sha256,metadata,last_error,refreshed_at,updated_at,creative_name,source_updated_at",
      )
      .eq("client_id", clientId)
      .eq("source", "meta_ads")
      .eq("entity_type", "ad")
      .in("account_id", [...new Set(group.map((ref) => ref.account_id))])
      .in(
        "entity_id",
        group.map((ref) => ref.ad_id),
      );
    if (error) {
      throw new Error(`Failed to load creative previews: ${error.message}`);
    }
    for (const row of data ?? []) {
      if (
        group.some(
          (ref) =>
            ref.account_id === row.account_id && ref.ad_id === row.entity_id,
        )
      )
        result.set(
          `${row.account_id}:${row.entity_id}`,
          row as ExistingCreative,
        );
    }
  }
  return result;
}

function safeErrorCode(error: unknown): string {
  if (error instanceof CreativeRequestError || error instanceof PreviewError)
    return error.code;
  return "creative_unknown";
}

function emptyCreative(): NormalizedMetaCreative {
  return {
    creativeId: null,
    creativeName: null,
    creativeType: "unknown",
    previewKind: "unavailable",
    previewUrl: null,
    videoId: null,
    videoIdSource: null,
    videoFallbacks: [],
    metadata: { representative_policy: "none" },
    sourceUpdatedAt: null,
  };
}

export async function enrichMetaCreativePreviews(
  options: EnrichOptions,
): Promise<CreativeEnrichmentStats> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const fetchImpl = options.fetchImpl ?? fetch;
  const collectedRefs = await collectAdRefs(options);
  const existing = await loadExisting(
    options.supabase,
    options.clientId,
    collectedRefs,
  );
  const refs = options.videoRefreshOnly
    ? collectedRefs.filter(
        (ref) =>
          existing.get(`${ref.account_id}:${ref.ad_id}`)?.creative_type ===
            "video" ||
          (existing.get(`${ref.account_id}:${ref.ad_id}`)?.creative_type ===
            "dynamic" &&
            !!existing.get(`${ref.account_id}:${ref.ad_id}`)?.metadata
              ?.video_id),
      )
    : collectedRefs;
  const candidates = refs.filter((ref) => {
    const current = existing.get(`${ref.account_id}:${ref.ad_id}`);
    if (options.videoRefreshOnly || options.previewAdIds) return true;
    return isCreativePreviewStale(current, now);
  });
  const stats: CreativeEnrichmentStats = {
    inspected: refs.length,
    inserted: 0,
    updated: 0,
    reused: refs.length - candidates.length,
    preview_downloaded: 0,
    failed: 0,
    would_insert: 0,
    would_update: 0,
    video_high_res_resolved: 0,
    video_ids_resolved: 0,
    video_thumbnail_candidates: 0,
    video_account_picture_resolved: 0,
    video_preferred_thumbnail: 0,
    video_thumbnail_fallback: 0,
    video_preview_failed: 0,
    failures: [],
    decisions: [],
  };

  if (!options.dryRun) {
    const freshRefs = refs.filter((ref) => !candidates.includes(ref));
    for (const group of chunks(freshRefs, 50)) {
      const { error } = await options.supabase
        .from("dashboard_creative_previews")
        .update({ last_seen_at: nowIso })
        .eq("client_id", options.clientId)
        .eq("source", "meta_ads")
        .eq("entity_type", "ad")
        .in("account_id", [...new Set(group.map((ref) => ref.account_id))])
        .in(
          "entity_id",
          group.map((ref) => ref.ad_id),
        );
      if (error) {
        throw new Error(
          `Failed to refresh creative presence: ${error.message}`,
        );
      }
    }
  }

  const fetched = new Map<string, MetaAdPayload>();
  const fetchFailures = new Map<string, string>();
  const jobs = options.accountIds.flatMap((accountId) => {
    const ids = candidates
      .filter((ref) => ref.account_id === accountId)
      .map((ref) => ref.ad_id);
    return chunks(ids, META_AD_BATCH_SIZE).map((adIds) => ({
      accountId,
      adIds,
    }));
  });

  const fetchedGroups = await mapWithConcurrency(
    jobs,
    CREATIVE_CONCURRENCY,
    async (job) => ({
      job,
      ads: await fetchMetaAds(
        options.apiVersion,
        options.accessToken,
        job.accountId,
        job.adIds,
        fetchImpl,
      ),
    }),
  );

  fetchedGroups.forEach((result, index) => {
    const job = jobs[index];
    if (result.status === "fulfilled") {
      for (const ad of result.value.ads) {
        if (ad.id) fetched.set(`${job.accountId}:${ad.id}`, ad);
      }
      for (const adId of job.adIds) {
        if (!fetched.has(`${job.accountId}:${adId}`))
          fetchFailures.set(`${job.accountId}:${adId}`, "meta_ad_not_returned");
      }
    } else {
      const code = safeErrorCode(result.reason);
      for (const adId of job.adIds)
        fetchFailures.set(`${job.accountId}:${adId}`, code);
    }
  });

  const normalized = new Map<string, NormalizedMetaCreative>();
  for (const [adId, ad] of fetched) {
    const ref = candidates.find(
      (ref) => `${ref.account_id}:${ref.ad_id}` === adId,
    );
    normalized.set(
      adId,
      normalizeMetaCreative(
        ad,
        ref ? existing.get(`${ref.account_id}:${ref.ad_id}`) : undefined,
      ),
    );
  }
  // Only inspect media which cannot be safely reused at the current strategy version.
  const needsMedia = (ref: CreativeAdRef) => {
    const creative = normalized.get(`${ref.account_id}:${ref.ad_id}`);
    return (
      creative &&
      (options.videoRefreshOnly ||
        options.previewAdIds ||
        !canReuseCreativePreview(
          existing.get(`${ref.account_id}:${ref.ad_id}`),
          creative.creativeId,
          creative.creativeType,
        ))
    );
  };
  const mediaRefs = candidates.filter(needsMedia);
  const videoIds = [
    ...new Set(
      mediaRefs.flatMap((ref) =>
        normalized.get(`${ref.account_id}:${ref.ad_id}`)?.videoId
          ? [normalized.get(`${ref.account_id}:${ref.ad_id}`)!.videoId!]
          : [],
      ),
    ),
  ];
  const videoCandidates = new Map<string, VideoPreviewCandidate[]>();
  const lookupErrors = new Map<string, string[]>();
  stats.video_ids_resolved = videoIds.length;
  const videoResults = await mapWithConcurrency(
    videoIds,
    CREATIVE_CONCURRENCY,
    async (videoId) => ({
      videoId,
      ...(await fetchVideoCandidates(
        options.apiVersion,
        options.accessToken,
        videoId,
        fetchImpl,
      )),
    }),
  );
  for (const result of videoResults)
    if (result.status === "fulfilled") {
      videoCandidates.set(result.value.videoId, result.value.candidates);
      lookupErrors.set(result.value.videoId, result.value.errors);
    }
  const imageCandidates = new Map<string, VideoPreviewCandidate>();
  for (const accountId of options.accountIds) {
    const accountRefs = mediaRefs.filter((ref) => ref.account_id === accountId);
    // Account-library pagination is a fallback, not an unconditional full scan.
    const missingVideos = [
      ...new Set(
        accountRefs.flatMap((ref) => {
          const id = normalized.get(`${ref.account_id}:${ref.ad_id}`)?.videoId;
          return id && !videoCandidates.get(id)?.length ? [id] : [];
        }),
      ),
    ];
    const pictures = await fetchAccountVideoPictures(
      options.apiVersion,
      options.accessToken,
      accountId,
      missingVideos,
      fetchImpl,
    );
    for (const [id, picture] of pictures)
      videoCandidates.set(id, [...(videoCandidates.get(id) ?? []), picture]);
    const hashes = accountRefs.flatMap((ref) =>
      normalized.get(`${ref.account_id}:${ref.ad_id}`)?.imageHash
        ? [normalized.get(`${ref.account_id}:${ref.ad_id}`)!.imageHash!]
        : [],
    );
    try {
      const images = await fetchImageCandidates(
        options.apiVersion,
        options.accessToken,
        accountId,
        hashes,
        fetchImpl,
      );
      for (const [hash, candidate] of images)
        imageCandidates.set(`${accountId}:${hash}`, candidate);
    } catch (error) {
      for (const ref of accountRefs)
        lookupErrors.set(ref.ad_id, [safeErrorCode(error)]);
    }
  }
  for (const id of videoIds) {
    const override = options.videoPictureOverrides?.[id];
    if (override)
      videoCandidates.set(id, [
        ...(videoCandidates.get(id) ?? []),
        {
          url: override,
          source: "official_meta_connector.picture",
          policy: "video_account_picture",
          width: null,
          height: null,
          preferred: false,
        },
      ]);
  }
  stats.video_thumbnail_candidates = [...videoCandidates.values()].reduce(
    (sum, items) => sum + items.length,
    0,
  );

  // Small per-run cache: shared videos may serve several ads of the SAME account.
  // Keep only selected bytes, never all downloaded candidates or a permanent cache.
  const resolutions = new Map<string, Promise<Awaited<ReturnType<typeof resolveCreativePreview>>>>();
  const resolve = (creative: NormalizedMetaCreative, extras: VideoPreviewCandidate[], ref: CreativeAdRef, reviewedThumbnail?: ReviewedThumbnail) => {
    const key = JSON.stringify([ref.account_id, creative.videoId, creative.assetKey,
      [...(creative.candidates ?? []), ...extras].map(c=>c.url),reviewedThumbnail]);
    if (!options.frameFallback && creative.videoId && resolutions.has(key)) return resolutions.get(key)!;
    const result = resolveCreativePreview(creative, extras, fetchImpl,
      options.frameFallback && creative.videoId
        ? () => options.frameFallback!({accountId:ref.account_id,adId:ref.ad_id,creativeId:creative.creativeId,videoId:creative.videoId!})
        : undefined, reviewedThumbnail);
    if (!options.frameFallback && creative.videoId) {
      if (resolutions.size >= CREATIVE_CONCURRENCY) resolutions.delete(resolutions.keys().next().value!);
      resolutions.set(key,result);
    }
    return result;
  };

  const manifestPin = options.approvedManifestPin ?? defaultManifestPin;
  let manifest: ReturnType<typeof loadApprovedSources> | undefined;
  const processed = await mapWithConcurrency(
    candidates,
    CREATIVE_CONCURRENCY,
    async (ref) => {
      const current = existing.get(`${ref.account_id}:${ref.ad_id}`);
      const snapshot=options.reservationSelection?.ads.find(a=>a.ad_id===ref.ad_id);
      if(options.reservationSelection&&(!snapshot||current?.creative_id!==snapshot.creative_id
        ||current?.updated_at!==snapshot.previous_updated_at
        ||(current?.preview_sha256??null)!==snapshot.previous_sha256||(current?.preview_storage_path??null)!==snapshot.previous_path
        ||(current?.metadata?.video_id??null)!==snapshot.video_id||(current?.metadata?.preview_asset_key??null)!==snapshot.asset_key))
        throw new PreviewError('preview_reservation_snapshot_conflict');
      const ad = fetched.get(`${ref.account_id}:${ref.ad_id}`);
      const fetchFailure = fetchFailures.get(`${ref.account_id}:${ref.ad_id}`);
      if (!ad || fetchFailure) {
        const code = fetchFailure ?? "meta_ad_not_returned";
        if (!options.dryRun) {
          const query = current
            ? options.supabase
                .from("dashboard_creative_previews")
                .update({
                  last_error: code,
                  metadata: {
                    ...current.metadata,
                    preview_last_attempt: {
                      at: nowIso,
                      result: "preserved_api_error",
                      code,
                    },
                  },
                  refreshed_at: nowIso,
                  updated_at: nowIso,
                })
                .eq("client_id", options.clientId)
                .eq("source", "meta_ads")
                .eq("account_id", ref.account_id)
                .eq("entity_type", "ad")
                .eq("entity_id", ref.ad_id)
                .eq("updated_at", current.updated_at)
            : options.supabase.from("dashboard_creative_previews").insert(
                buildCreativeDatabaseRow({
                  clientId: options.clientId,
                  ref,
                  creative: emptyCreative(),
                  error: code,
                  nowIso,
                }),
              );
          const { error } = await query;
          if (error) {
            throw new CreativeRequestError(error.message, "database_upsert");
          }
        }
        return {
          kind: "failed" as const,
          adId: ref.ad_id,
          code,
          existed: !!current,
        };
      }

      let creative =
        normalized.get(`${ref.account_id}:${ref.ad_id}`) ??
        normalizeMetaCreative(ad, current);
      const oldPreview = currentPreview(current, options.clientId, ref);
      const sameIdentity =
        current?.creative_id === creative.creativeId &&
        creative.representationCertain !== false &&
        (!current?.metadata?.preview_asset_key ||
          current.metadata.preview_asset_key === creative.assetKey);
      const reuse =
        sameIdentity &&
        !options.videoRefreshOnly &&
        !options.previewAdIds &&
        canReuseCreativePreview(
          current,
          creative.creativeId,
          creative.creativeType,
        );
      const extras = [
        ...(creative.videoId
          ? (videoCandidates.get(creative.videoId) ?? [])
          : []),
      ];
      const originalImage = creative.imageHash
        ? imageCandidates.get(`${ref.account_id}:${creative.imageHash}`)
        : undefined;
      if (originalImage) extras.push(originalImage);
      const reviewed = objectValue(current?.metadata?.preview_reviewed_thumbnail);
      const approved=options.reservationSelection?.approved_assets.find(a=>a.ad_id===ref.ad_id);
      const reviewedThumbnail: ReviewedThumbnail | undefined = approved ? {videoId:approved.video_id ?? creative.videoId ?? '',sha256:approved.sha256,required:true}
        : reviewed?.video_id === creative.videoId && /^[a-f0-9]{64}$/.test(String(reviewed?.sha256))
        ? {videoId:creative.videoId!,sha256:String(reviewed!.sha256)} : undefined;
      let collectionIncomplete = !!creative.videoId && (lookupErrors.get(creative.videoId) ?? []).some(code =>
        ["meta_thumbnail_page_limit", "meta_thumbnail_page_cycle", "meta_thumbnail_collection_incomplete"].includes(code));
      let directSource: BoundApprovedSource | undefined;
      let restoreOrigin: string | undefined;
      if (approved && manifestPin.ad_ids.includes(ref.ad_id)) {
        if (!snapshot || !sameIdentity) throw new PreviewError('preview_approved_identity_mismatch');
        manifest ??= loadApprovedSources(manifestPin);
        const entries=await manifest;
        const source=entries.find(e=>e.ad_id===ref.ad_id);
        const upgradePath=source?buildCreativeStoragePath(options.clientId,ref.account_id,ref.ad_id,source.creative_id,source.mime,source.sha256):undefined;
        directSource = bindApprovedSource(entries, options.clientId, ref.account_id, approved, snapshot, creative,upgradePath);
        if(directSource.intent==='restore_previous')restoreOrigin=await confirmedUpgradeForRestore(options.supabase,directSource,snapshot);
      }
      const restoring=directSource?.intent==='restore_previous';
      const directResolution = async (source: BoundApprovedSource) => {
        let file: DownloadedPreview;
        if(source.intent==='restore_previous'){
          const {data,error}=await options.supabase.storage.from(CREATIVE_BUCKET).download(source.previous.path);
          if(error||!data||data.size>MAX_PREVIEW_BYTES)throw new PreviewError('preview_restore_object_unverified');
          const bytes=new Uint8Array(await data.arrayBuffer());
          if(bytes.length>MAX_PREVIEW_BYTES||await sha256(bytes)!==source.previous.sha256)throw new PreviewError('preview_restore_object_unverified');
          file={bytes,mime:source.previous.mime,sha256:source.previous.sha256,...inspectImage(bytes,source.previous.mime)};
        } else {
          file = await downloadPreview(source.url, fetchImpl);
          if(file.sha256!==source.sha256) throw new PreviewError('preview_approved_reference_hash_mismatch');
          if(file.mime!==source.mime || file.width!==source.width || file.height!==source.height ||
            videoPreviewQuality({width:file.width!,height:file.height!},9/16)==='insufficient')
            throw new PreviewError('preview_approved_reference_file_invalid');
        }
        const candidate = {url:source.intent==='restore_previous'?'':source.url,source:source.intent==='restore_previous'?'approved.previous_private_object':'approved.official_reference',policy:source.intent==='restore_previous'?'restored_previous':'approved_reference_exact_hash',width:file.width,height:file.height,preferred:false};
        return {selected:{candidate,file},comparisons:[{source:candidate.source,result:'valid',sha256:file.sha256,width:file.width,height:file.height}] as Array<Record<string,unknown>>,
          visuallyReviewed:true,approval:{code:restoring?'preview_approved_restore_valid':'preview_approved_reference_valid',approved_sha256:file.sha256,candidate_count:1,measured_count:1,download_failure_count:0,matched_sha256:file.sha256,general_selected_sha256:null}};
      };
      const resolved = directSource ? await directResolution(directSource) :
        reuse || (oldPreview && !sameIdentity) || collectionIncomplete
          ? {
              selected: null,
              comparisons: [] as Array<Record<string, unknown>>,
              visuallyReviewed: false,
              approval: undefined as ApprovedPreviewDiagnostic | undefined,
            }
          : await resolve(creative, extras, ref, reviewedThumbnail);
      if (resolved.comparisons.some(c => c.result === "candidate_limit")) collectionIncomplete = true;
      const file = resolved.selected?.file;
      let approvedDetails: Record<string, unknown> | undefined;
      if (approved) {
        const lookup = creative.videoId ? lookupErrors.get(creative.videoId) ?? [] : [];
        const identityMismatch = creative.creativeId !== approved.creative_id || !sameIdentity ||
          (approved.video_id !== undefined && creative.videoId !== approved.video_id);
        const code = identityMismatch ? 'preview_approved_identity_mismatch'
          : directSource ? restoring?'preview_approved_restore_valid':'preview_approved_reference_valid'
          : lookup.some(c=>['meta_thumbnail_page_limit','meta_thumbnail_page_cycle'].includes(c)) ? 'preview_approved_pagination_limit'
          : collectionIncomplete && !directSource ? resolved.comparisons.some(c=>c.result==='candidate_limit') ? 'preview_approved_candidate_limit' : 'preview_approved_collection_incomplete'
          : resolved.approval?.code ?? 'preview_approved_hash_not_found';
        const accepted = !identityMismatch && (!collectionIncomplete || !!directSource) && file?.sha256 === approved.sha256;
        approvedDetails = {approval:{...resolved.approval,code,approved_sha256:approved.sha256,
            candidate_count:directSource ? 1 : deduplicateCandidates([...(creative.candidates??[]),...extras]).length,
            measured_count:resolved.comparisons.filter(c=>typeof c.sha256==='string').length,
            collection_complete:!collectionIncomplete,
            source_mode:restoring?'restore_previous':directSource ? 'approved_reference' : 'official_collection',
            ...(directSource ? {manifest_sha256:manifestPin.sha256} : {}),
            bytes_hash_differences:resolved.comparisons.filter(c=>typeof c.sha256==='string'&&c.sha256!==approved.sha256).length},
          identity:{expected_creative_id:approved.creative_id,current_creative_id:creative.creativeId,
            expected_video_id:approved.video_id??null,current_video_id:creative.videoId},
          lookup_errors:lookup};
        if (!accepted) {
          stats.decisions?.push({ad_id:ref.ad_id,result:'approved_hash_rejected',...approvedDetails,candidates:resolved.comparisons});
          throw new PreviewError(code);
        }
      }
      let previousWidth = Number(current?.metadata?.preview_width) || 0,
        previousHeight = Number(current?.metadata?.preview_height) || 0;
      let existingError: string | null = null;
      let previousVerified = false;
      if (oldPreview && file && file.sha256 === oldPreview.sha256) {
        previousWidth = file.width!;
        previousHeight = file.height!;
        previousVerified = true;
      }
      if (oldPreview && !reuse && ((file && file.sha256 !== oldPreview.sha256) ||
          (!file && creative.videoId && videoPreviewQuality({width:previousWidth,height:previousHeight}) !== "insufficient"))) {
        try {
          const { data, error } = await options.supabase.storage
            .from(CREATIVE_BUCKET)
            .download(oldPreview.path);
          if (error || !data || data.size > MAX_PREVIEW_BYTES)
            throw new PreviewError("existing_preview_unverified");
          const bytes = new Uint8Array(await data.arrayBuffer());
          if (
            bytes.length > MAX_PREVIEW_BYTES ||
            (await sha256(bytes)) !== oldPreview.sha256
          )
            throw new PreviewError("existing_preview_unverified");
          const dimensions = inspectImage(bytes, oldPreview.mime);
          previousWidth = dimensions.width;
          previousHeight = dimensions.height;
          previousVerified = true;
        } catch {
          existingError = "existing_preview_unverified";
        }
      }
      const sameHash = !!file && file.sha256 === oldPreview?.sha256;
      const replace =
        !!file &&
        (!oldPreview ||
          (sameIdentity &&
            !existingError &&
            !sameHash &&
            (restoring || improves(
              { width: file.width!, height: file.height! },
              { width: previousWidth, height: previousHeight },
            ))));
      let preview = oldPreview,
        downloaded = false;
      let outcome = reuse
        ? "reused"
        : collectionIncomplete && !directSource ? "pending_collection_incomplete"
        : !sameIdentity && oldPreview
          ? "preserved_identity_uncertain"
          : !file
            ? previousVerified && creative.videoId && videoPreviewQuality({width:previousWidth,height:previousHeight}) !== "insufficient"
              ? "preserved_adequate" : creative.videoId ? "pending_no_hd_source" : "preserved_no_candidate"
            : sameHash
              ? "unchanged_hash"
              : !replace
                ? "preserved_not_better"
                : restoring ? 'restored_previous' : oldPreview
                  ? "improved"
                  : "created";
      if (existingError) outcome = existingError;
      let metadata = mergedMetadata(current, creative);
      if (!replace && oldPreview) {
        const old = current?.metadata ?? {};
        for (const key of Object.keys(metadata))
          if (
            key.startsWith("preview_") ||
            key.startsWith("video_") ||
            key === "representative_policy" ||
            key === "preferred_thumbnail"
          )
            delete metadata[key];
        for (const [key, value] of Object.entries(old))
          if (
            key.startsWith("preview_") ||
            key.startsWith("video_") ||
            key === "representative_policy" ||
            key === "preferred_thumbnail"
          )
            metadata[key] = value;
        if (previousWidth && previousHeight) {
          metadata.preview_width = previousWidth;
          metadata.preview_height = previousHeight;
        }
        if (sameIdentity && creative.assetKey)
          metadata.preview_asset_key = creative.assetKey;
        if (!sameIdentity)
          metadata.preview_stale_for_creative_id = creative.creativeId;
      }
      if (replace && file && resolved.selected) {
        if (oldPreview)
          metadata.preview_previous = {
            path: oldPreview.path,
            mime: oldPreview.mime,
            sha256: oldPreview.sha256,
            width: previousWidth || null,
            height: previousHeight || null,
            source: current?.metadata?.preview_source ?? null,
            asset_key: current?.metadata?.preview_asset_key ?? null,
            creative_id: current?.creative_id ?? null,
            replaced_at: nowIso,
          };
        const path = restoring ? directSource!.previous.path : buildCreativeStoragePath(
          options.clientId,
          ref.account_id,
          ref.ad_id,
          creative.creativeId,
          file.mime,
          file.sha256,
        );
        preview = { path, mime: file.mime, sha256: file.sha256 };
        downloaded = true;
        metadata = {
          ...metadata,
          preview_asset_key: creative.assetKey,
          preview_media_type: creative.metadata.preview_media_type,
          preview_source: resolved.selected.candidate.source,
          preview_width: file.width,
          preview_height: file.height,
          preview_bytes: file.bytes.length,
          representative_policy: resolved.selected.candidate.policy,
          preferred_thumbnail: resolved.selected.candidate.preferred,
          ...(directSource ? {preview_approved_manifest_sha256:manifestPin.sha256} : {}),
          preview_for_creative_id: creative.creativeId,
          video_id: creative.videoId,
        };
        if(restoring){
          // Restore preview metadata only; never rewind commercial text or metrics.
          const original=directSource!.previous.metadata;
          for(const key of Object.keys(metadata))if(key.startsWith('preview_')||key.startsWith('video_')||['representative_policy','preferred_thumbnail'].includes(key))delete metadata[key];
          for(const [key,value] of Object.entries(original))if(key.startsWith('preview_')||key.startsWith('video_')||['representative_policy','preferred_thumbnail'].includes(key))metadata[key]=value;
          Object.assign(metadata,{preview_asset_key:directSource!.previous.asset_key,video_id:directSource!.video_id,
            preview_width:file.width,preview_height:file.height,preview_bytes:file.bytes.length,
            preview_approved_manifest_sha256:manifestPin.sha256,
            preview_restoration:{origin_run_id:restoreOrigin,from_path:oldPreview!.path,from_sha256:oldPreview!.sha256,
              target_path:path,target_sha256:file.sha256,restored_at:nowIso,manifest_sha256:manifestPin.sha256}});
        }
        delete metadata.preview_stale_for_creative_id;
        if (!options.dryRun && !restoring) {
          const { error } = await options.supabase.storage
            .from(CREATIVE_BUCKET)
            .upload(path, file.bytes, {
              contentType: file.mime,
              cacheControl: "3600",
              upsert: false,
            });
          if (error) {
            if (Number(error.statusCode) !== 409)
              throw new CreativeRequestError(
                "Preview upload failed",
                "storage_upload",
              );
            // An interrupted prior run may have uploaded this immutable hash path.
            const existing = await options.supabase.storage
              .from(CREATIVE_BUCKET)
              .download(path);
            if (
              existing.error ||
              !existing.data ||
              existing.data.size > MAX_PREVIEW_BYTES ||
              (await sha256(
                new Uint8Array(await existing.data.arrayBuffer()),
              )) !== file.sha256
            )
              throw new CreativeRequestError(
                "Preview upload failed",
                "storage_upload",
              );
          }
        }
      }
      const errorCode =
        existingError ? existingError : collectionIncomplete && !directSource ? "preview_collection_incomplete"
        : !file && !reuse && outcome !== "preserved_adequate"
          ? oldPreview && !sameIdentity
            ? "preview_identity_uncertain"
            : creative.videoId ? "preview_hd_pending" : "preview_unavailable"
          : existingError;
      if (!reuse) metadata.preview_quality_status = collectionIncomplete && !directSource ? "pending_collection_incomplete"
        : existingError ? "pending_existing_unverified"
        : previousVerified && oldPreview && !replace && creative.videoId ? videoPreviewQuality({width:previousWidth,height:previousHeight})
        : file && creative.videoId ? videoPreviewQuality({width:file.width!,height:file.height!})
        : creative.videoId ? "pending_no_hd_source" : null;
      if (!reuse && file && creative.videoId && replace) metadata.preview_visual_review =
        resolved.visuallyReviewed ? "reviewed_thumbnail_match" : "pending_visual_review";
      metadata.preview_last_attempt = {
        at: nowIso,
        result: outcome,
        code: errorCode,
        creative_id: creative.creativeId,
        asset_key: creative.assetKey,
        previous: oldPreview
          ? {
              width: previousWidth || null,
              height: previousHeight || null,
              sha256: oldPreview.sha256,
            }
          : null,
        candidates: resolved.comparisons,
        quality: file && creative.videoId ? videoPreviewQuality({width:file.width!,height:file.height!}) : null,
        lookup_errors: [
          ...(creative.videoId
            ? (lookupErrors.get(creative.videoId) ?? [])
            : []),
          ...(lookupErrors.get(ref.ad_id) ?? []),
        ],
      };
      if (
        (file && !existingError && sameIdentity) ||
        replace ||
        (!oldPreview && file)
      )
        metadata.preview_strategy_version = PREVIEW_STRATEGY_VERSION;
      creative = { ...creative, metadata };
      if (!options.dryRun) {
        const row = buildCreativeDatabaseRow({
          clientId: options.clientId,
          ref,
          creative,
          preview,
          error: errorCode,
          nowIso,
        });
        row.creative_name =
          creative.creativeName ?? current?.creative_name ?? null;
        row.source_updated_at =
          creative.sourceUpdatedAt ?? current?.source_updated_at ?? null;
        if (oldPreview && !replace) {
          row.creative_id = current!.creative_id;
          row.creative_type = current!.creative_type ?? creative.creativeType;
          row.preview_kind = current!.preview_kind ?? creative.previewKind;
        }
        // Compare-and-set stops an older inspection from replacing a newer preview.
        const query = current
          ? options.supabase
              .from("dashboard_creative_previews")
              .update(row)
              .eq("client_id", options.clientId)
              .eq("source", "meta_ads")
              .eq("account_id", ref.account_id)
              .eq("entity_type", "ad")
              .eq("entity_id", ref.ad_id)
              .eq("updated_at", current.updated_at)
              .select("entity_id")
          : options.supabase
              .from("dashboard_creative_previews")
              .insert(row)
              .select("entity_id");
        const { data, error } = await query;
        if (error || !data?.length)
          throw new CreativeRequestError(
            "Preview persistence failed",
            error ? "database_upsert" : "preview_concurrent_update",
          );
      }
      stats.decisions?.push({
        ad_id: ref.ad_id,
        result: outcome,
        ...approvedDetails,
        previous_width: previousWidth || null,
        previous_height: previousHeight || null,
        candidates: resolved.comparisons,
      });
      return {
        kind: "success" as const,
        existed: !!current,
        downloaded,
        reused: !!oldPreview && !replace,
        errorCode,
        videoPolicy:
          creative.metadata.preview_media_type === "video"
            ? stringValue(metadata.representative_policy)
            : null,
        videoFailed: !!creative.videoId && !preview,
      };
    },
  );

  if (!options.dryRun) {
    await mapWithConcurrency(
      processed
        .map((result, index) => ({ result, ref: candidates[index] }))
        .filter((item) => item.result.status === "rejected"),
      CREATIVE_CONCURRENCY,
      async ({ result, ref }) => {
        const code =
          result.status === "rejected"
            ? safeErrorCode(result.reason)
            : "creative_unknown";
        const current = existing.get(`${ref.account_id}:${ref.ad_id}`);
        if (code === "preview_concurrent_update"||code==='preview_reservation_snapshot_conflict') return;
        const query = current
          ? options.supabase
              .from("dashboard_creative_previews")
              .update({
                last_error: code,
                metadata: {
                  ...current.metadata,
                  preview_last_attempt: {
                    at: nowIso,
                    result: "preserved_error",
                    code,
                  },
                },
                refreshed_at: nowIso,
                updated_at: nowIso,
              })
              .eq("client_id", options.clientId)
              .eq("source", "meta_ads")
              .eq("account_id", ref.account_id)
              .eq("entity_type", "ad")
              .eq("entity_id", ref.ad_id)
              .eq("updated_at", current.updated_at)
          : options.supabase.from("dashboard_creative_previews").insert(
              buildCreativeDatabaseRow({
                clientId: options.clientId,
                ref,
                creative: emptyCreative(),
                error: code,
                nowIso,
              }),
            );
        await query;
      },
    );
  }

  processed.forEach((result, index) => {
    const ref = candidates[index];
    if (result.status === "rejected") {
      const code = safeErrorCode(result.reason);
      stats.failed++;
      if (
        existing.get(`${ref.account_id}:${ref.ad_id}`)?.creative_type ===
        "video"
      ) {
        stats.video_preview_failed++;
      }
      if (stats.failures.length < (options.reservationSelection ? 50 : 25)) {
        stats.failures.push({ ad_id: ref.ad_id, code });
      }
      return;
    }
    if (result.value.kind === "failed") {
      stats.failed++;
      if (
        existing.get(`${ref.account_id}:${ref.ad_id}`)?.creative_type ===
        "video"
      ) {
        stats.video_preview_failed++;
      }
      if (stats.failures.length < (options.reservationSelection ? 50 : 25)) {
        stats.failures.push({
          ad_id: result.value.adId,
          code: result.value.code,
        });
      }
      if (options.dryRun) {
        result.value.existed ? stats.would_update++ : stats.would_insert++;
      } else {
        result.value.existed ? stats.updated++ : stats.inserted++;
      }
      return;
    }
    if (result.value.downloaded) stats.preview_downloaded++;
    if (result.value.errorCode) {
      stats.failed++;
      if (stats.failures.length < (options.reservationSelection ? 50 : 25))
        stats.failures.push({ ad_id: ref.ad_id, code: result.value.errorCode });
    }
    if (result.value.reused) stats.reused++;
    if (
      result.value.videoPolicy === "video_preferred_thumbnail" ||
      result.value.videoPolicy === "video_high_res_thumbnail" ||
      result.value.videoPolicy === "video_format_thumbnail"
    ) {
      stats.video_high_res_resolved++;
    }
    if (result.value.videoPolicy === "video_preferred_thumbnail") {
      stats.video_preferred_thumbnail++;
    }
    if (result.value.videoPolicy === "video_account_picture") {
      stats.video_account_picture_resolved++;
    }
    if (
      result.value.videoPolicy === "video_creative_image" ||
      result.value.videoPolicy === "video_thumbnail_fallback"
    ) {
      stats.video_thumbnail_fallback++;
    }
    if (result.value.videoFailed) stats.video_preview_failed++;
    if (options.dryRun) {
      result.value.existed ? stats.would_update++ : stats.would_insert++;
    } else {
      result.value.existed ? stats.updated++ : stats.inserted++;
    }
  });

  return stats;
}
