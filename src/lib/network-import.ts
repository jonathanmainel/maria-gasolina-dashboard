import { CLIENT_SLUG } from "./api";
import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// Importação da base de unidades
//
// A Edge Function `import-network-units` recebe linhas já estruturadas nas
// cinco colunas canônicas — não o arquivo bruto. O parsing do XLSX acontece
// aqui, no navegador, e o que sobe é JSON.
//
// Autenticação: `supabase.functions.invoke` usa o access token da sessão atual.
// Nenhum token é lido, guardado ou pedido ao usuário, e a função recusa com
// `UNAUTHENTICATED` sem sessão válida.
//
// Segurança: nenhuma escrita direta em tabela. A função valida, deduplica,
// resolve geografia e troca o snapshot dentro do contrato que já existe.
// ---------------------------------------------------------------------------

export const IMPORT_FUNCTION = "import-network-units";

/** Extensões aceitas pelo seletor de arquivo. Qualquer outra é recusada antes do parsing. */
export const ACCEPTED_EXTENSIONS = [".xlsx", ".xls"] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(",");

export const REQUIRED_COLUMNS = ["unit_name", "neighborhood", "city", "state", "postal_code"] as const;
export type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];

export type ImportRow = Record<RequiredColumn, string>;

export interface ImportIssue {
  row: number | null;
  code: string;
  field?: RequiredColumn;
  message: string;
}

export interface ImportSummary {
  total_rows: number;
  valid_rows: number;
  duplicate_rows: number;
  invalid_rows: number;
  unresolved_cities: number;
}

/** Resposta da Edge Function, tanto em dry run quanto na gravação. */
export interface ImportResponse {
  ok: boolean;
  status?: string;
  error_code: string | null;
  client_slug?: string;
  filename?: string;
  dry_run?: boolean;
  summary: ImportSummary;
  errors: ImportIssue[];
  database_write_performed?: boolean;
  snapshot_replaced?: boolean;
  import_id?: number;
}

export interface ParsedWorkbook {
  filename: string;
  sheetName: string;
  rows: ImportRow[];
  /** Cabeçalhos da planilha que nenhuma coluna canônica reconheceu. */
  ignoredHeaders: string[];
}

export class WorkbookError extends Error {
  readonly code: "UNSUPPORTED_EXTENSION" | "UNREADABLE_FILE" | "EMPTY_SHEET" | "MISSING_COLUMNS";
  readonly missing: RequiredColumn[];

  constructor(code: WorkbookError["code"], message: string, missing: RequiredColumn[] = []) {
    super(message);
    this.name = "WorkbookError";
    this.code = code;
    this.missing = missing;
  }
}

export const COLUMN_LABELS: Record<RequiredColumn, string> = {
  unit_name: "Unidade / Condomínio",
  neighborhood: "Bairro",
  city: "Cidade",
  state: "UF",
  postal_code: "CEP",
};

/**
 * Cabeçalho normalizado para comparação: sem acento, minúsculo e com qualquer
 * pontuação (a barra de "Unidade / Condomínio", pontos, hífens) virando espaço.
 * Assim a planilha real casa mesmo com caixa, acento ou espaçamento diferentes,
 * sem afrouxar o contrato — o backend continua recebendo as chaves canônicas.
 */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/** Sinônimos aceitos por coluna, já normalizados. O primeiro é o cabeçalho real da planilha. */
const HEADER_ALIASES: Record<RequiredColumn, string[]> = {
  unit_name: ["unidade condominio", "unidade", "condominio", "nome da unidade", "loja", "unidade loja"],
  neighborhood: ["bairro", "bairro distrito"],
  city: ["cidade", "municipio", "cidade municipio"],
  state: ["uf", "estado", "sigla uf"],
  postal_code: ["cep", "codigo postal", "cep loja"],
};

/** Coluna canônica de um cabeçalho da planilha, ou null quando não reconhecido. */
export function matchColumn(header: string): RequiredColumn | null {
  const normalized = normalizeHeader(header);
  if (normalized === "") return null;
  for (const column of REQUIRED_COLUMNS) {
    if (HEADER_ALIASES[column].includes(normalized)) return column;
  }
  return null;
}

export function hasAcceptedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

type Cell = string | number | boolean | Date | null | undefined;

function cellToText(value: Cell): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/**
 * CEP que o Excel guardou como número perde o zero à esquerda: "01310-100"
 * volta como 1310100. Só nesse caso — célula numérica com exatamente 7 dígitos
 * — o zero é recolocado. Nenhum outro valor ausente é preenchido.
 */
