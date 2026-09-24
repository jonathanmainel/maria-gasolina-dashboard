export const CREATIVE_BUCKET = "dashboard-creatives";
export const CREATIVE_REFRESH_TTL_MS = 20 * 60 * 60 * 1000;
const MAX_PREVIEW_BYTES = 10 * 1024 * 1024;
const META_AD_BATCH_SIZE = 25;
const CREATIVE_CONCURRENCY = 4;

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
};

type MetaCreativePayload = {
  id?: string;
  name?: string;
  object_type?: string;
  thumbnail_url?: string;
  image_url?: string;
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
    ? (stringValue(videoData.image_url) ??
      stringValue(creative.image_url) ??
      stringValue(creative.thumbnail_url))
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
    metadata: {
      object_type: stringValue(creative.object_type),
      effective_object_story_id: stringValue(
        creative.effective_object_story_id,
      ),
      headline,
      body,
      destination_url: destinationUrl,
      has_asset_feed_spec: hasAssetFeed,
      representative_policy: creativeType === "carousel"
        ? "first_carousel_card"
        : creativeType === "dynamic"
        ? "first_available_asset"
        : creativeType === "video"
        ? "video_thumbnail"
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
): boolean {
  return (
    !!existing?.creative_id &&
    existing.creative_id === creativeId &&
    !!existing.preview_storage_path &&
    !!existing.preview_mime_type &&
    !!existing.preview_sha256
  );
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
): string {
  return [
    String(clientId),
    "meta_ads",
    safeSegment(accountId),
    "ad",
    safeSegment(adId),
    `${safeSegment(creativeId ?? "unknown")}.${extensionForMime(mime)}`,
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
): Promise<{ bytes: Uint8Array; mime: string; sha256: string }> {
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

  return { bytes, mime, sha256: await sha256(bytes) };
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
      "creative{id,name,object_type,thumbnail_url,image_url,effective_object_story_id,object_story_spec,asset_feed_spec}",
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
        "entity_id,creative_id,preview_storage_path,preview_mime_type,preview_sha256,last_error,refreshed_at",
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
  const candidates = refs.filter((ref) =>
    isCreativePreviewStale(existing.get(ref.ad_id), now)
  );
  const stats: CreativeEnrichmentStats = {
    inspected: refs.length,
    inserted: 0,
    updated: 0,
    reused: refs.length - candidates.length,
    preview_downloaded: 0,
    failed: 0,
    would_insert: 0,
    would_update: 0,
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

      const creative = normalizeMetaCreative(ad);
      const sameCreative = canReuseCreativePreview(
        current,
        creative.creativeId,
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

      if (!preview && creative.previewUrl) {
        const file = await downloadPreview(creative.previewUrl, fetchImpl);
        downloaded = true;
        const path = buildCreativeStoragePath(
          options.clientId,
          ref.account_id,
          ref.ad_id,
          creative.creativeId,
          file.mime,
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
      if (stats.failures.length < 25) {
        stats.failures.push({ ad_id: ref.ad_id, code });
      }
      return;
    }
    if (result.value.kind === "failed") {
      stats.failed++;
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
    if (options.dryRun) {
      result.value.existed ? stats.would_update++ : stats.would_insert++;
    } else {
      result.value.existed ? stats.updated++ : stats.inserted++;
    }
  });

  return stats;
}
