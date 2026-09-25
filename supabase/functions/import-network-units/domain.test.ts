import { describe, expect, it } from "vitest";
import {
  buildMunicipalityIndex,
  normalizePostalCode,
  normalizeState,
  normalizeText,
  prepareImport,
} from "./domain.ts";
import { GEOGRAPHY_SOURCE, MUNICIPALITIES } from "./municipalities.ts";

const municipalityIndex = buildMunicipalityIndex(MUNICIPALITIES);

const validRow = {
  unit_name: "ACQUA GALLERIA",
  neighborhood: "Fazenda São Quirino",
  city: "Campinas",
  state: "SP",
  postal_code: "13091-702",
};

describe("network-unit import domain", () => {
  it("loads the pinned geographic dataset", () => {
    expect(GEOGRAPHY_SOURCE.commit).toBe("503e2f70bbf1b4b7ec0b1f68b09086ccc38fe861");
    expect(GEOGRAPHY_SOURCE.sourceChecksum).toBe("BEE0AC7CD625D55DAC23BD546DC0F9A4830397259C3DE05571A3414CB835011B");
    expect(GEOGRAPHY_SOURCE.municipalityCount).toBe(5_571);
    expect(MUNICIPALITIES).toHaveLength(5_571);
  });

  it("normalizes text, state and postal code deterministically", () => {
    expect(normalizeText("  Jardim   Conceição ")).toBe("jardim conceicao");
    expect(normalizeText("Paulínia")).toBe(normalizeText("Paulinia"));
    expect(normalizeState(" sp ")).toBe("SP");
    expect(normalizePostalCode("13091-702")).toBe("13091702");
  });

  it("validates a normal import and preserves original values", () => {
    const result = prepareImport([validRow], municipalityIndex);
    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({
      total_rows: 1,
      valid_rows: 1,
      duplicate_rows: 0,
      invalid_rows: 0,
      unresolved_cities: 0,
    });
    expect(result.units[0]).toMatchObject({
      unit_name: "ACQUA GALLERIA",
      neighborhood: "Fazenda São Quirino",
      city: "Campinas",
      state: "SP",
      postal_code: "13091-702",
      normalized_city: "campinas",
      normalized_state: "SP",
      normalized_postal_code: "13091702",
      municipality_name: "Campinas",
      geography_status: "resolved",
    });
  });

  it("groups Paulinia and Paulínia under the same normalized city and municipality", () => {
    const result = prepareImport([
      { ...validRow, unit_name: "Unidade A", city: "Paulinia", postal_code: "13140-000" },
      { ...validRow, unit_name: "Unidade B", city: "Paulínia", postal_code: "13140-001" },
    ], municipalityIndex);
    expect(result.ok).toBe(true);
    expect(result.units[0].normalized_city).toBe("paulinia");
    expect(result.units[1].normalized_city).toBe("paulinia");
    expect(result.units[0].municipality_ibge_code).toBe(result.units[1].municipality_ibge_code);
    expect(result.units[0].municipality_name).toBe("Paulínia");
  });

  it("deduplicates the normalized five-field key", () => {
    const result = prepareImport([
      { ...validRow, city: "Paulinia", postal_code: "13140-000" },
      { ...validRow, city: "Paulínia", postal_code: "13140-000" },
    ], municipalityIndex);
    expect(result.ok).toBe(true);
    expect(result.summary.valid_rows).toBe(1);
    expect(result.summary.duplicate_rows).toBe(1);
    expect(result.units).toHaveLength(1);
  });

  it("keeps valid rows when another row has an invalid state", () => {
    const result = prepareImport([
      validRow,
      { ...validRow, unit_name: "Inválida", state: "XX" },
    ], municipalityIndex);
    expect(result.ok).toBe(true);
    expect(result.summary.valid_rows).toBe(1);
    expect(result.summary.invalid_rows).toBe(1);
    expect(result.errors[0].code).toBe("INVALID_STATE");
  });

  it("rejects a row with an invalid postal code", () => {
    const result = prepareImport([{ ...validRow, postal_code: "13091-70" }], municipalityIndex);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("NO_VALID_ROWS");
    expect(result.errors.some((error) => error.code === "INVALID_POSTAL_CODE")).toBe(true);
  });

  it("rejects an empty payload", () => {
    const result = prepareImport([], municipalityIndex);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("EMPTY_FILE");
  });

  it("reports a missing canonical column", () => {
    const { neighborhood: _ignored, ...withoutNeighborhood } = validRow;
    const result = prepareImport([withoutNeighborhood], municipalityIndex);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("MISSING_REQUIRED_COLUMN");
    expect(result.errors[0].field).toBe("neighborhood");
  });

  it("reports an isolated missing required field as an invalid row", () => {
    const result = prepareImport([
      validRow,
      { ...validRow, unit_name: "" },
    ], municipalityIndex);
    expect(result.ok).toBe(true);
    expect(result.summary.invalid_rows).toBe(1);
    expect(result.errors[0].code).toBe("MISSING_REQUIRED_FIELD");
  });

  it("keeps unresolved cities without invented coordinates", () => {
    const result = prepareImport([
      { ...validRow, city: "Cidade que não existe", postal_code: "13091-703" },
    ], municipalityIndex);
    expect(result.ok).toBe(true);
    expect(result.summary.unresolved_cities).toBe(1);
    expect(result.units[0]).toMatchObject({
      geography_status: "unresolved",
      municipality_ibge_code: null,
      municipality_name: null,
      latitude: null,
      longitude: null,
    });
  });
});
