import { BalanceError, type BalanceMeasurement } from "./meta-balance.ts";

type RpcResult = { data: any; error: { code?: string } | null };
export interface BalanceDependencies {
  enabled: boolean;
  mode: "manual" | "scheduled";
  getUser: (token: string) => Promise<{ id: string } | null>;
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
  collect: (accountId: string) => Promise<BalanceMeasurement>;
}
const CORS = {
  "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store",
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function handleMetaBalance(req: Request, deps: BalanceDependencies): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ state: "failed", error_code: "METHOD_NOT_ALLOWED" }, 405);
  let userId: string | null = null;
  if (deps.mode === "manual") {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ") || auth.length > 10000) return json({ state: "failed", error_code: "UNAUTHENTICATED" }, 401);
    try { userId = (await deps.getUser(auth.slice(7)))?.id ?? null; } catch { /* deny */ }
    if (!userId) return json({ state: "failed", error_code: "UNAUTHENTICATED" }, 401);
  }
  if (!deps.enabled) return json({ state: "disabled", error_code: "BALANCE_NOT_HOMOLOGATED" }, 503);
  let body: Record<string, unknown>;
  try {
    const reader = req.body?.getReader(); if (!reader) throw new Error();
    let text = ""; let bytes = 0; const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) { await reader.cancel(); return json({ state: "failed", error_code: "INVALID_REQUEST" }, 400); }
      text += decoder.decode(value, { stream: true });
    }
    body = JSON.parse(text + decoder.decode());
    if (!body || Array.isArray(body) || Object.keys(body).some(k => !["client_slug", "account_id", "request_key"].includes(k))
      || typeof body.client_slug !== "string" || !/^[a-z0-9-]{1,100}$/.test(body.client_slug)
      || typeof body.account_id !== "string" || !/^\d{1,30}$/.test(body.account_id)
      || typeof body.request_key !== "string" || !UUID.test(body.request_key)) throw new Error();
  } catch { return json({ state: "failed", error_code: "INVALID_REQUEST" }, 400); }

  let reservation: any;
  try {
    const result = await deps.rpc("reserve_retaguarda_meta_balance", {
      p_client_slug: body.client_slug, p_account_id: body.account_id, p_request_key: body.request_key,
      p_trigger: deps.mode, p_user_id: userId,
    });
    if (result.error) return json({ state: "failed", error_code: result.error.code === "42501" ? "FORBIDDEN" : "BALANCE_UNAVAILABLE" }, result.error.code === "42501" ? 403 : 503);
    reservation = result.data;
    if (reservation?.state !== "accepted") return json(reservation ?? { state: "indeterminate" }, reservation?.state === "cooldown" ? 429 : reservation?.state === "conflict" ? 409 : 200);
  } catch { return json({ state: "indeterminate", error_code: "BALANCE_UNAVAILABLE" }, 503); }

  let measurement: BalanceMeasurement;
  try { measurement = await deps.collect(body.account_id as string); }
  catch (error) {
    const code = error instanceof BalanceError ? error.code : "META_API_FAILED";
    try {
      const finished = await deps.rpc("finish_retaguarda_meta_balance", { p_run_id: reservation.run_id, p_amount: null, p_measured_at: null, p_error_code: code });
      if (finished.error) return json({ state: "indeterminate", error_code: "BALANCE_UNAVAILABLE" }, 503);
    } catch { return json({ state: "indeterminate", error_code: "BALANCE_UNAVAILABLE" }, 503); }
    return json({ state: "failed", error_code: code }, 502);
  }
  try {
    const result = await deps.rpc("finish_retaguarda_meta_balance", {
      p_run_id: reservation.run_id, p_amount: measurement.amount, p_measured_at: measurement.measuredAt, p_error_code: null,
    });
    if (result.error) return json({ state: "indeterminate", error_code: "BALANCE_UNAVAILABLE" }, 503);
    return json(result.data, result.data?.state === "conflict" ? 409 : result.data?.state === "success" ? 200 : 503);
  } catch { return json({ state: "indeterminate", error_code: "BALANCE_UNAVAILABLE" }, 503); }
}
