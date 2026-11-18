import { describe, expect, it, vi } from "vitest";
import { BalanceError, parseMetaAvailableFunds, readMetaAvailableFunds } from "./meta-balance.ts";

// Synthetic sanitized responses, NOT a capture of the production credential.
const account = "123456789";
const response = (display = "Saldo disponível (R$ 1.234,56)") => ({
  id: `act_${account}`, account_id: account, currency: "BRL", is_prepay_account: true,
  funding_source_details: { type: 20, display_string: display }, balance: "999999",
});
describe("Meta stored balance, strict provisional contract", () => {
  it.each([["1.234,56", "1234.56"], ["0,00", "0.00"], ["12,34", "12.34"], ["999.999.999.999,99", "999999999999.99"]])
    ("preserves exact cents %s", (brl, expected) => expect(parseMetaAvailableFunds(response(`Saldo disponível (R$ ${brl})`), account)).toBe(expected));
  it.each(["Saldo disponível (R$ -1,00)", "Saldo disponível (R$ 01,00)", "Saldo disponível (R$ 1.23)", "Saldo disponível (R$ NaN)",
    "Saldo disponível (R$ Infinity)", "Saldo disponível (US$ 1,00)", "Saldo disponível (R$ 1,000)", "Saldo disponível (R$ 1.00,00)",
    "Saldo devedor (R$ 1,00)", "Orçamento disponível (R$ 1,00)", "Saldo disponível (R$ 1,00) e crédito R$ 2,00", "R$ 1,00", ""])
    ("rejects unknown or ambiguous display %s", display => expect(() => parseMetaAvailableFunds(response(display), account)).toThrow(BalanceError));
  it.each([
    [{ id: "act_other" }, "META_ACCOUNT_MISMATCH"], [{ account_id: "other" }, "META_ACCOUNT_MISMATCH"],
    [{ currency: "USD" }, "META_CURRENCY_UNSUPPORTED"], [{ is_prepay_account: false }, "META_NOT_PREPAID"],
    [{ is_prepay_account: "true" }, "META_NOT_PREPAID"], [{ funding_source_details: null }, "META_FUNDING_UNSUPPORTED"],
    [{ funding_source_details: { type: 1, display_string: "Saldo disponível (R$ 1,00)" } }, "META_FUNDING_UNSUPPORTED"],
    [{ funding_source_details: { type: 20 } }, "META_BALANCE_FORMAT_UNSUPPORTED"],
  ])("validates identity, currency and funding source", (patch, code) => {
    expect(() => parseMetaAvailableFunds({ ...response(), ...patch }, account)).toThrow(code);
  });
  it("does not fall back to amount, balance, coupons, budgets or limits", () => {
    expect(() => parseMetaAvailableFunds({ ...response(), funding_source_details: { type: 20, amount: 10000 }, spend_cap: "20000" }, account))
      .toThrow("META_BALANCE_FORMAT_UNSUPPORTED");
  });
  it("performs one official GET with private header, bounded time and receipt timestamp", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(response()));
    const result = await readMetaAvailableFunds({ accountId: account, version: "v26.0", token: "synthetic-private-token", fetcher,
      now: () => new Date("2026-11-18T15:00:00Z") });
    expect(result).toEqual({ amount: "1234.56", currency: "BRL", measuredAt: "2026-11-18T15:00:00.000Z", parser: "meta-stored-balance-pt-br-v1" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url.origin).toBe("https://graph.facebook.com"); expect(url.pathname).toBe(`/v26.0/act_${account}`);
    expect(url.search).not.toContain("synthetic-private-token"); expect(init.method).toBe("GET");
    expect(init.redirect).toBe("error"); expect(init.signal).toBeInstanceOf(AbortSignal); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([401,403,429,500])("sanitizes HTTP %s without returning provider body", async status => {
    const fetcher = vi.fn().mockResolvedValue(new Response("private provider text", { status }));
    await expect(readMetaAvailableFunds({ accountId: account, version: "v26.0", token: "fake", fetcher }))
      .rejects.toThrow(status === 429 ? "META_RATE_LIMIT" : status < 500 ? "META_PERMISSION_OR_AUTH" : "META_API_FAILED");
  });
  it("bounds network failures and never writes zero on timeout", async () => {
    await expect(readMetaAvailableFunds({ accountId: account, version: "v26.0", token: "fake", fetcher: vi.fn().mockRejectedValue(new Error("private URL")) }))
      .rejects.toThrow("META_NETWORK_OR_TIMEOUT");
  });
  it.each(["null", "not JSON", JSON.stringify({error: { message: "private" }})])("rejects invalid payload", async text => {
    await expect(readMetaAvailableFunds({ accountId: account, version: "v26.0", token: "fake", fetcher: vi.fn().mockResolvedValue(new Response(text)) })).rejects.toThrow(BalanceError);
  });
});
