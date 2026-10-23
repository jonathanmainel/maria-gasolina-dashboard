/** Confere a representação retornada pelo banco depois do INSERT/UPDATE. */
interface ManualWrite { client_id: number; scope: string; payload: unknown }

// JSONB pode reordenar chaves. A ordem dos arrays e todos os valores importam.
function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalJson(child)]),
  );
  return value;
}

export function assertManualWriteConfirmed(rows: unknown, expected: ManualWrite): void {
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Não foi possível confirmar a gravação: esperado o retorno de um único registro.");
  const row = rows[0] as Partial<ManualWrite> | null;
  if (!row || row.client_id !== expected.client_id || row.scope !== expected.scope
    || JSON.stringify(canonicalJson(row.payload)) !== JSON.stringify(canonicalJson(expected.payload))) {
    throw new Error("Não foi possível confirmar a gravação: o registro retornado difere dos dados enviados.");
  }
}