function postalCodeToText(value: Cell): string {
  const text = cellToText(value);
  if (typeof value === "number" && /^[0-9]{7}$/.test(text)) return `0${text}`;
  return text;
}

/**
 * Localiza a linha de cabeçalho: a primeira das dez primeiras que reconhece ao
 * menos duas colunas canônicas. Tolera planilha com título ou linha em branco
 * antes da tabela, sem chutar em um relatório que não é esta base.
 */
export function findHeaderRow(grid: Cell[][]): number {
  const limit = Math.min(grid.length, 10);
  for (let index = 0; index < limit; index += 1) {
    const matched = new Set(
      (grid[index] ?? [])
        .map((cell) => matchColumn(cellToText(cell)))
        .filter((column): column is RequiredColumn => column !== null),
    );
    if (matched.size >= 2) return index;
  }
  return -1;
}

/**
 * Transforma a grade de células nas linhas canônicas do contrato.
 *
 * Valores são repassados como vieram (só com espaços aparados): validação,
 * deduplicação e resolução geográfica são responsabilidade do backend, que é
 * quem tem o dataset de municípios. Linhas inteiramente vazias são descartadas
 * para não virarem "linha inválida" por um resto de formatação da planilha.
 * Exportada separada do parsing do arquivo para poder ser testada sem XLSX.
 */
export function rowsFromGrid(grid: Cell[][]): { rows: ImportRow[]; ignoredHeaders: string[] } {
  const headerIndex = findHeaderRow(grid);
  if (headerIndex === -1) {
    throw new WorkbookError("MISSING_COLUMNS", "Não encontramos a linha de cabeçalho da planilha.", [...REQUIRED_COLUMNS]);
  }

  const headerRow = grid[headerIndex] ?? [];
  const columnAt = new Map<number, RequiredColumn>();
  const taken = new Set<RequiredColumn>();
  const ignoredHeaders: string[] = [];
  headerRow.forEach((cell, index) => {
    const text = cellToText(cell);
    if (text === "") return;
    const column = matchColumn(text);
    if (column === null) {
      ignoredHeaders.push(text);
      return;
    }
    // Cabeçalho repetido não sobrescreve o primeiro que já casou com a coluna.
    if (taken.has(column)) return;
    taken.add(column);
    columnAt.set(index, column);
  });

  const missing = REQUIRED_COLUMNS.filter((column) => !taken.has(column));
  if (missing.length > 0) {
    throw new WorkbookError(
      "MISSING_COLUMNS",
      `A planilha não tem ${missing.map((column) => COLUMN_LABELS[column]).join(", ")}.`,
      missing,
    );
  }

  const rows: ImportRow[] = [];
  for (let index = headerIndex + 1; index < grid.length; index += 1) {
    const cells = grid[index] ?? [];
    const row: ImportRow = { unit_name: "", neighborhood: "", city: "", state: "", postal_code: "" };
    columnAt.forEach((column, position) => {
      row[column] = column === "postal_code" ? postalCodeToText(cells[position]) : cellToText(cells[position]);
    });
    if (REQUIRED_COLUMNS.every((column) => row[column] === "")) continue;
    rows.push(row);
  }

  if (rows.length === 0) {
    throw new WorkbookError("EMPTY_SHEET", "A planilha não tem nenhuma linha de dados.");
  }
  return { rows, ignoredHeaders };
}

/**
 * Lê a planilha no navegador e devolve as linhas canônicas.
 *
 * O SheetJS entra por import dinâmico: é a única dependência pesada do projeto
 * e só faz sentido baixá-la quando alguém realmente escolhe um arquivo em
 * Metas e ajustes, não no bundle inicial do dashboard.
 */
export async function parseUnitsWorkbook(file: File): Promise<ParsedWorkbook> {
  if (!hasAcceptedExtension(file.name)) {
    throw new WorkbookError(
      "UNSUPPORTED_EXTENSION",
      `Formato não aceito. Envie um arquivo ${ACCEPTED_EXTENSIONS.join(" ou ")}.`,
    );
  }

  const { read, utils } = await import("xlsx");
  let grid: Cell[][];
  let sheetName: string;
  try {
    const workbook = read(await file.arrayBuffer(), { type: "array", cellDates: true });
    sheetName = workbook.SheetNames[0] ?? "";
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) throw new Error("planilha sem abas");
    grid = utils.sheet_to_json<Cell[]>(sheet, { header: 1, blankrows: false, raw: true, defval: null });
  } catch {
    throw new WorkbookError("UNREADABLE_FILE", "Não foi possível ler a planilha. Confirme que o arquivo não está corrompido.");
  }

  const { rows, ignoredHeaders } = rowsFromGrid(grid);
  return { filename: file.name, sheetName, rows, ignoredHeaders };
}

