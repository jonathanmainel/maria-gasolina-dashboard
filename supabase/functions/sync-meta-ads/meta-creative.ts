export const CREATIVE_BUCKET = "dashboard-creatives";
export const CREATIVE_REFRESH_TTL_MS = 20 * 60 * 60 * 1000;
const MAX_PREVIEW_BYTES = 10 * 1024 * 1024;
const META_AD_BATCH_SIZE = 25;
const CREATIVE_CONCURRENCY = 4;
const PREFERRED_VIDEO_THUMBNAIL_MIN_AREA = 1280 * 720;
const VIDEO_PREVIEW_STRATEGY_VERSION = 2;

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
  entity_id: string;
  creative_id: string | null;
  preview_storage_path: string | null;
  preview_mime_type: string | null;
  preview_sha256: string | null;
  last_error: string | null;
  refreshed_at: string;
  creative_type?: MetaCreativeType;
  metadata?: Record<string, unknown> | null;
};

type MetaCreativePayload = {
  id?: string;
  name?: string;
  object_type?: string;
  thumbnail_url?: string;
  image_url?: string;
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

type MetaApiResponse = {
  data?: MetaAdPayload[];
  paging?: { next?: string };
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
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
  video_preferred_thumbnail: number;
  video_thumbnail_fallback: number;
  video_preview_failed: number;
  failures: Array<{ ad_id: string; code: string }>;
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
};

type VideoPreviewCandidate = {
  url: string;
  source: string;
  policy:
    | "video_preferred_thumbnail"
    | "video_high_res_thumbnail"
    | "video_creative_image"
    | "video_thumbnail_fallback";
  width: number | null;
  height: number | null;
  preferred: boolean;
};

type DownloadedPreview = {
  bytes: Uint8Array;
  mime: string;
  sha256: string;
  width: number | null;
  height: number | null;
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
  candidates: Array<Omit<VideoPreviewCandidate, "width" | "height" | "preferred"> & { url: string | null }>,
): VideoPreviewCandidate[] {
  const seen = new Set<string>();
  return candidates.flatMap((candidate) => {
    if (!candidate.url || seen.has(candidate.url)) return [];
    seen.add(candidate.url);
    return [{ ...candidate, url: candidate.url, width: null, height: null, preferred: false }];
  });
}

export function sanitizeDestinationUrl(value: unknown): string | null {
  const raw = stringValue(value);
  if (!raw) return null;

  try {
    const url = new URL(raw);
    for (
      const key of [
        "access_token",
        "appsecret_proof",
        "signature",
        "sig",
        "token",
      ]
    ) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeMetaCreative(
  ad: MetaAdPayload,
): NormalizedMetaCreative {
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
  const hasVideo = Object.keys(videoData).length > 0 ||
    assetVideos.length > 0 ||
    creative.object_type === "VIDEO";

  const creativeType: MetaCreativeType = hasAssetFeed
    ? "dynamic"
    : hasCarousel
    ? "carousel"
    : hasVideo
    ? "video"
    : creative.image_url || creative.thumbnail_url || linkData.picture
    ? "image"
    : "unknown";

  const videoFallbacks = creativeType === "video"
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
      preview_source: creativeType === "video"
        ? videoFallbacks[0]?.source ?? null
        : null,
      representative_policy: creativeType === "carousel"
        ? "first_carousel_card"
        : creativeType === "dynamic"
        ? "first_available_asset"
        : creativeType === "video"
        ? videoFallbacks[0]?.policy ?? "video_thumbnail_fallback"
        : previewUrl
        ? "primary_image"
        : "none",
    },
    sourceUpdatedAt: stringValue(ad.updated_time),
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
  const reusable = (
    !!existing?.creative_id &&
    existing.creative_id === creativeId &&
    !!existing.preview_storage_path &&
    !!existing.preview_mime_type &&
    !!existing.preview_sha256
  );
  if (!reusable) return false;
  if (creativeType !== "video") return true;
  return existing?.metadata?.video_preview_strategy_version ===
    VIDEO_PREVIEW_STRATEGY_VERSION;
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

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function downloadPreview(
  url: string,
  fetchImpl: typeof fetch,
): Promise<DownloadedPreview> {
  const response = await fetchImpl(url, { method: "GET", redirect: "follow" });
  if (!response.ok) {
    throw new CreativeRequestError(
      `Preview download failed with HTTP ${response.status}`,
      `preview_http_${response.status}`,
    );
  }

  const mime = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!mime.startsWith("image/") || mime === "image/svg+xml") {
    throw new CreativeRequestError(
      "Preview is not a supported image",
      "preview_mime",
    );
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PREVIEW_BYTES) {
    throw new CreativeRequestError(
      "Preview exceeds size limit",
      "preview_too_large",
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_PREVIEW_BYTES) {
    throw new CreativeRequestError(
      "Preview exceeds size limit",
      "preview_too_large",
    );
  }

  return {
    bytes,
    mime,
    sha256: await sha256(bytes),
    ...readImageDimensions(bytes, mime),
  };
}

export function readImageDimensions(
  bytes: Uint8Array,
  mime: string,
): { width: number | null; height: number | null } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));

  if (bytes.length >= 24 && ascii(1, 3) === "PNG") {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 10 && (mime === "image/gif" || ascii(0, 3) === "GIF")) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const kind = ascii(12, 4);
    if (kind === "VP8X") {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { width, height };
    }
    if (kind === "VP8 " && bytes.length >= 30) {
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    const frameMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ]);
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = view.getUint16(offset + 2);
      if (length < 2) break;
      if (frameMarkers.has(marker)) {
        return {
          height: view.getUint16(offset + 5),
          width: view.getUint16(offset + 7),
        };
      }
      offset += length + 2;
    }
  }
  return { width: null, height: null };
}

