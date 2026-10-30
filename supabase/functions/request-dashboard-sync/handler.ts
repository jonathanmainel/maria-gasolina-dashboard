import { parseManualRequest } from "../_shared/sync-control.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
type Result = { data: unknown; error: { code?: string } | null };
export interface ManualSyncDependencies {
  getUser: (token: string) => Promise<{ id: string } | null>;
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<Result>;
}
const json = (body: unknown, status: number) => Response.json(body, { status, headers: CORS });

export async function handleManualSync(req: Request, deps: ManualSyncDependencies) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error_code: "METHOD_NOT_ALLOWED" }, 405);
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ") || auth.length > 10000) return json({ error_code: "UNAUTHENTICATED" }, 401);
  try {
    const user = await deps.getUser(auth.slice(7));
    if (!user) return json({ error_code: "UNAUTHENTICATED" }, 401);
    // Bound streamed bodies too; content-length alone is not trustworthy.
    const reader = req.body?.getReader();
    if (!reader) return json({ error_code: "INVALID_REQUEST" }, 400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) { await reader.cancel(); return json({ error_code: "PAYLOAD_TOO_LARGE" }, 413); }
      chunks.push(value);
    }
    const merged = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(merged)); } catch { return json({ error_code: "INVALID_REQUEST" }, 400); }
    const input = parseManualRequest(body);
    if (!input) return json({ error_code: "INVALID_REQUEST" }, 400);
    // Both RPCs re-check current membership and active client in the database.
    const preview=input.action==='request'&&'operation' in input&&input.operation==='previews';
    const { data, error } = await deps.rpc(preview?'request_dashboard_preview_sync':input.action === "status" ? "get_dashboard_sync_status" : "request_dashboard_sync", {
      p_client_slug: input.clientSlug, p_user_id: user.id,
      ...(preview?{p_request_key:input.requestKey,p_ad_ids:input.previewAdIds,p_assets:input.previewAssets}:input.action === "request" ? { p_sources: input.sources, p_request_key: input.requestKey } : input.runIds ? { p_run_ids: input.runIds } : {}),
    });
    if (error) return json({ error_code: error.code === "42501" ? "FORBIDDEN" : error.code==='22023'?'INVALID_REQUEST':"SYNC_UNAVAILABLE" }, error.code === "42501" ? 403 : error.code==='22023'?400:503);
    return json(data, input.action === "request" ? 202 : 200);
  } catch {
    return json({ error_code: "SYNC_UNAVAILABLE" }, 503);
  }
}
