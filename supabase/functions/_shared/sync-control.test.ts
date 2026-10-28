import { describe, expect, it, vi } from "vitest";
import { authorizeCollection } from "./sync-control.ts";
describe("collector reservation", () => {
  const id = "12345678-1234-4234-8234-123456789abc";
  it("allows dry run without reserving or writing", async () => {
    const rpc = vi.fn();
    expect(await authorizeCollection({ rpc }, { dry_run: true }, 1, "google_ads", "2026-10-01", "2026-10-07")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("refuses direct writes and mismatched/already claimed runs", async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    const missing = await authorizeCollection({ rpc }, { dry_run: false }, 1, "google_ads", "2026-10-01", "2026-10-07");
    expect(missing?.status).toBe(409); expect(rpc).not.toHaveBeenCalled();
    expect((await authorizeCollection({ rpc }, { dry_run: false, automation_run_id: id }, 1, "meta_ads", "2026-10-01", "2026-10-07"))?.status).toBe(409);
    expect(rpc).toHaveBeenCalledWith("begin_dashboard_sync_collection", { p_run_id: id, p_client_id: 1, p_source: "meta_ads", p_start: "2026-10-01", p_end: "2026-10-07" });
  });
});
