export const REQUIRED_COLUMNS = [
  "unit_name",
  "neighborhood",
  "city",
  "state",
  "postal_code",
] as const;

export type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];

export interface Municipality {
  ibgeCode: number;
  name: string;
  state: string;
  latitude: number;
  longitude: number;
}

export interface PreparedUnit {
  source_row_number: number;
  unit_name: string;
  neighborhood: string;
  city: string;
  state: string;
  postal_code: string;
  normalized_unit_name: string;
  normalized_neighborhood: string;
  normalized_city: string;
  normalized_state: string;
  normalized_postal_code: string;
  municipality_ibge_code: number | null;
  municipality_name: string | null;
  latitude: number | null;
  longitude: number | null;
  geography_status: "resolved" | "unresolved";
}

export interface ImportIssue {
  row: number | null;
  code:
    | "EMPTY_FILE"
    | "INVALID_PAYLOAD"
    | "MISSING_REQUIRED_COLUMN"
    | "INVALID_ROW"
    | "MISSING_REQUIRED_FIELD"
    | "INVALID_STATE"
    | "INVALID_POSTAL_CODE"
    | "VALUE_TOO_LONG"
    | "NO_VALID_ROWS";
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

export interface PreparedImport {
  ok: boolean;
  error_code: ImportIssue["code"] | null;
  summary: ImportSummary;
  errors: ImportIssue[];
  units: PreparedUnit[];
}

const BRAZILIAN_STATES = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO",
  "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
  "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

const MAX_LENGTH: Record<RequiredColumn, number> = {
  unit_name: 200,
  neighborhood: 200,
  city: 120,
  state: 20,
  postal_code: 32,
};

const EMPTY_SUMMARY: ImportSummary = {
  total_rows: 0,
  valid_rows: 0,
  duplicate_rows: 0,
  invalid_rows: 0,
  unresolved_cities: 0,
};

export function normalizeText(value: string): string {
  return value
    .trim()
    .replace(/\s+/gu, " ")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

export function normalizeState(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizePostalCode(value: string): string {
  return value.replace(/\D/gu, "");
}

export function geographyKey(city: string, state: string): string {
  return `${normalizeState(state)}\u001f${normalizeText(city)}`;
}

export function buildMunicipalityIndex(
  municipalities: readonly Municipality[],
): ReadonlyMap<string, Municipality> {
  const index = new Map<string, Municipality>();
  for (const municipality of municipalities) {
    const key = geographyKey(municipality.name, municipality.state);
    if (index.has(key)) {
      throw new Error(`Duplicate municipality key: ${key}`);
    }
    index.set(key, municipality);
  }
  return index;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fatal(
  issue: ImportIssue,
  totalRows: number,
): PreparedImport {
  return {
    ok: false,
    error_code: issue.code,
    summary: {
      ...EMPTY_SUMMARY,
      total_rows: totalRows,
      invalid_rows: totalRows,
    },
    errors: [issue],
    units: [],
  };
}

export function prepareImport(
  rows: unknown,
  municipalityIndex: ReadonlyMap<string, Municipality>,
): PreparedImport {
  if (!Array.isArray(rows)) {
    return fatal({
      row: null,
      code: "INVALID_PAYLOAD",
      message: "rows must be a JSON array.",
    }, 0);
  }

  if (rows.length === 0) {
    return fatal({
      row: null,
      code: "EMPTY_FILE",
      message: "The import contains no rows.",
    }, 0);
  }

  const objects = rows.filter(isObject);
  const missingColumns = REQUIRED_COLUMNS.filter((field) =>
    !objects.some((row) => Object.hasOwn(row, field))
  );
  if (missingColumns.length > 0) {
    const field = missingColumns[0];
    return fatal({
      row: null,
      code: "MISSING_REQUIRED_COLUMN",
      field,
      message: `Missing required canonical column: ${field}.`,
    }, rows.length);
  }

  const units: PreparedUnit[] = [];
  const errors: ImportIssue[] = [];
  const duplicateKeys = new Set<string>();
  const unresolvedCityKeys = new Set<string>();
  let duplicateRows = 0;

  rows.forEach((unknownRow, index) => {
    const sourceRowNumber = index + 2;
    if (!isObject(unknownRow)) {
      errors.push({
        row: sourceRowNumber,
        code: "INVALID_ROW",
        message: "Row must be a JSON object.",
      });
      return;
    }

    const row: Partial<Record<RequiredColumn, string>> = {};
    for (const field of REQUIRED_COLUMNS) {
      const value = unknownRow[field];
      if (typeof value !== "string" || normalizeText(value) === "") {
        errors.push({
          row: sourceRowNumber,
          code: "MISSING_REQUIRED_FIELD",
          field,
          message: `Required field is missing or empty: ${field}.`,
        });
        return;
      }
      if (value.length > MAX_LENGTH[field]) {
        errors.push({
          row: sourceRowNumber,
          code: "VALUE_TOO_LONG",
          field,
          message: `${field} exceeds ${MAX_LENGTH[field]} characters.`,
        });
        return;
      }
      row[field] = value;
    }

    const unitName = row.unit_name!;
    const neighborhood = row.neighborhood!;
    const city = row.city!;
    const state = row.state!;
    const postalCode = row.postal_code!;
    const normalizedUnitName = normalizeText(unitName);
    const normalizedNeighborhood = normalizeText(neighborhood);
    const normalizedCity = normalizeText(city);
    const normalizedState = normalizeState(state);
    const normalizedPostalCode = normalizePostalCode(postalCode);

    if (!BRAZILIAN_STATES.has(normalizedState)) {
      errors.push({
        row: sourceRowNumber,
        code: "INVALID_STATE",
        field: "state",
        message: `Invalid Brazilian state: ${state}.`,
      });
      return;
    }

    if (!/^[0-9]{8}$/.test(normalizedPostalCode)) {
      errors.push({
        row: sourceRowNumber,
        code: "INVALID_POSTAL_CODE",
        field: "postal_code",
        message: `Postal code must contain 8 digits: ${postalCode}.`,
      });
      return;
    }

    const duplicateKey = [
      normalizedUnitName,
      normalizedNeighborhood,
      normalizedCity,
      normalizedState,
      normalizedPostalCode,
    ].join("\u001f");
    if (duplicateKeys.has(duplicateKey)) {
      duplicateRows += 1;
      return;
    }
    duplicateKeys.add(duplicateKey);

    const cityKey = geographyKey(normalizedCity, normalizedState);
    const municipality = municipalityIndex.get(cityKey) ?? null;
    if (!municipality) unresolvedCityKeys.add(cityKey);

    units.push({
      source_row_number: sourceRowNumber,
      unit_name: unitName,
      neighborhood,
      city,
      state,
      postal_code: postalCode,
      normalized_unit_name: normalizedUnitName,
      normalized_neighborhood: normalizedNeighborhood,
      normalized_city: normalizedCity,
      normalized_state: normalizedState,
      normalized_postal_code: normalizedPostalCode,
      municipality_ibge_code: municipality?.ibgeCode ?? null,
      municipality_name: municipality?.name ?? null,
      latitude: municipality?.latitude ?? null,
      longitude: municipality?.longitude ?? null,
      geography_status: municipality ? "resolved" : "unresolved",
    });
  });

  const summary: ImportSummary = {
    total_rows: rows.length,
    valid_rows: units.length,
    duplicate_rows: duplicateRows,
    invalid_rows: errors.length,
    unresolved_cities: unresolvedCityKeys.size,
  };

  if (units.length === 0) {
    return {
      ok: false,
      error_code: "NO_VALID_ROWS",
      summary,
      errors: [
        ...errors,
        {
          row: null,
          code: "NO_VALID_ROWS",
          message: "The import contains no valid rows.",
        },
      ],
      units,
    };
  }

  return {
    ok: true,
    error_code: null,
    summary,
    errors,
    units,
  };
}
