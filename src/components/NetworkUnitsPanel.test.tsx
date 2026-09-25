// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NetworkUnitsSnapshot } from "../types";

// Fluxo do uploader da base de unidades, do ponto de vista de quem usa.
//
// O que estes testes protegem, acima de tudo: escolher um arquivo NUNCA grava.
// A primeira chamada é sempre `dry_run: true`, e a gravação só acontece depois
// de um clique explícito em "Atualizar base".

const rpc = vi.fn();
const invoke = vi.fn();
vi.mock("../lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));

// O SheetJS não é exercitado aqui: o parsing do arquivo é coberto em
// `network-import.test.ts` sobre a grade de células. Aqui o que importa é a
// sequência de chamadas e os estados da interface.
const parseUnitsWorkbook = vi.fn();
vi.mock("../lib/network-import", async () => {
  const actual = await vi.importActual<typeof import("../lib/network-import")>("../lib/network-import");
  return { ...actual, parseUnitsWorkbook: (file: File) => parseUnitsWorkbook(file) };
});

const { NetworkUnitsPanel } = await import("./NetworkUnitsPanel");
const { WorkbookError } = await import("../lib/network-import");

const snapshot: NetworkUnitsSnapshot = {
  units: [],
  cities: [],
  summary: {
    total_units: 101,
    total_cities: 23,
    unresolved_cities: 0,
    last_import_at: "2026-09-25T15:40:00.000Z",
    last_import: {
      id: 7, filename: "Relatorio Lojas CEPs - Setembro 2026.xlsx", status: "success",
      total_rows: 102, valid_rows: 101, duplicate_rows: 1, invalid_rows: 0, unresolved_cities: 0,
      created_at: "2026-09-25T15:39:50.000Z", completed_at: "2026-09-25T15:40:00.000Z",
    },
  },
  headquarters: { city: "Campinas", state: "SP" },
};

const rows = Array.from({ length: 101 }, (_, i) => ({
  unit_name: `UNIDADE ${i}`, neighborhood: "Centro", city: "Campinas", state: "SP", postal_code: "13010-000",
}));

const dryRunOk = {
  ok: true, status: "validated", error_code: null, dry_run: true,
  database_write_performed: false, snapshot_replaced: false,
  summary: { total_rows: 102, valid_rows: 101, duplicate_rows: 1, invalid_rows: 0, unresolved_cities: 0 },
  errors: [],
};

const importOk = {
  ...dryRunOk, dry_run: false, status: "success", import_id: 8,
  database_write_performed: true, snapshot_replaced: true,
};

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const file = (name: string) => new File(["conteúdo"], name, { type: "application/vnd.ms-excel" });

/** Dispara a seleção de arquivo no input escondido, como o clique no label faz. */
function selectFile(name = "Relatorio Lojas CEPs - Setembro 2026.xlsx") {
  const input = document.getElementById("network-units-file") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file(name)] } });
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  rpc.mockReset();
  invoke.mockReset();
  parseUnitsWorkbook.mockReset();
  rpc.mockResolvedValue({ data: snapshot, error: null });
  parseUnitsWorkbook.mockResolvedValue({
    filename: "Relatorio Lojas CEPs - Setembro 2026.xlsx", sheetName: "Lojas", rows, ignoredHeaders: [],
  });
});
afterEach(cleanup);

describe("estado atual da base", () => {
  it("mostra unidades, cidades, data e arquivo da última importação", async () => {
    render(<NetworkUnitsPanel />, { wrapper });

    await waitFor(() => expect(screen.getByText("101")).not.toBeNull());
    expect(screen.getByText("23")).not.toBeNull();
    expect(screen.getByText("unidades")).not.toBeNull();
    expect(screen.getByText("cidades")).not.toBeNull();
    expect(screen.getByText("Relatorio Lojas CEPs - Setembro 2026.xlsx")).not.toBeNull();
    // 25/09/2026 15:40 em America/Sao_Paulo (12:40 UTC-3 → o horário salvo é UTC).
    expect(screen.getByText(/25\/09\/2026/)).not.toBeNull();
  });

  it("não dá destaque a cidades não localizadas quando são zero", async () => {
    render(<NetworkUnitsPanel />, { wrapper });
    await waitFor(() => expect(screen.getByText("101")).not.toBeNull());
    expect(screen.queryByText("Sem localização")).toBeNull();
  });

  it("mostra as cidades não localizadas quando existem", async () => {
    rpc.mockResolvedValue({
      data: { ...snapshot, summary: { ...snapshot.summary, unresolved_cities: 2 } }, error: null,
    });
    render(<NetworkUnitsPanel />, { wrapper });
    await waitFor(() => expect(screen.getByText("Sem localização")).not.toBeNull());
    expect(screen.getByText("2 cidades")).not.toBeNull();
  });
});

