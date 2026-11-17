import { describe, expect, it } from "vitest";
import { financialDays, parseBrl, platformFinancialSummary, type FinancialAccount, type FinancialEntry } from "./retaguarda-finance";
import { dateTime } from "./format";

const account: FinancialAccount = { account_id: "01", platform: "meta_ads", account_name: "Principal", active: true };
const entry: FinancialEntry = {
  id: "original", platform: "meta_ads", account_id: "01", reference_date: "2026-11-16",
  origin: "manual", measured_at: "2026-11-16T10:00:00Z", created_at: "2026-11-16T10:00:00Z",
  created_by: "auth-user", previous_id: null, available_balance_brl: 0, estimated_daily_spend_brl: 12.34,
};

describe("financeiro da Retaguarda", () => {
  it.each([["0", "0.00"], ["R$ 1.234,56", "1234.56"], ["5,1", "5.10"], ["999.999.999.999,99", "999999999999.99"]])
    ("normaliza %s sem perder os centavos", (input, output) => expect(parseBrl(input)).toBe(output));

  it.each(["", "-1,20", "+1", "1,234", "1.23", "1e3", "NaN", "Infinity", "1.000.000.000.000,00"])
    ("rejeita o valor inválido %s", (input) => expect(parseBrl(input)).toBeNull());

  it("recupera a versão vigente e as anteriores mantendo data, conta e plataforma", () => {
    const correction = { ...entry, id: "correction", previous_id: entry.id, available_balance_brl: 31.9 };
    const next = { ...correction, id: "next", previous_id: correction.id, available_balance_brl: 45 };
    const other = { ...entry, id: "other", account_id: "02" };
    const anotherDay = { ...entry, id: "another-day", reference_date: "2026-11-15" };
    expect(financialDays([next, other, correction, anotherDay, entry, next])).toEqual([
      { current: next, versions: [correction, entry] },
      { current: other, versions: [] },
      { current: anotherDay, versions: [] },
    ]);
  });

  it("usa São Paulo para a hora de medição, inclusive na mudança de dia", () => {
    expect(dateTime("2026-11-17T01:30:00Z")).toMatch(/16\/11\/2026.*22:30/);
  });

  it("soma centavos somente quando todas as contas ativas têm os valores na mesma data", () => {
    const second = { ...account, account_id: "02" };
    const inactive = { ...account, account_id: "03", active: false };
    const otherPlatform = { ...account, platform: "google_ads" as const, account_id: "04" };
    const previous = { ...entry, reference_date: "2026-11-15", available_balance_brl: 25 };
    const other = { ...entry, account_id: "02", available_balance_brl: 1.9, estimated_daily_spend_brl: 3.21 };
    expect(platformFinancialSummary([account, second, inactive, otherPlatform], [entry, previous, other], "meta_ads"))
      .toMatchObject({ balance: 1.9, estimate: 15.55, date: "2026-11-16", items: [{ latest: entry }, { latest: other }] });
    expect(platformFinancialSummary([account, second], [entry], "meta_ads")).toMatchObject({ balance: null, estimate: null });
    expect(platformFinancialSummary([account, second], [entry, { ...other, reference_date: previous.reference_date }], "meta_ads"))
      .toMatchObject({ balance: null, estimate: null, date: undefined });
  });

  it("distingue o zero registrado de um campo ausente em importação", () => {
    expect(platformFinancialSummary([account], [{ ...entry, origin: "import", estimated_daily_spend_brl: null }], "meta_ads"))
      .toMatchObject({ balance: 0, estimate: null });
  });
});
