import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadFinancialEntries } from "./retaguarda-finance";

const fake = vi.hoisted(() => ({ clientId: vi.fn(), rows: vi.fn() }));
vi.mock("./api", () => ({ CLIENT_SLUG: "maria-gasolina", isDemoMode: false, getClientId: fake.clientId, fetchAllRows: fake.rows }));
vi.mock("./supabase", () => ({ supabase: {} }));
vi.mock("./reporting-period", () => ({ reportingToday: () => "2026-11-18" }));

beforeEach(() => {
  vi.resetAllMocks();
  fake.clientId.mockResolvedValue(7);
});

describe("leitura de saldos e histórico", () => {
  it("mantém o cliente, exclui datas futuras e não aplica o filtro global ao saldo conhecido", async () => {
    const query = { eq: vi.fn(), gte: vi.fn(), lte: vi.fn(), order: vi.fn() };
    Object.values(query).forEach(fn => fn.mockReturnValue(query));
    fake.rows.mockImplementation(async (_table, _columns, apply) => { apply(query); return []; });
    await expect(loadFinancialEntries()).resolves.toEqual([]);
    expect(query.eq).toHaveBeenCalledWith("client_id", 7);
    expect(query.lte).toHaveBeenCalledWith("reference_date", "2026-11-18");
    expect(query.gte).not.toHaveBeenCalled();
    expect(query.order.mock.calls).toEqual([["created_at"], ["id"]]);
  });

  it("preserva o contrato de leitura por período quando solicitado explicitamente", async () => {
    const query = { eq: vi.fn(), gte: vi.fn(), lte: vi.fn(), order: vi.fn() };
    Object.values(query).forEach(fn => fn.mockReturnValue(query));
    fake.rows.mockImplementation(async (_table, _columns, apply) => { apply(query); return []; });
    await loadFinancialEntries({ start: "2026-10-01", end: "2026-10-31" });
    expect(query.gte).toHaveBeenCalledWith("reference_date", "2026-10-01");
    expect(query.lte).toHaveBeenCalledWith("reference_date", "2026-10-31");
  });

  it("não converte falhas da fonte em histórico vazio ou saldo zero", async () => {
    fake.rows.mockRejectedValue(new Error("Fonte indisponível"));
    await expect(loadFinancialEntries()).rejects.toThrow("Fonte indisponível");
  });
});
