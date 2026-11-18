import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMetaBalanceDiagnostic, fundingDisplayShape, type DiagnosticDependencies } from "./meta-balance-diagnostic.ts";
import { META_BALANCE_ACCOUNT_ID as id } from "./meta-balance-config.ts";
import { BalanceError } from "./meta-balance.ts";
const time = new Date("2026-11-18T18:00:00Z");
let deps: DiagnosticDependencies;
const req = (body = "{}", method = "POST") => new Request("https://local.invalid/probe", { method, ...(method === "POST" ? { body } : {}) });
const fixture = (display = "Saldo disponível (R$ 123,45)") => ({ id: `act_${id}`, account_id: id, currency: "BRL", is_prepay_account: true,
  funding_source_details: { type: 20, display_string: display, private_payment_id: "PRIVATE" }, balance: "PRIVATE" });
beforeEach(() => { deps = { authorize: vi.fn().mockResolvedValue(true), enabled: true, expiresAt: "2026-11-18T18:10:00Z", now: () => time,
  read: vi.fn().mockResolvedValue({ payload: fixture(), measuredAt: time.toISOString() }) }; });
describe("bounded read-only administrative diagnostic", () => {
  it("returns only validated normalized funds and sanitized shape", async () => {
    const result = await createMetaBalanceDiagnostic(deps)(req()); const json = await result.json();
    expect(json).toMatchObject({ account_id: id, available_balance_brl: "123.45", parser_accepted: true, database_write_performed: false });
    expect(JSON.stringify(json)).not.toContain("PRIVATE"); expect(json.display_shape).toBe("{AVAILABLE_PT} ({BRL_SYMBOL} ###,##)");
  });
  it("masks unknown text and never treats its number as confirmed funds", async () => {
    vi.mocked(deps.read).mockResolvedValue({ payload: fixture("SensitivePerson card 1234 email@test.invalid R$ 123,45"), measuredAt: time.toISOString() });
    const result = await createMetaBalanceDiagnostic(deps)(req()); const json = await result.json();
    expect(json).toMatchObject({ available_balance_brl: null, parser_accepted: false, error_code: "META_BALANCE_FORMAT_UNSUPPORTED" });
    expect(JSON.stringify(json)).not.toMatch(/SensitivePerson|1234|email@test/);
  });
  it("consumes one instance quota atomically even for simultaneous requests or provider failure", async () => {
    const handler = createMetaBalanceDiagnostic(deps);
    const results = await Promise.all([handler(req()), handler(req())]);
    expect(results.map(r => r.status).sort()).toEqual([200,429]); expect(deps.read).toHaveBeenCalledTimes(1);
  });
  it.each(["", "not-a-date", "2026-11-18T17:00:00Z", "2026-11-19T18:00:00Z"])("rejects expiration %s", async expiresAt => {
    deps.expiresAt = expiresAt; expect((await createMetaBalanceDiagnostic(deps)(req())).status).toBe(503); expect(deps.read).not.toHaveBeenCalled();
  });
  it("never calls Meta for disabled, unauthenticated or altered requests", async () => {
    deps.enabled = false; expect((await createMetaBalanceDiagnostic(deps)(req())).status).toBe(503);
    deps.enabled = true; vi.mocked(deps.authorize).mockResolvedValue(false);
    expect((await createMetaBalanceDiagnostic(deps)(req())).status).toBe(403);
    vi.mocked(deps.authorize).mockResolvedValue(true);
    expect((await createMetaBalanceDiagnostic(deps)(req('{"account_id":"other"}'))).status).toBe(400);
    expect((await createMetaBalanceDiagnostic(deps)(req("x".repeat(100)))).status).toBe(400);
    expect((await createMetaBalanceDiagnostic(deps)(req("", "GET"))).status).toBe(405); expect(deps.read).not.toHaveBeenCalled();
  });
  it("sanitizes failures and consumes quota after the failed GET, without retries", async () => {
    vi.mocked(deps.read).mockRejectedValue(new BalanceError("META_PERMISSION_OR_AUTH")); const handler = createMetaBalanceDiagnostic(deps);
    expect((await handler(req())).status).toBe(502); expect((await handler(req())).status).toBe(429); expect(deps.read).toHaveBeenCalledTimes(1);
  });
  it("does not reveal arbitrary payment descriptors", () => { expect(fundingDisplayShape("Person 1234@example.com")).not.toMatch(/Person|1234|example/); });
});
