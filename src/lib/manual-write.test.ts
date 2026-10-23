import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { assertManualWriteConfirmed } from "./manual-write";

const expected = { client_id: 1, scope: "business", payload: { goals: { media_budget: 123.45 }, delivery: { posts_published: 2 } } };
describe("confirmação de gravação com o SDK Supabase instalado e transporte controlado", () => {
  it.each(["success", "empty", "rls"])("%s exige representação do registro e preserva erro RLS", async mode => {
    const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(
      mode === "rls" ? { code: "42501", message: "RLS recusou", details: null, hint: null }
        : mode === "empty" ? [] : [{ scope: expected.scope, payload: { delivery: expected.payload.delivery, goals: expected.payload.goals }, client_id: 1 }],
    ), { status: mode === "rls" ? 403 : 201, headers: { "Content-Type": "application/json" } }));
    const client = createClient("https://write-test.supabase.co", "synthetic-public-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: transport },
    });
    const { data, error } = await client.from("dashboard_manual_inputs").upsert(expected, { onConflict: "client_id,scope" }).select("client_id,scope,payload");
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0];
    expect(new URL(String(url)).searchParams.get("select")).toBe("client_id,scope,payload");
    expect(new Headers(init?.headers).get("Prefer")).toContain("return=representation");
    if (mode === "rls") expect(error?.code).toBe("42501");
    else if (mode === "empty") expect(() => assertManualWriteConfirmed(data, expected)).toThrow("único registro");
    else { expect(error).toBeNull(); expect(() => assertManualWriteConfirmed(data, expected)).not.toThrow(); }
  });
  it("não normaliza payload divergente para fabricar confirmação", () => {
    expect(() => assertManualWriteConfirmed([{ ...expected, payload: { ...expected.payload, extra: true } }], expected)).toThrow("difere");
    expect(() => assertManualWriteConfirmed([{ ...expected, payload: { goals: {}, delivery: expected.payload.delivery } }], expected)).toThrow("difere");
  });
});