describe("seleção do arquivo", () => {
  it("só aceita xlsx e xls no input", async () => {
    render(<NetworkUnitsPanel />, { wrapper });
    const input = document.getElementById("network-units-file") as HTMLInputElement;
    expect(input.getAttribute("accept")).toBe(".xlsx,.xls");
    expect(input.type).toBe("file");
    // Rótulo associado ao input: o seletor é acessível por teclado.
    const label = document.querySelector('label[for="network-units-file"]');
    expect(label?.textContent).toContain("Selecionar planilha");
  });

  it("recusa formato inválido sem chamar a Edge Function", async () => {
    parseUnitsWorkbook.mockRejectedValue(
      new WorkbookError("UNSUPPORTED_EXTENSION", "Formato não aceito. Envie um arquivo .xlsx ou .xls."),
    );
    render(<NetworkUnitsPanel />, { wrapper });
    selectFile("base.csv");

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Formato não aceito/));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("explica planilha sem as colunas obrigatórias, sem JSON bruto", async () => {
    parseUnitsWorkbook.mockRejectedValue(
      new WorkbookError("MISSING_COLUMNS", "A planilha não tem Cidade, UF.", ["city", "state"]),
    );
    render(<NetworkUnitsPanel />, { wrapper });
    selectFile();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("A planilha não tem Cidade, UF."));
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("validação em duas etapas", () => {
  it("valida com dry_run e não substitui a base ao selecionar o arquivo", async () => {
    invoke.mockResolvedValue({ data: dryRunOk, error: null });
    render(<NetworkUnitsPanel />, { wrapper });
    selectFile();

    await waitFor(() => expect(screen.getByRole("button", { name: /Atualizar base/ })).not.toBeNull());

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1].body.dry_run).toBe(true);
    expect(invoke.mock.calls[0][1].body.rows).toHaveLength(101);
    // Nenhuma gravação até aqui.
    expect(invoke.mock.calls.some(([, options]) => options.body.dry_run === false)).toBe(false);
  });

  it("mostra o resumo da validação com linhas, válidas, duplicatas e não localizadas", async () => {
    invoke.mockResolvedValue({ data: dryRunOk, error: null });
    const { container } = render(<NetworkUnitsPanel />, { wrapper });
    selectFile();

    await waitFor(() => expect(container.querySelector(".units-preview")).not.toBeNull());
    const preview = container.querySelector(".units-preview")!.textContent ?? "";
    expect(preview).toContain("Relatorio Lojas CEPs - Setembro 2026.xlsx");
    expect(preview).toMatch(/102\s*linhas encontradas/);
    expect(preview).toMatch(/101\s*unidades válidas/);
    expect(preview).toMatch(/1\s*duplicata ignorada/);
    expect(preview).toMatch(/0\s*linhas não puderam ser importadas/);
    expect(preview).toMatch(/0\s*cidades não localizadas/);
  });

  it("cancelar descarta a validação sem gravar nada", async () => {
    invoke.mockResolvedValue({ data: dryRunOk, error: null });
    const { container } = render(<NetworkUnitsPanel />, { wrapper });
    selectFile();

    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar" })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(container.querySelector(".units-preview")).toBeNull());
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1].body.dry_run).toBe(true);
  });

  it("não deixa confirmar quando a validação reprova", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("non-2xx"), {
        context: {
          json: async () => ({
            ok: false, status: "validation_failed", error_code: "NO_VALID_ROWS",
            summary: { total_rows: 3, valid_rows: 0, duplicate_rows: 0, invalid_rows: 3, unresolved_cities: 0 },
            errors: [
              { row: 2, code: "INVALID_STATE", field: "state", message: "Invalid Brazilian state: XX." },
              { row: 3, code: "INVALID_STATE", field: "state", message: "Invalid Brazilian state: ZZ." },
              { row: 4, code: "INVALID_POSTAL_CODE", field: "postal_code", message: "Postal code must contain 8 digits: 1." },
            ],
          }),
        },
      }),
    });
    const { container } = render(<NetworkUnitsPanel />, { wrapper });
    selectFile();

    await waitFor(() => expect(screen.getByRole("alert")).not.toBeNull());
    expect(screen.getByRole("alert").textContent).toMatch(/Nenhuma linha da planilha passou na validação/);
    expect(screen.getByRole("button", { name: /Atualizar base/ })).toHaveProperty("disabled", true);
    expect(container.querySelector(".units-preview")!.textContent).toMatch(/3\s*linhas não puderam ser importadas/);
  });

  it("mostra os motivos agrupados sob demanda, sem despejar JSON", async () => {
    invoke.mockResolvedValue({
      data: {
        ...dryRunOk,
        summary: { total_rows: 103, valid_rows: 101, duplicate_rows: 0, invalid_rows: 2, unresolved_cities: 0 },
        errors: [
          { row: 12, code: "INVALID_STATE", field: "state", message: "Invalid Brazilian state: XX." },
          { row: 40, code: "INVALID_STATE", field: "state", message: "Invalid Brazilian state: ZZ." },
        ],
      },
      error: null,
    });
    render(<NetworkUnitsPanel />, { wrapper });
    selectFile();

    await waitFor(() => expect(screen.getByRole("button", { name: "Ver motivos" })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Ver motivos" }));

    const reasons = screen.getByText(/UF fora das 27/);
    expect(reasons).not.toBeNull();
    expect(reasons.textContent).toMatch(/linha 12, 40/);
    expect(reasons.textContent).not.toContain("{");
  });

  it("avisa que cidades não localizadas não entram no mapa, sem bloquear", async () => {
    invoke.mockResolvedValue({
      data: { ...dryRunOk, summary: { ...dryRunOk.summary, unresolved_cities: 2 } },
      error: null,
    });
    render(<NetworkUnitsPanel />, { wrapper });
    selectFile();

    await waitFor(() => expect(screen.getByText(/não aparecem no mapa/)).not.toBeNull());
    expect(screen.getByRole("button", { name: /Atualizar base/ })).toHaveProperty("disabled", false);
  });
});

