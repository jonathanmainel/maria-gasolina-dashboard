import { describe, expect, it, vi } from "vitest";
import { runReservedSync } from "./runner.ts";
import { executeIsolatedTargets } from "./scheduler.ts";
const run = { id: "run", client_slug: "verified-client", client_id: 1, source: "google_ads", range_start: "2026-10-16", range_end: "2026-10-22" };
function fixture(result: unknown = run) {
  const rpc = vi.fn(async (name: string) => ({ data: name === "start_dashboard_sync_run" ? result : null, error: null }));
  return { rpc };
}
describe("reserved worker integration", () => {
  it("uses trusted reservation and performs a real collector write request", async () => {
    const admin = fixture();
    const transport = vi.fn(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ client_slug: "verified-client", start_date: "2026-10-16", end_date: "2026-10-22", dry_run: false, automation_run_id: "run" });
      return Response.json({ ok: true, counts: { daily: 7, secret: "token" }, database_write_status: "success" });
    }) as unknown as typeof fetch;
    expect((await runReservedSync("run", admin, "https://local", {}, transport)).ok).toBe(true);
    expect(admin.rpc).toHaveBeenLastCalledWith("finish_dashboard_sync_run", expect.objectContaining({ p_status: "success", p_counts: { daily: 7 }, p_error_code: null }));
  });
  it("does not call APIs on duplicate dispatch", async () => {
    const transport = vi.fn();
    expect((await runReservedSync("run", fixture(null), "https://local", {}, transport)).state).toBe("not_claimed");
    expect(transport).not.toHaveBeenCalled();
  });
  it("retains exclusion on network timeout and malformed gateway responses", async () => {
    for (const transport of [vi.fn(async () => { throw new Error("secret URL"); }), vi.fn(async () => new Response("gateway", { status: 504 }))]) {
      const admin = fixture();
      const result = await runReservedSync("run", admin, "https://local", {}, transport);
      expect(result.state).toBe("indeterminate");
      expect(JSON.stringify(admin.rpc.mock.calls)).not.toContain("secret URL");
    }
  });
  it("records OAuth errors without propagating secrets and isolates other sources", async () => {
    const results = await executeIsolatedTargets(["google_ads", "ga4"], async (source) => {
      const admin = fixture({ ...run, source });
      const result = await runReservedSync("run", admin, "https://local", {}, vi.fn(async () => source === "google_ads"
        ? Response.json({ ok: false, error_code: "OAUTH_INVALID_GRANT", details: "secret", counts: {} }, { status: 502 })
        : Response.json({ ok: true, counts: { daily: 0 }, database_write_status: "already_processed" })));
      if (source === "ga4") expect(admin.rpc).toHaveBeenLastCalledWith("finish_dashboard_sync_run", expect.objectContaining({ p_status: "success", p_write_status: "no_data" }));
      return result;
    });
    expect(results[0].value).toMatchObject({ ok: false, error_code: "OAUTH_INVALID_GRANT" });
    expect(results[1].value).toMatchObject({ ok: true });
    expect(JSON.stringify(results)).not.toContain("secret");
  });
});

it("does not confirm a 200 without a completed persistence result", async () => {
  const admin = fixture();
  const response = await runReservedSync("run", admin, "https://local", {}, async () => Response.json({ ok: true, counts: { daily: 1 } }));
  expect(response).toMatchObject({ ok: false, state: "indeterminate", error_code: "SYNC_RESULT_UNCONFIRMED" });
});
it("retains safe numeric Meta codes and excludes provider messages", async () => {
  const admin = fixture({ ...run, source: "meta_ads" });
  const response = await runReservedSync("run", admin, "https://local", {}, async () => Response.json({ ok: false, meta_error: { code: 190, subcode: 463, message: "sensitive-provider-text" } }, { status: 502 }));
  expect(response.error_code).toBe("META_API_190_463");
  expect(JSON.stringify(admin.rpc.mock.calls)).not.toContain("sensitive-provider-text");
});
