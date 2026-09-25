import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("./supabase", () => ({ supabase: { functions: { invoke } } }));

const {
  ACCEPTED_EXTENSIONS, hasAcceptedExtension, ImportError, importErrorLabel, importNetworkUnits,
  matchColumn, normalizeHeader, rowsFromGrid, WorkbookError,
} = await import("./network-import");

// Cabeçalhos reais da planilha da rede.
const HEADERS = ["Unidade / Condomínio", "Bairro", "Cidade", "UF", "CEP"];

const grid = (...rows: Array<Array<string | number | null>>) => [HEADERS, ...rows];

beforeEach(() => {
  invoke.mockReset();
});

describe("formatos aceitos", () => {
  it("aceita xlsx e xls", () => {
    expect(ACCEPTED_EXTENSIONS).toEqual([".xlsx", ".xls"]);
    expect(hasAcceptedExtension("Relatorio Lojas CEPs - Setembro 2026.xlsx")).toBe(true);
    expect(hasAcceptedExtension("base.xls")).toBe(true);
    expect(hasAcceptedExtension("BASE.XLSX")).toBe(true);
  });

  it("recusa qualquer outro formato", () => {
    for (const name of ["base.csv", "base.numbers", "base.pdf", "base.xlsx.exe", "base"]) {
      expect(hasAcceptedExtension(name)).toBe(false);
    }
  });
});

describe("mapeamento dos cabeçalhos", () => {
  it("reconhece os cinco cabeçalhos da planilha real", () => {
    expect(HEADERS.map(matchColumn)).toEqual(["unit_name", "neighborhood", "city", "state", "postal_code"]);
  });

  it("tolera diferença de caixa, acento e espaçamento", () => {
    expect(matchColumn("UNIDADE / CONDOMINIO")).toBe("unit_name");
    expect(matchColumn("  unidade/condomínio ")).toBe("unit_name");
    expect(matchColumn("CIDADE")).toBe("city");
    expect(matchColumn("Município")).toBe("city");
    expect(matchColumn("Estado")).toBe("state");
    expect(matchColumn("  Cep ")).toBe("postal_code");
    expect(matchColumn("Código Postal")).toBe("postal_code");
  });

  it("não reconhece cabeçalho de outra planilha", () => {
    expect(matchColumn("Investimento")).toBeNull();
    expect(matchColumn("")).toBeNull();
    expect(normalizeHeader("Unidade / Condomínio")).toBe("unidade condominio");
  });
});

