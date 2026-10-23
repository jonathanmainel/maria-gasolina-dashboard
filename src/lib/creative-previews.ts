import { supabase } from "./supabase";

export type MetaCreativeType = "image" | "video" | "carousel" | "dynamic" | "unknown";

export interface MetaCreativePreview {
  ad_id: string;
  creative_type: MetaCreativeType;
  preview_kind: string | null;
  preview_url: string | null;
  preview_width?: number | null;
  preview_height?: number | null;
  preview_media_type?: "video" | "image";
  preview_source?: string | null;
}

interface PreviewRow {
  ad_id: string;
  creative_type: string | null;
  preview_kind: string | null;
  preview_storage_path: string | null;
  preview_available: boolean;
  metadata?: Record<string, unknown>;
}

const SIGNED_URL_SECONDS = 600;
const CACHE_MS = 5 * 60 * 1000;
const BATCH_SIZE = 100;
const signedCache = new Map<string, { url: string; expiresAt: number }>();
/** Preserve the published topbar cache invalidation contract. */
export function clearCreativePreviewCache() { signedCache.clear(); }

function batches<T>(items: T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) result.push(items.slice(i, i + BATCH_SIZE));
  return result;
}

function creativeType(value: string | null): MetaCreativeType {
  return value === "image" || value === "video" || value === "carousel" || value === "dynamic" ? value : "unknown";
}

/** Metadata and short-lived URLs only; no service key, public URL or persistent storage. */
export async function getMetaCreativePreviews(adIds: string[], clientId: number, options: { forceRefresh?: boolean } = {}): Promise<Map<string, MetaCreativePreview>> {
  const previews = new Map<string, MetaCreativePreview>();
  const client = supabase;
  if (!client || !adIds.length) return previews;

  // A cache key contains the signed-in member, so another login cannot inherit a URL.
  const { data: { session } } = await client.auth.getSession();
  if (!session?.user?.id) return previews;
  const userId = session.user.id;
  const ids = [...new Set(adIds)];
  const results = await Promise.all(batches(ids).map((batch) => client.from("dashboard_creative_previews")
    .select("ad_id,creative_type,preview_kind,preview_storage_path,preview_available,metadata")
    .eq("client_id", clientId).eq("source", "meta_ads").eq("entity_type", "ad").in("ad_id", batch)));
  const rows: PreviewRow[] = [];
  for (const result of results) {
    if (result.error) return previews; // Optional artwork must never hide the ad or its metrics.
    rows.push(...(result.data ?? []) as PreviewRow[]);
  }

  const paths = [...new Set(rows.filter((row) => row.preview_available && row.preview_storage_path)
    .map((row) => row.preview_storage_path as string))];
  const urls = new Map<string, string>();
  const missing: string[] = [];
  for (const path of paths) {
    const key = `${userId}:${clientId}:${path}`;
    const cached = signedCache.get(key);
    if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) urls.set(path, cached.url);
    else missing.push(path);
  }

  // Supabase Storage signs multiple paths in one request (per 100 paths here).
  const signed = await Promise.all(batches(missing).map((batch) => client.storage
    .from("dashboard-creatives").createSignedUrls(batch, SIGNED_URL_SECONDS)));
  for (const result of signed) {
    if (result.error) continue;
    for (const item of result.data) {
      if (!item.error && item.path && item.signedUrl) {
        urls.set(item.path, item.signedUrl);
        signedCache.set(`${userId}:${clientId}:${item.path}`, { url: item.signedUrl, expiresAt: Date.now() + CACHE_MS });
      }
    }
  }

  for (const row of rows) {
    previews.set(row.ad_id, {
      ad_id: row.ad_id,
      creative_type: creativeType(row.creative_type),
      preview_kind: row.preview_kind,
      preview_url: row.preview_available && row.preview_storage_path ? urls.get(row.preview_storage_path) ?? null : null,
      preview_width: Number(row.metadata?.preview_width) > 0 ? Number(row.metadata?.preview_width) : null,
      preview_height: Number(row.metadata?.preview_height) > 0 ? Number(row.metadata?.preview_height) : null,
      preview_media_type: row.metadata?.preview_media_type === "image" ? "image" : row.metadata?.preview_media_type === "video" || row.creative_type === "video" ||
        (row.creative_type === "dynamic" && (row.metadata?.object_type === "VIDEO" || typeof row.metadata?.video_id === "string" && row.metadata.video_id.length > 0)) ? "video" : "image",
      preview_source: typeof row.metadata?.preview_source === "string" ? row.metadata.preview_source : null,
    });
  }
  return previews;
}
