import { describe, expect, it, vi } from "vitest";
import { handleManualSync } from "./handler.ts";
const key = "12345678-1234-4234-8234-123456789abc";
const request = (body: unknown, auth = "Bearer real-session") => new Request("http://local/sync", {
  method: "POST", headers: { authorization: auth }, body: JSON.stringify(body),
});
const input = { action: "request", client_slug: "maria-gasolina", sources: ["google_ads"], request_key: key };
describe("manual sync boundary", () => {
  it("requires a verified session before any database call", async () => {
    const rpc = vi.fn(); const getUser = vi.fn(async () => null);
    expect((await handleManualSync(request(input), { rpc, getUser })).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect((await handleManualSync(request(input, ""), { rpc, getUser })).status).toBe(401);
    expect(getUser).toHaveBeenCalledOnce();
  });
  it("uses the Auth identity and scoped RPC, never the declared user/role", async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true }, error: null }));
    const getUser = vi.fn(async () => ({ id: "verified-user" }));
    expect((await handleManualSync(request(input), { rpc, getUser })).status).toBe(202);
    expect(rpc).toHaveBeenCalledWith("request_dashboard_sync", { p_client_slug: "maria-gasolina", p_user_id: "verified-user", p_sources: ["google_ads"], p_request_key: key });
    expect((await handleManualSync(request({ ...input, role: "admin" }), { rpc, getUser })).status).toBe(400);
    expect((await handleManualSync(request({ ...input, client_id: 99 }), { rpc, getUser })).status).toBe(400);
    expect((await handleManualSync(request({ ...input, start_date: "2000-01-01" }), { rpc, getUser })).status).toBe(400);
    expect(rpc).toHaveBeenCalledOnce();
  });
  it("returns forbidden for viewer or foreign membership and hides database details", async () => {
    const deps = { getUser: async () => ({ id: "viewer" }), rpc: async () => ({ data: null, error: { code: "42501", message: "sensitive details" } }) };
    const response = await handleManualSync(request(input), deps);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("sensitive");
  });
  it("supports viewer status independently from write permission", async () => {
    const rpc = vi.fn(async () => ({ data: { can_request: false }, error: null }));
    const response = await handleManualSync(request({ action: "status", client_slug: "maria-gasolina" }), { getUser: async () => ({ id: "viewer" }), rpc });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_dashboard_sync_status", { p_client_slug: "maria-gasolina", p_user_id: "viewer" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects invalid sources, historical mode, oversized body and malformed JSON", async () => {
    const deps = { getUser: async () => ({ id: "user" }), rpc: vi.fn() };
    for (const value of [{ ...input, sources: ["crm"] }, { ...input, mode: "backfill" }, null, { ...input, request_key: "no" }]) {
      expect((await handleManualSync(request(value), deps)).status).toBe(400);
    }
    expect((await handleManualSync(request({ ...input, extra: "x".repeat(33000) }), deps)).status).toBe(413);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
});

it("tracks only bounded UUID run ids and does not accept browser dates", async () => {
  const rpc = vi.fn(async () => ({ data: { requested_runs: [] }, error: null }));
  const deps = { getUser: async () => ({ id: "verified-user" }), rpc };
  expect((await handleManualSync(request({ action: "status", client_slug: "maria-gasolina", run_ids: [key] }), deps)).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("get_dashboard_sync_status", { p_client_slug: "maria-gasolina", p_user_id: "verified-user", p_run_ids: [key] });
  for (const run_ids of [["invalid"], [key,key,key,key]]) expect((await handleManualSync(request({ action: "status", client_slug: "maria-gasolina", run_ids }), deps)).status).toBe(400);
});