describe("confirmação da importação", () => {
  it("grava com dry_run false só depois do clique, e invalida a base", async () => {
    invoke.mockResolvedValueOnce({ data: dryRunOk, error: null });
    invoke.mockResolvedValueOnce({ data: importOk, error: null });
    const invalidate = vi.spyOn(client, "invalidateQueries");

    render(<NetworkUnitsPanel />, { wrapper });
    selectFile();
    await waitFor(() => expect(screen.getByRole("button", { name: /Atualizar base/ })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Atualizar base/ }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Base substituída/));

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[0][1].body.dry_run).toBe(true);
    expect(invoke.mock.calls[1][1].body.dry_run).toBe(false);
    expect(invoke.mock.calls[1][1].body.filename).toBe("Relatorio Lojas CEPs - Setembro 2026.xlsx");
    expect(invoke.mock.calls[1][1].body.rows).toHaveLength(101);
    // O mapa e o resumo se atualizam sem recarregar a página.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["network-units", "maria-gasolina"] });
  });

  it("refaz a leitura da base e mostra os novos números após o sucesso", async () => {
    invoke.mockResolvedValueOnce({ data: dryRunOk, error: null });
    invoke.mockResolvedValueOnce({ data: importOk, error: null });
    rpc.mockResolvedValueOnce({ data: snapshot, error: null });
    rpc.mockResolvedValue({
      data: { ...snapshot, summary: { ...snapshot.summary, total_units: 140, total_cities: 31 } },
      error: null,
    });

    render(<NetworkUnitsPanel />, { wrapper });
    await waitFor(() => expect(screen.getByText("101")).not.toBeNull());
    selectFile();
    await waitFor(() => expect(screen.getByRole("button", { name: /Atualizar base/ })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Atualizar base/ }));

    await waitFor(() => expect(screen.getByText("140")).not.toBeNull());
    expect(screen.getByText("31")).not.toBeNull();
  });

  it("bloqueia o clique repetido enquanto grava", async () => {
    invoke.mockResolvedValueOnce({ data: dryRunOk, error: null });
    let release: (value: unknown) => void = () => {};
    invoke.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));

    render(<NetworkUnitsPanel />, { wrapper });
    selectFile();
    await waitFor(() => expect(screen.getByRole("button", { name: /Atualizar base/ })).not.toBeNull());

    const confirm = screen.getByRole("button", { name: /Atualizar base/ });
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByRole("button", { name: /Atualizando base/ })).toHaveProperty("disabled", true));
    fireEvent.click(screen.getByRole("button", { name: /Atualizando base/ }));

    release({ data: importOk, error: null });
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Base substituída/));
    // Um dry run e uma gravação: o segundo clique não virou uma segunda escrita.
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("mostra erro da gravação e preserva a base anterior na mensagem", async () => {
    invoke.mockResolvedValueOnce({ data: dryRunOk, error: null });
    invoke.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("non-2xx"), {
        context: {
          json: async () => ({
            ok: false, status: "failed", error_code: "SNAPSHOT_REPLACE_FAILED",
            summary: dryRunOk.summary, errors: [],
          }),
        },
      }),
    });

    render(<NetworkUnitsPanel />, { wrapper });
    selectFile();
    await waitFor(() => expect(screen.getByRole("button", { name: /Atualizar base/ })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Atualizar base/ }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/base anterior foi preservada/));
  });

  it("mostra erro de rede sem derrubar o painel", async () => {
    invoke.mockResolvedValueOnce({ data: dryRunOk, error: null });
    invoke.mockResolvedValueOnce({ data: null, error: new Error("Failed to fetch") });

    render(<NetworkUnitsPanel />, { wrapper });
    selectFile();
    await waitFor(() => expect(screen.getByRole("button", { name: /Atualizar base/ })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Atualizar base/ }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Failed to fetch/));
    expect(screen.getByRole("button", { name: /Atualizar base/ })).not.toBeNull();
  });
});
