import type { CommercialFront, DateRange, FrontDaily, ManualFunnelInput, ManualPeriodResults } from "../types";
import { defaultFunnel, defaultResults } from "./manual-funnel";
import { buildCrmSummary } from "./crm";
import { emptyCommercialEntries } from "./commercial-records";

// Exemplos inventados para a prévia. Nunca são entrada de persistência operacional.
export const commercialExamples: Partial<Record<CommercialFront, { snapshot: ManualFunnelInput; result: ManualPeriodResults }>> = {
  condominium: { snapshot: defaultFunnel.condominium, result: defaultResults.condominium },
  franchise: { snapshot: defaultFunnel.franchise, result: defaultResults.franchise },
};
export function exampleEntries() {
  const entries = emptyCommercialEntries();
  for (const [front, example] of Object.entries(commercialExamples)) entries[front as CommercialFront] = { snapshot: structuredClone(example.snapshot), result: { ...example.result }, snapshotUpdatedAt: null, resultUpdatedAt: null };
  return entries;
}
export function exampleCrmSummary(front: CommercialFront, range: DateRange, rows: FrontDaily[] = []) {
  const example = commercialExamples[front];
  return { ...buildCrmSummary(front, example?.snapshot ?? null, example?.result ?? null, { rows }), snapshot_origin: example ? "example" as const : "unavailable" as const, results_origin: example ? "example" as const : "unavailable" as const, results_period: example ? range : null };
}