export function selectBestVideoThumbnail(
  thumbnails: Array<Record<string, unknown>>,
): VideoPreviewCandidate | null {
  const candidates = thumbnails.flatMap((thumbnail) => {
    const url = stringValue(thumbnail.uri) ?? stringValue(thumbnail.url);
    const width = Number(thumbnail.width);
    const height = Number(thumbnail.height);
    if (!url || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
    return [{
      url,
      source: "video.thumbnails",
      policy: "video_high_res_thumbnail" as const,
      width,
      height,
      preferred: thumbnail.is_preferred === true,
    }];
  });
  const preferred = candidates.filter((candidate) =>
    candidate.preferred &&
    (candidate.width ?? 0) * (candidate.height ?? 0) >=
      PREFERRED_VIDEO_THUMBNAIL_MIN_AREA
  );
  const pool = preferred.length ? preferred : candidates;
  const selected = pool.sort((left, right) =>
    (right.width ?? 0) * (right.height ?? 0) -
    (left.width ?? 0) * (left.height ?? 0)
  )[0];
  if (!selected) return null;
  return {
    ...selected,
    policy: preferred.length
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
    `https://graph.facebook.com/${apiVersion}/act_${accountId}/ads`,
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
      "creative{id,name,object_type,thumbnail_url,image_url,video_id,effective_object_story_id,object_story_spec,asset_feed_spec}",
    ].join(","),
  );
  url.searchParams.set(
    "filtering",
    JSON.stringify([{ field: "id", operator: "IN", value: adIds }]),
  );
  url.searchParams.set("limit", String(META_AD_BATCH_SIZE));

  let next: string | null = url.toString();
  while (next) {
    const response = await fetchImpl(next, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = (await response.json()) as MetaApiResponse;
    if (!response.ok || payload.error) {
      const code = payload.error?.code
        ? `meta_${payload.error.code}${
          payload.error.error_subcode ? `_${payload.error.error_subcode}` : ""
        }`
        : `meta_http_${response.status}`;
      throw new CreativeRequestError(
        payload.error?.message ??
          `Meta creative request failed with HTTP ${response.status}`,
        code,
      );
    }
    ads.push(...(payload.data ?? []));
    next = payload.paging?.next ?? null;
  }
  return ads;
}

export async function fetchBestVideoThumbnail(
  apiVersion: string,
  accessToken: string,
  videoId: string,
  fetchImpl: typeof fetch,
): Promise<VideoPreviewCandidate | null> {
  const thumbnails: Array<Record<string, unknown>> = [];
  const url = new URL(
    `https://graph.facebook.com/${apiVersion}/${videoId}/thumbnails`,
  );
  url.searchParams.set("fields", "height,width,uri,is_preferred");
  url.searchParams.set("limit", "100");
  let next: string | null = url.toString();

  try {
    while (next) {
      const response = await fetchImpl(next, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = (await response.json()) as {
        data?: Array<Record<string, unknown>>;
        paging?: { next?: string };
        error?: { code?: number };
      };
      if (!response.ok || payload.error) return null;
      thumbnails.push(...(payload.data ?? []));
      next = payload.paging?.next ?? null;
    }
    return selectBestVideoThumbnail(thumbnails);
  } catch {
    return null;
  }
}

async function firstDownloadedCandidate(
  candidates: VideoPreviewCandidate[],
  fetchImpl: typeof fetch,
): Promise<{ candidate: VideoPreviewCandidate; file: DownloadedPreview } | null> {
  for (const candidate of candidates) {
    try {
      return { candidate, file: await downloadPreview(candidate.url, fetchImpl) };
    } catch {
      // A failed image candidate must not break creative or metric ingestion.
    }
  }
  return null;
}

function previewArea(file: DownloadedPreview): number {
  return (file.width ?? 0) * (file.height ?? 0);
}

async function resolveCreativePreview(
  creative: NormalizedMetaCreative,
  videoThumbnail: VideoPreviewCandidate | null,
  fetchImpl: typeof fetch,
): Promise<{ creative: NormalizedMetaCreative; file: DownloadedPreview | null }> {
  if (creative.creativeType !== "video") {
    const file = creative.previewUrl
      ? await downloadPreview(creative.previewUrl, fetchImpl)
      : null;
    return { creative, file };
  }

  const highResolution = videoThumbnail
    ? await firstDownloadedCandidate([videoThumbnail], fetchImpl)
    : null;
  const fallback = await firstDownloadedCandidate(
    creative.videoFallbacks,
    fetchImpl,
  );
  const selected = highResolution &&
      (!fallback || previewArea(highResolution.file) >= previewArea(fallback.file))
    ? highResolution
    : fallback;

  if (!selected) {
    return {
      creative: {
        ...creative,
        metadata: {
          ...creative.metadata,
          video_preview_strategy_version: VIDEO_PREVIEW_STRATEGY_VERSION,
          representative_policy: "video_thumbnail_fallback",
        },
      },
      file: null,
    };
  }

  return {
    creative: {
      ...creative,
      previewUrl: selected.candidate.url,
      metadata: {
        ...creative.metadata,
        video_preview_strategy_version: VIDEO_PREVIEW_STRATEGY_VERSION,
        preview_source: selected.candidate.source,
        preview_width: selected.file.width,
        preview_height: selected.file.height,
        preview_bytes: selected.file.bytes.byteLength,
        representative_policy: selected.candidate.policy,
        preferred_thumbnail: selected.candidate.preferred,
      },
    },
    file: selected.file,
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
    if (ref) refs.set(`${ref.account_id}:${ref.ad_id}`, ref);
  }

  for (const accountId of options.accountIds) {
    for (let offset = 0;; offset += 1000) {
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
        if (ref) refs.set(`${ref.account_id}:${ref.ad_id}`, ref);
      }
      if ((data ?? []).length < 1000) break;
    }
  }

  return [...refs.values()].sort((left, right) =>
    `${left.account_id}:${left.ad_id}`.localeCompare(
      `${right.account_id}:${right.ad_id}`,
    )
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
        "entity_id,creative_id,creative_type,preview_storage_path,preview_mime_type,preview_sha256,metadata,last_error,refreshed_at",
      )
      .eq("client_id", clientId)
      .eq("source", "meta_ads")
      .eq("entity_type", "ad")
      .in(
        "entity_id",
        group.map((ref) => ref.ad_id),
      );
    if (error) {
      throw new Error(`Failed to load creative previews: ${error.message}`);
    }
    for (const row of data ?? []) {
      result.set(row.entity_id, row as ExistingCreative);
    }
  }
  return result;
}