describe("rowsFromGrid", () => {
  it("converte as linhas para as chaves canônicas do contrato", () => {
    const { rows } = rowsFromGrid(grid(
      ["ACQUA GALLERIA", "Fazenda São Quirino", "Campinas", "SP", "13091-702"],
    ));
    expect(rows).toEqual([{
      unit_name: "ACQUA GALLERIA",
      neighborhood: "Fazenda São Quirino",
      city: "Campinas",
      state: "SP",
      postal_code: "13091-702",
    }]);
  });

  it("encontra o cabeçalho depois de linhas de título", () => {
    const { rows } = rowsFromGrid([
      ["Relatório de lojas", null, null, null, null],
      [null, null, null, null, null],
      HEADERS,
      ["UNIDADE A", "Centro", "Jundiaí", "SP", "13201-000"],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].city).toBe("Jundiaí");
  });

  it("aceita as colunas em qualquer ordem e ignora colunas extras", () => {
    const { rows, ignoredHeaders } = rowsFromGrid([
      ["CEP", "UF", "Cidade", "Bairro", "Unidade / Condomínio", "Observações"],
      ["13091-702", "SP", "Campinas", "Cambuí", "UNIDADE B", "qualquer coisa"],
    ]);
    expect(rows[0]).toEqual({
      unit_name: "UNIDADE B", neighborhood: "Cambuí", city: "Campinas", state: "SP", postal_code: "13091-702",
    });
    expect(ignoredHeaders).toEqual(["Observações"]);
  });

  it("descarta linha totalmente vazia sem transformá-la em linha inválida", () => {
    const { rows } = rowsFromGrid(grid(
      ["UNIDADE A", "Centro", "Campinas", "SP", "13010-000"],
      [null, null, null, null, null],
      ["UNIDADE B", "Cambuí", "Campinas", "SP", "13025-000"],
    ));
    expect(rows).toHaveLength(2);
  });

  it("repõe o zero do CEP que o Excel guardou como número", () => {
    const { rows } = rowsFromGrid(grid(
      ["UNIDADE SP", "Bela Vista", "São Paulo", "SP", 1310100],
      ["UNIDADE CPS", "Cambuí", "Campinas", "SP", 13025000],
    ));
    expect(rows[0].postal_code).toBe("01310100");
    expect(rows[1].postal_code).toBe("13025000");
  });

  it("não preenche campo ausente: a linha sobe vazia para o backend julgar", () => {
    const { rows } = rowsFromGrid(grid(["UNIDADE A", null, "Campinas", "SP", "13010-000"]));
    expect(rows[0].neighborhood).toBe("");
  });

  it("recusa planilha sem as colunas obrigatórias, dizendo quais faltam", () => {
    try {
      rowsFromGrid([["Cidade", "UF"], ["Campinas", "SP"]]);
      expect.unreachable("deveria ter recusado");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkbookError);
      expect((error as InstanceType<typeof WorkbookError>).code).toBe("MISSING_COLUMNS");
      expect((error as InstanceType<typeof WorkbookError>).missing).toEqual(["unit_name", "neighborhood", "postal_code"]);
      expect((error as Error).message).toContain("Unidade / Condomínio");
    }
  });

  it("recusa planilha que é outro relatório", () => {
    expect(() => rowsFromGrid([["Campanha", "Investimento"], ["MG | FRANQ", 1200]]))
      .toThrowError(/cabeçalho/i);
  });

  it("recusa planilha só com cabeçalho", () => {
    try {
      rowsFromGrid(grid());
      expect.unreachable("deveria ter recusado");
    } catch (error) {
      expect((error as InstanceType<typeof WorkbookError>).code).toBe("EMPTY_SHEET");
    }
  });
});

const dryRunOk = {
  ok: true,
  status: "validated",
  error_code: null,
  dry_run: true,
  database_write_performed: false,
  snapshot_replaced: false,
  summary: { total_rows: 102, valid_rows: 101, duplicate_rows: 1, invalid_rows: 0, unresolved_cities: 0 },
  errors: [],
};

const rows = [{ unit_name: "A", neighborhood: "B", city: "Campinas", state: "SP", postal_code: "13010-000" }];