function isImportResponse(value: unknown): value is ImportResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ImportResponse>;
  return typeof candidate.ok === "boolean" && typeof candidate.summary === "object" && candidate.summary !== null;
}

/**
 * Recusa antes da validação — sessão ausente, cliente sem permissão, payload
 * grande demais. A Edge Function devolve só `{ ok, error_code }`, sem `summary`,
 * então esse corpo não é um `ImportResponse`: vira exceção com o código
 * preservado, para a tela mostrar o motivo em vez do "non-2xx status code" cru
 * que o supabase-js produz.
 */
export class ImportError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(importErrorLabel(code));
    this.name = "ImportError";
    this.code = code;
  }
}

function errorCodeOf(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const code = (value as { error_code?: unknown }).error_code;
  return typeof code === "string" && code !== "" ? code : null;
}

export interface ImportRequest {
  filename: string;
  rows: ImportRow[];
  dryRun: boolean;
}

/**
 * Chama a Edge Function. `dryRun: true` valida sem gravar nada; `false` grava a
 * auditoria e substitui o snapshot.
 *
 * Uma validação reprovada volta com HTTP 422 e corpo estruturado — isso não é
 * falha de rede, é resultado, então o corpo é devolvido em vez de lançar. Só o
 * que não tem corpo interpretável vira exceção.
 */
export async function importNetworkUnits({ filename, rows, dryRun }: ImportRequest): Promise<ImportResponse> {
  if (!supabase) throw new Error("A conexão com o Supabase ainda não foi configurada.");
  const { data, error } = await supabase.functions.invoke(IMPORT_FUNCTION, {
    body: { client_slug: CLIENT_SLUG, filename, dry_run: dryRun, rows },
  });

  if (error) {
    const context = (error as { context?: unknown }).context as { json?: () => Promise<unknown> } | undefined;
    if (context && typeof context.json === "function") {
      let body: unknown;
      try {
        body = await context.json();
      } catch { /* corpo não-JSON: cai na exceção original */ }
      if (isImportResponse(body)) return body;
      const code = errorCodeOf(body);
      if (code) throw new ImportError(code);
    }
    throw error;
  }
  if (!isImportResponse(data)) throw new Error("Resposta inesperada da importação.");
  return data;
}

/** Mensagem legível para os códigos de erro do contrato. Nenhum JSON bruto na tela. */
export function importErrorLabel(code: string | null | undefined): string {
  switch (code) {
    case "EMPTY_FILE": return "A planilha chegou sem nenhuma linha.";
    case "NO_VALID_ROWS": return "Nenhuma linha da planilha passou na validação.";
    case "MISSING_REQUIRED_COLUMN": return "A planilha está sem uma das colunas obrigatórias.";
    case "MISSING_REQUIRED_FIELD": return "Há linhas com campo obrigatório em branco.";
    case "INVALID_STATE": return "Há linhas com UF fora das 27 unidades federativas.";
    case "INVALID_POSTAL_CODE": return "Há linhas com CEP que não tem 8 dígitos.";
    case "VALUE_TOO_LONG": return "Há linhas com texto acima do tamanho aceito.";
    case "INVALID_ROW": return "Há linhas em formato inesperado.";
    case "TOO_MANY_ROWS": return "A planilha passa do limite de 5.000 linhas.";
    case "PAYLOAD_TOO_LARGE": return "A planilha passa do tamanho aceito pela importação.";
    case "UNAUTHENTICATED": return "Sua sessão expirou. Entre novamente para importar.";
    case "CLIENT_FORBIDDEN": return "Sua conta não tem permissão para alterar esta base.";
    case "SNAPSHOT_REPLACE_FAILED": return "A validação passou, mas a gravação falhou. A base anterior foi preservada.";
    case "IMPORT_AUDIT_WRITE_FAILED": return "Não foi possível registrar a importação. Nada foi alterado.";
    default: return "A importação não pôde ser concluída.";
  }
}