function safeErrorCode(error: unknown): string {
  if (error instanceof CreativeRequestError) return error.code;
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
  const refs = await collectAdRefs(options);
  const existing = await loadExisting(options.supabase, options.clientId, refs);
  const candidates = refs.filter((ref) => {
    const current = existing.get(ref.ad_id);
    if (options.videoRefreshOnly) return current?.creative_type === "video";
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
    video_preferred_thumbnail: 0,
    video_thumbnail_fallback: 0,
    video_preview_failed: 0,
    failures: [],
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
        .in("entity_id", group.map((ref) => ref.ad_id));
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
        if (ad.id) fetched.set(ad.id, ad);
      }
      for (const adId of job.adIds) {
        if (!fetched.has(adId)) fetchFailures.set(adId, "meta_ad_not_returned");
      }
    } else {
      const code = safeErrorCode(result.reason);
      for (const adId of job.adIds) fetchFailures.set(adId, code);
    }
  });

  const normalized = new Map<string, NormalizedMetaCreative>();
  for (const [adId, ad] of fetched) {
    normalized.set(adId, normalizeMetaCreative(ad));
  }
  const videoIds = [...new Set(
    [...normalized.values()].flatMap((creative) =>
      creative.creativeType === "video" && creative.videoId
        ? [creative.videoId]
        : []
    ),
  )];
  const videoThumbnails = new Map<string, VideoPreviewCandidate | null>();
  const resolvedVideoThumbnails = await mapWithConcurrency(
    videoIds,
    CREATIVE_CONCURRENCY,
    async (videoId) => ({
      videoId,
      thumbnail: await fetchBestVideoThumbnail(
        options.apiVersion,
        options.accessToken,
        videoId,
        fetchImpl,
      ),
    }),
  );
  for (const result of resolvedVideoThumbnails) {
    if (result.status === "fulfilled") {
      videoThumbnails.set(result.value.videoId, result.value.thumbnail);
    }
  }

  const processed = await mapWithConcurrency(
    candidates,
    CREATIVE_CONCURRENCY,
    async (ref) => {
      const current = existing.get(ref.ad_id);
      const ad = fetched.get(ref.ad_id);
      const fetchFailure = fetchFailures.get(ref.ad_id);
      if (!ad || fetchFailure) {
        const code = fetchFailure ?? "meta_ad_not_returned";
        if (!options.dryRun) {
          const query = current
            ? options.supabase
              .from("dashboard_creative_previews")
              .update({
                last_error: code,
                refreshed_at: nowIso,
                updated_at: nowIso,
              })
              .eq("client_id", options.clientId)
              .eq("source", "meta_ads")
              .eq("account_id", ref.account_id)
              .eq("entity_type", "ad")
              .eq("entity_id", ref.ad_id)
            : options.supabase.from("dashboard_creative_previews").upsert(
              buildCreativeDatabaseRow({
                clientId: options.clientId,
                ref,
                creative: emptyCreative(),
                error: code,
                nowIso,
              }),
              {
                onConflict: "client_id,source,account_id,entity_type,entity_id",
              },
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

      let creative = normalized.get(ref.ad_id) ?? normalizeMetaCreative(ad);
      const sameCreative = !options.videoRefreshOnly && canReuseCreativePreview(
        current,
        creative.creativeId,
        creative.creativeType,
      );
      let preview = sameCreative &&
          current?.preview_storage_path &&
          current.preview_mime_type &&
          current.preview_sha256
        ? {
          path: current.preview_storage_path,
          mime: current.preview_mime_type,
          sha256: current.preview_sha256,
        }
        : null;
      let downloaded = false;

      if (
        !preview &&
        (creative.previewUrl ||
          (creative.videoId && videoThumbnails.get(creative.videoId)))
      ) {
        const resolved = await resolveCreativePreview(
          creative,
          creative.videoId
            ? videoThumbnails.get(creative.videoId) ?? null
            : null,
          fetchImpl,
        );
        creative = resolved.creative;
        const file = resolved.file;
        if (!file) {
          throw new CreativeRequestError(
            "No supported creative preview could be downloaded",
            "preview_unavailable",
          );
        }
        downloaded = true;
        const path = buildCreativeStoragePath(
          options.clientId,
          ref.account_id,
          ref.ad_id,
          creative.creativeId,
          file.mime,
          file.sha256,
        );
        preview = { path, mime: file.mime, sha256: file.sha256 };

        if (!options.dryRun) {
          const { error } = await options.supabase.storage
            .from(CREATIVE_BUCKET)
            .upload(path, file.bytes, {
              contentType: file.mime,
              cacheControl: "3600",
              upsert: true,
            });
          if (error) {
            throw new CreativeRequestError(error.message, "storage_upload");
          }
        }
      }

      if (!options.dryRun) {
        const row = buildCreativeDatabaseRow({
          clientId: options.clientId,
          ref,
          creative,
          preview,
          nowIso,
        });
        const { error } = await options.supabase
          .from("dashboard_creative_previews")
          .upsert(row, {
            onConflict: "client_id,source,account_id,entity_type,entity_id",
          });
        if (error) {
          throw new CreativeRequestError(error.message, "database_upsert");
        }

        if (
          current?.preview_storage_path &&
          current.preview_storage_path !== preview?.path
        ) {
          await options.supabase.storage
            .from(CREATIVE_BUCKET)
            .remove([current.preview_storage_path]);
        }
      }

      return {
        kind: "success" as const,
        existed: !!current,
        downloaded,
        reused: sameCreative && !!preview,
        videoPolicy: creative.creativeType === "video"
          ? stringValue(creative.metadata.representative_policy)
          : null,
        videoFailed: creative.creativeType === "video" && !preview,
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
        const code = result.status === "rejected"
          ? safeErrorCode(result.reason)
          : "creative_unknown";
        const current = existing.get(ref.ad_id);
        const query = current
          ? options.supabase
            .from("dashboard_creative_previews")
            .update({
              last_error: code,
              refreshed_at: nowIso,
              updated_at: nowIso,
            })
            .eq("client_id", options.clientId)
            .eq("source", "meta_ads")
            .eq("account_id", ref.account_id)
            .eq("entity_type", "ad")
            .eq("entity_id", ref.ad_id)
          : options.supabase.from("dashboard_creative_previews").upsert(
            buildCreativeDatabaseRow({
              clientId: options.clientId,
              ref,
              creative: emptyCreative(),
              error: code,
              nowIso,
            }),
            {
              onConflict: "client_id,source,account_id,entity_type,entity_id",
            },
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
      if (existing.get(ref.ad_id)?.creative_type === "video") {
        stats.video_preview_failed++;
      }
      if (stats.failures.length < 25) {
        stats.failures.push({ ad_id: ref.ad_id, code });
      }
      return;
    }
    if (result.value.kind === "failed") {
      stats.failed++;
      if (existing.get(ref.ad_id)?.creative_type === "video") {
        stats.video_preview_failed++;
      }
      if (stats.failures.length < 25) {
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
    if (result.value.reused) stats.reused++;
    if (
      result.value.videoPolicy === "video_preferred_thumbnail" ||
      result.value.videoPolicy === "video_high_res_thumbnail"
    ) {
      stats.video_high_res_resolved++;
    }
    if (result.value.videoPolicy === "video_preferred_thumbnail") {
      stats.video_preferred_thumbnail++;
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
