// Pure control/diagnostic helpers: also exercised under Vitest without Deno.
export const SYNC_SOURCES = ["google_ads", "meta_ads", "ga4"] as const;
export type SyncSource = typeof SYNC_SOURCES[number];
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseManualRequest(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  const allowed = ["action", "client_slug", "sources", "request_key", "run_ids"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return null;
  if (typeof value.client_slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.client_slug) || value.client_slug.length > 100) return null;
  if (value.action === "status") {
    if (value.sources !== undefined || value.request_key !== undefined) return null;
    if (value.run_ids !== undefined && (!Array.isArray(value.run_ids) || value.run_ids.length < 1 || value.run_ids.length > 3 || value.run_ids.some(id => typeof id !== "string" || !UUID.test(id)))) return null;
    return { action: "status" as const, clientSlug: value.client_slug, runIds: value.run_ids as string[] | undefined };
  }
  if (value.run_ids !== undefined || value.action !== "request" || typeof value.request_key !== "string" || !UUID.test(value.request_key)
    || !Array.isArray(value.sources) || value.sources.length < 1 || value.sources.length > 3
    || value.sources.some((source) => !SYNC_SOURCES.includes(source as SyncSource))) return null;
  return { action: "request" as const, clientSlug: value.client_slug,
    sources: [...new Set(value.sources)] as SyncSource[], requestKey: value.request_key };
}

export function safeSyncErrorCode(body: { error_code?: unknown; meta_error?: unknown }, httpStatus: number): string {
  const safeCodes = ["OAUTH_INVALID_GRANT", "OAUTH_INVALID_CLIENT", "OAUTH_UNAUTHORIZED_CLIENT",
    "OAUTH_ACCESS_DENIED", "OAUTH_SESSION_POLICY", "OAUTH_TEMPORARILY_UNAVAILABLE", "OAUTH_TOKEN_REJECTED",
    "OAUTH_TRANSPORT_ERROR", "OAUTH_INVALID_RESPONSE", "SYNC_RESERVATION_REQUIRED", "SYNC_RESERVATION_CONFLICT"];
  if (typeof body.error_code === "string" && safeCodes.includes(body.error_code)) return body.error_code;
  // Preserve numeric Meta diagnostics, never the provider message or raw response.
  if (body.meta_error && typeof body.meta_error === "object") {
    const error = body.meta_error as Record<string, unknown>;
    if (Number.isSafeInteger(error.code) && Number(error.code) >= 0 && Number(error.code) < 1e10) {
      const subcode = Number.isSafeInteger(error.subcode) && Number(error.subcode) >= 0 && Number(error.subcode) < 1e10 ? `_${error.subcode}` : "";
      return `META_API_${error.code}${subcode}`;
    }
  }
  return httpStatus === 429 ? "PLATFORM_RATE_LIMIT" : "PLATFORM_SYNC_FAILED";
}

// No writes (including diagnostics) when a secret-authenticated dry run is used.
export async function authorizeCollection(
  admin: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  body: { dry_run?: boolean; automation_run_id?: unknown },
  clientId: number, source: SyncSource, start: string, end: string,
): Promise<Response | null> {
  if (body.dry_run === true) return null;
  if (typeof body.automation_run_id !== "string" || !UUID.test(body.automation_run_id)) {
    return Response.json({ ok: false, error_code: "SYNC_RESERVATION_REQUIRED", database_write_performed: false }, { status: 409 });
  }
  const { data, error } = await admin.rpc("begin_dashboard_sync_collection", {
    p_run_id: body.automation_run_id, p_client_id: clientId, p_source: source, p_start: start, p_end: end,
  });
  if (error || data !== true) {
    return Response.json({ ok: false, error_code: "SYNC_RESERVATION_CONFLICT", database_write_performed: false }, { status: 409 });
  }
  return null;
}