describe("importNetworkUnits", () => {
  it("monta o payload do contrato com client_slug, filename e dry_run", async () => {
    invoke.mockResolvedValue({ data: dryRunOk, error: null });
    await importNetworkUnits({ filename: "base.xlsx", rows, dryRun: true });

    expect(invoke).toHaveBeenCalledTimes(1);
    const [name, options] = invoke.mock.calls[0];
    expect(name).toBe("import-network-units");
    expect(options.body).toEqual({
      client_slug: "maria-gasolina",
      filename: "base.xlsx",
      dry_run: true,
      rows,
    });
  });

  it("valida sem gravar quando dryRun é true", async () => {
    invoke.mockResolvedValue({ data: dryRunOk, error: null });
    const result = await importNetworkUnits({ filename: "base.xlsx", rows, dryRun: true });
    expect(result.database_write_performed).toBe(false);
    expect(result.snapshot_replaced).toBe(false);
    expect(result.summary.valid_rows).toBe(101);
  });

  it("grava e substitui o snapshot quando dryRun é false", async () => {
    invoke.mockResolvedValue({
      data: { ...dryRunOk, dry_run: false, status: "success", import_id: 9, database_write_performed: true, snapshot_replaced: true },
      error: null,
    });
    const result = await importNetworkUnits({ filename: "base.xlsx", rows, dryRun: false });
    expect(invoke.mock.calls[0][1].body.dry_run).toBe(false);
    expect(result.snapshot_replaced).toBe(true);
    expect(result.import_id).toBe(9);
  });

  // 422 é resultado de validação, não falha de transporte: o corpo estruturado
  // tem que chegar à tela para os motivos aparecerem.
  it("devolve o corpo da validação reprovada em vez de lançar", async () => {
    const body = {
      ok: false,
      status: "validation_failed",
      error_code: "INVALID_STATE",
      summary: { total_rows: 3, valid_rows: 1, duplicate_rows: 0, invalid_rows: 2, unresolved_cities: 0 },
      errors: [
        { row: 2, code: "INVALID_STATE", field: "state", message: "Invalid Brazilian state: XX." },
        { row: 3, code: "INVALID_POSTAL_CODE", field: "postal_code", message: "Postal code must contain 8 digits: 123." },
      ],
    };
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
        context: { json: async () => body },
      }),
    });

    const result = await importNetworkUnits({ filename: "base.xlsx", rows, dryRun: true });
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("INVALID_STATE");
    expect(result.summary.invalid_rows).toBe(2);
    expect(result.errors).toHaveLength(2);
  });

  // A função recusa sessão ausente, cliente sem permissão e payload grande
  // demais antes de validar, e nesses casos o corpo não tem `summary`. Sem este
  // tratamento a tela mostraria "non-2xx status code" no lugar do motivo.
  it.each([
    ["UNAUTHENTICATED", 401, /sessão/i],
    ["CLIENT_FORBIDDEN", 403, /permissão/i],
    ["PAYLOAD_TOO_LARGE", 413, /tamanho/i],
    ["TOO_MANY_ROWS", 413, /5\.000 linhas/],
  ])("traduz a recusa %s, que vem sem summary", async (code, _status, message) => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
        context: { json: async () => ({ ok: false, error_code: code }) },
      }),
    });

    await expect(importNetworkUnits({ filename: "base.xlsx", rows, dryRun: true }))
      .rejects.toThrowError(ImportError);
    await expect(importNetworkUnits({ filename: "base.xlsx", rows, dryRun: true }))
      .rejects.toThrow(message);
  });

  it("preserva o código da recusa na exceção", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("non-2xx"), {
        context: { json: async () => ({ ok: false, error_code: "UNAUTHENTICATED" }) },
      }),
    });
    await expect(importNetworkUnits({ filename: "base.xlsx", rows, dryRun: true }))
      .rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("propaga falha sem corpo interpretável", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("Failed to fetch") });
    await expect(importNetworkUnits({ filename: "base.xlsx", rows, dryRun: true }))
      .rejects.toThrow("Failed to fetch");
  });

  it("recusa resposta fora do contrato", async () => {
    invoke.mockResolvedValue({ data: { unexpected: true }, error: null });
    await expect(importNetworkUnits({ filename: "base.xlsx", rows, dryRun: true }))
      .rejects.toThrow(/inesperada/i);
  });
});

describe("importErrorLabel", () => {
  it("traduz os códigos do contrato, sem mostrar JSON", () => {
    expect(importErrorLabel("INVALID_STATE")).toMatch(/UF/);
    expect(importErrorLabel("INVALID_POSTAL_CODE")).toMatch(/CEP/);
    expect(importErrorLabel("NO_VALID_ROWS")).toMatch(/validação/i);
    expect(importErrorLabel("UNAUTHENTICATED")).toMatch(/sessão/i);
    expect(importErrorLabel("SNAPSHOT_REPLACE_FAILED")).toMatch(/preservada/i);
  });

  it("tem mensagem legível para código desconhecido", () => {
    expect(importErrorLabel("ALGO_NOVO")).toBe("A importação não pôde ser concluída.");
    expect(importErrorLabel(null)).toBe("A importação não pôde ser concluída.");
  });
});
