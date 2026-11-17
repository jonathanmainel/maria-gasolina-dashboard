import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveFinancialEntry, type FinancialDraft } from "./retaguarda-finance";

const fake = vi.hoisted(() => ({
  session: vi.fn(), clientId: vi.fn(), post: vi.fn(), lookup: vi.fn(),
  authorization: vi.fn(), lookupAuthorization: vi.fn(),
}));
vi.mock("./api", () => ({
  CLIENT_SLUG: "maria-gasolina", isDemoMode: false,
  getClientId: fake.clientId, fetchAllRows: vi.fn(),
}));
vi.mock("./supabase", () => ({
  supabase: {
    auth: { getSession: fake.session },
    from: () => ({
      insert: (payload: unknown) => ({
        select: () => ({
          single: () => ({
            setHeader: (name: string, value: string) => {
              fake.authorization(name, value);
              return fake.post(payload);
            },
          }),
        }),
      }),
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => ({
              setHeader: (name: string, value: string) => {
                fake.lookupAuthorization(name, value);
                return fake.lookup();
              },
            }),
          }),
        }),
      }),
    }),
  },
}));

const draft: FinancialDraft = {
  platform: "meta_ads", account_id: "account-a", reference_date: "2026-11-16",
  available_balance_brl: "12.34", estimated_daily_spend_brl: "0.00",
  previous_id: null, request_key: "test-request",
};

beforeEach(() => {
  vi.resetAllMocks();
  fake.clientId.mockResolvedValue(1);
  fake.session.mockResolvedValue({ data: { session: { user: { id: "author" }, access_token: "synthetic-token" } }, error: null });
  fake.post.mockResolvedValue({ data: null, error: { code: "23505" }, status: 409 });
  fake.lookup.mockResolvedValue({ data: null, status: 200 });
});

describe("envio financeiro protegido pela sessão", () => {
  it("interrompe o envio se a sessão atual pertencer a outra pessoa", async () => {
    await expect(saveFinancialEntry(draft, "previous-user")).rejects.toThrow("Sua sessão expirou ou mudou");
    expect(fake.post).not.toHaveBeenCalled();
    expect(fake.clientId).not.toHaveBeenCalled();
  });

  it("confirma uma resposta perdida apenas com a chave, autoria e valores exatos", async () => {
    fake.post.mockResolvedValue({ data: null, error: { message: "network" }, status: 0 });
    fake.lookup.mockResolvedValue({ data: {
      ...draft, id: "record", origin: "manual", created_by: "author",
      available_balance_brl: 12.34, estimated_daily_spend_brl: 0,
    }, status: 200 });
    await expect(saveFinancialEntry(draft, "author")).resolves.toBeUndefined();
    expect(fake.authorization).toHaveBeenCalledWith("Authorization", "Bearer synthetic-token");
    expect(fake.lookupAuthorization).toHaveBeenCalledWith("Authorization", "Bearer synthetic-token");
    expect(fake.post).toHaveBeenCalledWith({ ...draft, client_id: 1 });
  });

  it("rejeita a chave de um registro com conteúdo diferente", async () => {
    fake.lookup.mockResolvedValue({ data: {
      ...draft, id: "record", origin: "manual", created_by: "author",
      available_balance_brl: 12.35, estimated_daily_spend_brl: 0,
    }, status: 200 });
    await expect(saveFinancialEntry(draft, "author")).rejects.toThrow("Este identificador já pertence a outro registro");
  });

  it("indica sessão expirada sem tentar consultar a chave com um token recusado", async () => {
    fake.post.mockResolvedValue({ data: null, error: { code: "PGRST303" }, status: 401 });
    await expect(saveFinancialEntry(draft, "author")).rejects.toThrow("Sua sessão expirou ou mudou");
    expect(fake.lookup).not.toHaveBeenCalled();
  });
});
