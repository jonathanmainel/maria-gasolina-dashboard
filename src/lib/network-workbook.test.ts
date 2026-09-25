import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseUnitsWorkbook, WorkbookError } from "./network-import";

// Parsing de verdade, com o SheetJS lendo um arquivo binário real.
//
// `rowsFromGrid` é testada em `network-import.test.ts` sobre a grade de células;
// aqui o que se prova é que o caminho completo — File → arrayBuffer → SheetJS →
// linhas canônicas — funciona, e que a extensão é barrada antes da leitura.

const HEADERS = ["Unidade / Condomínio", "Bairro", "Cidade", "UF", "CEP"];

/** Monta um .xlsx em memória e o embala num File, como o input entrega. */
function workbookFile(name: string, rows: Array<Array<string | number>>): File {
  const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Lojas");
  const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([buffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("parseUnitsWorkbook", () => {
  it("lê um xlsx real e devolve as linhas do contrato", async () => {
    const file = workbookFile("Relatorio Lojas CEPs - Setembro 2026.xlsx", [
      ["ACQUA GALLERIA", "Fazenda São Quirino", "Campinas", "SP", "13091-702"],
      ["EDIFÍCIO AURORA", "Cambuí", "Campinas", "SP", "13025-140"],
      ["RESIDENCIAL VILA", "Centro", "Jundiaí", "SP", "13201-005"],
    ]);

    const parsed = await parseUnitsWorkbook(file);

    expect(parsed.filename).toBe("Relatorio Lojas CEPs - Setembro 2026.xlsx");
    expect(parsed.sheetName).toBe("Lojas");
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toEqual({
      unit_name: "ACQUA GALLERIA",
      neighborhood: "Fazenda São Quirino",
      city: "Campinas",
      state: "SP",
      postal_code: "13091-702",
    });
    // Acentos sobrevivem à ida e volta pelo arquivo.
    expect(parsed.rows[1].unit_name).toBe("EDIFÍCIO AURORA");
  });

  it("recusa a extensão errada antes de tentar ler o arquivo", async () => {
    const file = new File(["unidade,bairro"], "base.csv", { type: "text/csv" });
    await expect(parseUnitsWorkbook(file)).rejects.toThrowError(WorkbookError);
    await expect(parseUnitsWorkbook(file)).rejects.toThrow(/Formato não aceito/);
  });

  // Lixo com extensão de planilha: o SheetJS pode até abrir alguma coisa, mas o
  // resultado nunca passa pelo reconhecimento de cabeçalho. O importante é que
  // a recusa chegue como WorkbookError, com mensagem legível.
  it("recusa arquivo com extensão certa mas conteúdo ilegível", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4, 5])], "base.xlsx");
    await expect(parseUnitsWorkbook(file)).rejects.toThrowError(WorkbookError);
    await expect(parseUnitsWorkbook(file)).rejects.toThrow(/planilha/i);
  });

  it("recusa planilha que não é a base de unidades", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([["Campanha", "Investimento"], ["MG | FRANQ", 1200]]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Mídia");
    const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const file = new File([buffer], "midia.xlsx");

    await expect(parseUnitsWorkbook(file)).rejects.toThrow(/cabeçalho/i);
  });
});
