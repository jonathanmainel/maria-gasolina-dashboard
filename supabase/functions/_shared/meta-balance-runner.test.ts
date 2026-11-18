import { beforeEach, describe, expect, it, vi } from "vitest";
import { BalanceError } from "./meta-balance.ts";
import { handleMetaBalance, type BalanceDependencies } from "./meta-balance-runner.ts";
const body = { client_slug: "synthetic-client", account_id: "123456789", request_key: "00000000-0000-4000-8000-000000000001" };
const request = (patch = {}, headers = { Authorization: "Bearer synthetic-session" }) => new Request("https://local.invalid/balance", {
  method: "POST", headers, body: JSON.stringify({ ...body, ...patch }),
});
let deps: BalanceDependencies;
beforeEach(() => {
  deps = { mode: "manual", enabled: true, getUser: vi.fn().mockResolvedValue({ id: "verified-author" }),
    rpc: vi.fn().mockImplementation(name => Promise.resolve({ data: name.startsWith("reserve") ? { state: "accepted", run_id: "run" }
      : { state: "success", entry_id: "saved" }, error: null })),
    collect: vi.fn().mockResolvedValue({ amount: "0.00", currency: "BRL", measuredAt: "2026-11-18T15:00:00Z", parser: "meta-stored-balance-pt-br-v1" }) };
});
describe("independent authenticated balance collection", () => {
  it("answers preflight without collection and rejects other methods", async () => {
    expect((await handleMetaBalance(new Request("https://local.invalid", { method: "OPTIONS" }), deps)).status).toBe(200);
    expect((await handleMetaBalance(new Request("https://local.invalid"), deps)).status).toBe(405);
    expect(deps.rpc).not.toHaveBeenCalled(); expect(deps.collect).not.toHaveBeenCalled();
  });
  it("takes authorship from verified Auth and confirms saving only after database response", async () => {
    const result = await handleMetaBalance(request(), deps);
    expect(result.status).toBe(200); expect(await result.json()).toEqual({ state: "success", entry_id: "saved" });
    expect(deps.rpc).toHaveBeenNthCalledWith(1, "reserve_retaguarda_meta_balance", { p_client_slug: body.client_slug, p_account_id: body.account_id,
      p_request_key: body.request_key, p_trigger: "manual", p_user_id: "verified-author" });
    expect(deps.rpc).toHaveBeenNthCalledWith(2, "finish_retaguarda_meta_balance", { p_run_id: "run", p_amount: "0.00", p_measured_at: "2026-11-18T15:00:00Z", p_error_code: null });
  });
  it.each(["created_by", "p_user_id", "origin", "amount", "trigger", "token"])("rejects browser-controlled %s", async field => {
    expect((await handleMetaBalance(request({ [field]: "forged" }), deps)).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated sessions and disabled rollout before any write or Graph request", async () => {
    vi.mocked(deps.getUser).mockResolvedValue(null);
    expect((await handleMetaBalance(request(), deps)).status).toBe(401);
    deps.enabled = false; vi.mocked(deps.getUser).mockResolvedValue({ id: "verified" });
    expect((await handleMetaBalance(request(), deps)).status).toBe(503);
    expect(deps.rpc).not.toHaveBeenCalled(); expect(deps.collect).not.toHaveBeenCalled();
  });
  it("denies viewer and foreign client before reading Meta", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ data: null, error: { code: "42501" } });
    expect((await handleMetaBalance(request(), deps)).status).toBe(403); expect(deps.collect).not.toHaveBeenCalled();
  });
  it("rejects oversized request bodies before reserving or fetching", async () => {
    const req = new Request("https://local.invalid", { method: "POST", headers: { Authorization: "Bearer synthetic" }, body: " ".repeat(3000) });
    expect((await handleMetaBalance(req, deps)).status).toBe(400); expect(deps.rpc).not.toHaveBeenCalled();
  });
  it.each(["success", "running", "conflict", "indeterminate", "cooldown"])("does not recollect on reservation %s", async state => {
    vi.mocked(deps.rpc).mockResolvedValue({ data: { state, replayed: true }, error: null });
    await handleMetaBalance(request(), deps); expect(deps.collect).not.toHaveBeenCalled(); expect(deps.rpc).toHaveBeenCalledTimes(1);
  });
  it("records sanitized collection failure without creating a measurement or invoking campaign ingestion", async () => {
    vi.mocked(deps.collect).mockRejectedValue(new BalanceError("META_BALANCE_FORMAT_UNSUPPORTED"));
    const result = await handleMetaBalance(request(), deps); expect(result.status).toBe(502);
    expect(deps.rpc).toHaveBeenLastCalledWith("finish_retaguarda_meta_balance", { p_run_id: "run", p_amount: null, p_measured_at: null, p_error_code: "META_BALANCE_FORMAT_UNSUPPORTED" });
  });
  it("never acknowledges a failed or timed out database commit", async () => {
    vi.mocked(deps.rpc).mockResolvedValueOnce({ data: { state: "accepted", run_id: "run" }, error: null }).mockRejectedValueOnce(new Error("timeout"));
    const result = await handleMetaBalance(request(), deps); expect(result.status).toBe(503); expect(await result.json()).toMatchObject({ state: "indeterminate" });
  });
  it("uses scheduled provenance only at the separate authenticated backend entry", async () => {
    deps.mode = "scheduled"; await handleMetaBalance(request(), deps);
    expect(deps.getUser).not.toHaveBeenCalled();
    expect(deps.rpc).toHaveBeenNthCalledWith(1, "reserve_retaguarda_meta_balance", expect.objectContaining({ p_trigger: "scheduled", p_user_id: null }));
  });
});
