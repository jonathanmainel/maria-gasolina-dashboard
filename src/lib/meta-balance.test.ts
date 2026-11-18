import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), session: vi.fn() }));
vi.mock("./api", () => ({ CLIENT_SLUG: "synthetic-client", getClientId: async () => 1, isDemoMode: false }));
vi.mock("./supabase", () => ({ supabase: { rpc: fake.rpc, functions: { invoke: fake.invoke }, auth: { getSession: fake.session } } }));
import { loadLatestBalances, loadMetaBalanceStatus, metaBalanceMessage, requestMetaBalance } from "./meta-balance";
beforeEach(() => {
  vi.resetAllMocks(); fake.rpc.mockResolvedValue({ data: [], error: null });
  fake.session.mockResolvedValue({ data: { session: { user: { id: "verified" }, access_token: "synthetic-session" } }, error: null });
  fake.invoke.mockResolvedValue({ data: { state: "success" }, error: null });
});
describe("financial backend client", () => {
  it("reads current balances without the historical period and scopes status to client", async () => {
    await loadLatestBalances(); await loadMetaBalanceStatus();
    expect(fake.rpc.mock.calls).toEqual([["get_retaguarda_latest_balances", { p_client_id: 1 }], ["get_retaguarda_meta_balance_status", { p_client_id: 1 }]]);
  });
  it("invokes an actual backend collection without amount, author, secret or arbitrary origin", async () => {
    await requestMetaBalance("123", "request-key", "verified");
    expect(fake.invoke).toHaveBeenCalledWith("request-meta-balance", { body: { client_slug: "synthetic-client", account_id: "123", request_key: "request-key" },
      headers: { Authorization: "Bearer synthetic-session" } });
  });
  it("stops when a session expires or changes", async () => {
    await expect(requestMetaBalance("123", "key", "different")).rejects.toThrow("sessão"); expect(fake.invoke).not.toHaveBeenCalled();
  });
  it.each([[401,"sessão"], [403,"perfil"], [409,"preservado"], [429,"intervalo"], [503,"confirmar"]])("does not announce success on HTTP %s", async (status, message) => {
    fake.invoke.mockResolvedValue({ data: null, error: { context: new Response("{}", { status: status as number }) } });
    await expect(requestMetaBalance("123", "key", "verified")).rejects.toThrow(message as string);
  });
  it("explains the disabled homologation flag without accepting a saved measurement", async () => {
    fake.invoke.mockResolvedValue({ data: null, error: { context: Response.json({ error_code: "BALANCE_NOT_HOMOLOGATED" }, { status: 503 }) } });
    await expect(requestMetaBalance("123", "key", "verified")).rejects.toThrow("ainda não homologada");
  });
  it("rejects an ambiguous success response and preserves a missing state", async () => {
    fake.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(requestMetaBalance("123", "key", "verified")).rejects.toThrow("não confirmada");
    expect(metaBalanceMessage(undefined)).toContain("Nenhuma coleta");
  });
  it("does not replace read errors with empty data or zero", async () => {
    fake.rpc.mockResolvedValue({ data: null, error: new Error("unavailable") });
    await expect(loadLatestBalances()).rejects.toThrow("unavailable");
  });
});
