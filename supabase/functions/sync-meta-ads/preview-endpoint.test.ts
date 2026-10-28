import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ enrich: vi.fn() }));
vi.mock("../_shared/dashboard.ts", () => ({
  resolveDashboardClient: async () => ({ data: { id: 1 }, error: null }),
  listSourceAccounts: async () => ({
    data: [{ account_id: "123" }],
    error: null,
  }),
}));
vi.mock("./meta-creative.ts", async (original) => ({
  ...(await original<typeof import("./meta-creative.ts")>()),
  enrichMetaCreativePreviews: mocks.enrich,
}));
import endpoint from "./index.ts";
beforeEach(() => {
  mocks.enrich.mockReset();
  vi.stubGlobal("Deno", {
    env: {
      get: (key: string) =>
        key === "META_API_VERSION" ? "v26.0" : "SYNTHETIC_TOKEN",
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("Unexpected marketing API call");
    }),
  );
  mocks.enrich.mockResolvedValue({
    inspected: 1,
    inserted: 0,
    updated: 0,
    reused: 1,
    failed: 0,
    failures: [],
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("selective endpoint retains the integrated collector guards", () => {
  const body = {
    client_slug: "maria-gasolina",
    start_date: "2026-10-01",
    end_date: "2026-10-27",
    dry_run: true,
    preview_ad_ids: ["123", "456"],
  };
  const call = async (
    value: any,
    rpc = vi.fn(async () => ({ data: true, error: null })),
  ) => {
    const response = await (endpoint.fetch as any)(
      new Request("https://fixture.invalid/sync-meta-ads", {
        method: "POST",
        body: JSON.stringify(value),
      }),
      { supabaseAdmin: { rpc } },
    );
    return { response, rpc, json: await response.json() };
  };
  it("rejects an empty list before querying data", async () => {
    const { response, rpc } = await call({ ...body, preview_ad_ids: [] });
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.enrich).not.toHaveBeenCalled();
  });
  it("does not authorize preview writes without a reservation", async () => {
    const { response, json } = await call({ ...body, dry_run: false });
    expect(response.status).toBe(409);
    expect(json.error_code).toBe("SYNC_RESERVATION_REQUIRED");
    expect(mocks.enrich).not.toHaveBeenCalled();
  });
  it("rejects a reservation which belongs to another run/client", async () => {
    const { response } = await call(
      {
        ...body,
        dry_run: false,
        automation_run_id: "10000000-0000-4000-8000-000000000001",
      },
      vi.fn(async () => ({ data: false, error: null })),
    );
    expect(response.status).toBe(409);
    expect(mocks.enrich).not.toHaveBeenCalled();
  });
  it("dry run passes the exact selection and never queries or writes metric APIs", async () => {
    const { response, rpc } = await call(body);
    expect(response.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.enrich).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 1,
        accountIds: ["123"],
        previewAdIds: ["123", "456"],
        dryRun: true,
        adRows: [],
      }),
    );
  });
  it("write mode still claims the integrated reservation before enrichment", async () => {
    const { response, rpc } = await call({
      ...body,
      dry_run: false,
      automation_run_id: "10000000-0000-4000-8000-000000000001",
    });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "begin_dashboard_sync_collection",
      expect.objectContaining({ p_client_id: 1, p_source: "meta_ads" }),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.enrich).toHaveBeenCalledTimes(1);
  });
});
