import { describe, expect, it, vi } from "vitest";
vi.mock("./api", () => ({ CLIENT_SLUG: "maria-gasolina", isDemoMode: false }));
const invoke = vi.hoisted(() => vi.fn());
vi.mock("./supabase", () => ({ supabase: { functions: { invoke } } }));
import { activeMarketingRun, affectedMarketingQueries, requestMarketingSync, syncStateLabel, type MarketingSourceStatus } from "./marketing-sync";
describe("marketing sync client", () => {
  it("calls only the JWT endpoint with no client role, dates or internal secrets", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await requestMarketingSync(["ga4"], "uuid");
    expect(invoke).toHaveBeenCalledWith("request-dashboard-sync", { body: { action: "request", client_slug: "maria-gasolina", sources: ["ga4"], request_key: "uuid" }, signal: expect.any(AbortSignal) });
  });
  it("keeps no-data and already-processed successes separate from failures", () => {
    const item = { latest_run: { status: "success", database_write_status: "no_data" } } as MarketingSourceStatus;
    expect(syncStateLabel(item)).toBe("Concluída sem novas linhas");
    expect(activeMarketingRun(item.latest_run)).toBe(false);
    expect(syncStateLabel({ ...item, latest_run: { ...item.latest_run!, database_write_status: "already_processed" } })).toBe("Dados já processados");
    expect(affectedMarketingQueries("ga4")).toContain("site-events");
    expect(affectedMarketingQueries("google_ads")).not.toContain("crm");
  });
});
