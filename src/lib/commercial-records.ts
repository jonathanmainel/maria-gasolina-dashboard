import type { CommercialFront, DateRange, ManualFunnelInput, ManualPeriodResults } from "../types";
import { commercialFronts, isCommercialFront } from "./fronts";
import { crmStages } from "./crm-stages";

export type CommercialKind = "snapshot" | "result";
export interface CommercialRow { scope: string; payload: unknown; updated_at: string; updated_by?: string | null }
export interface CommercialEntry {
  snapshot: ManualFunnelInput | null;
  result: ManualPeriodResults | null;
  snapshotUpdatedAt: string | null;
  resultUpdatedAt: string | null;
}
export type CommercialEntries = Record<CommercialFront, CommercialEntry>;
export interface CommercialCommand { front: CommercialFront; kind: CommercialKind; range: DateRange; values: ManualFunnelInput | ManualPeriodResults }
export function emptyCommercialEntries(): CommercialEntries {
  return Object.fromEntries(Object.keys(commercialFronts).map(front => [front, { snapshot: null, result: null, snapshotUpdatedAt: null, resultUpdatedAt: null }])) as CommercialEntries;
}
export function validCommercialRange(range: DateRange): boolean {
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
  try { return valid(range.start) && valid(range.end) && range.start <= range.end; } catch { return false; }
}
export function commercialScope(front: CommercialFront, kind: CommercialKind, range: DateRange): string {
  if (!isCommercialFront(front) || !["snapshot", "result"].includes(kind) || !validCommercialRange(range)) throw new Error("Frente ou período comercial inválido.");
  return kind === "snapshot" ? `crm_snap_${front}` : `crm_res_${front}_${range.start.replaceAll("-", "")}_${range.end.replaceAll("-", "")}`;
}
const obj = (value: unknown): Record<string, unknown> | null => value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
export function validCommercialValues(front: CommercialFront, kind: CommercialKind, value: unknown): boolean {
  const data = obj(value); if (!data) return false;
  const onlyKeys = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).every(key => keys.includes(key));
  if (kind === "result") return onlyKeys(data, ["contracts_closed", "revenue"]) && number(data.contracts_closed) && Number.isSafeInteger(data.contracts_closed) && number(data.revenue);
  if (kind !== "snapshot" || !onlyKeys(data, ["stages", "stage_days", "avg_ticket"])) return false;
  const stages = obj(data.stages), days = obj(data.stage_days);
  const model = crmStages(front);
  return (data.avg_ticket === undefined || number(data.avg_ticket)) && !!stages && !!days && onlyKeys(stages, model.map(stage => stage.id)) && onlyKeys(days, model.filter(stage => stage.tracksDays).map(stage => stage.id)) && Object.values(days).every(number) && model.every(stage => number(stages[stage.id]) && Number.isSafeInteger(stages[stage.id]));
}
export function commercialPayload(command: CommercialCommand) {
  if (!validCommercialValues(command.front, command.kind, command.values)) throw new Error("Preencha todos os campos comerciais com valores válidos.");
  commercialScope(command.front, command.kind, command.range);
  return { version: 1, origin: "manual", front: command.front, kind: command.kind, period: command.kind === "result" ? command.range : null, values: command.values };
}
export function decodeCommercialRows(rows: CommercialRow[], range: DateRange): CommercialEntries {
  const entries = emptyCommercialEntries();
  for (const row of rows) {
    const data = obj(row.payload);
    if (!data || Object.keys(data).some(key => !["version", "origin", "front", "kind", "period", "values"].includes(key)) || data.version !== 1 || data.origin !== "manual" || typeof data.front !== "string" || !isCommercialFront(data.front) || (data.kind !== "snapshot" && data.kind !== "result")) continue;
    const { front, kind } = data;
    if (row.scope !== commercialScope(front, kind, range) || !validCommercialValues(front, kind, data.values)) continue;
    const period = obj(data.period);
    if (kind === "snapshot" && data.period !== null) continue;
    if (kind === "result" && (!period || Object.keys(period).some(key => !["start", "end"].includes(key)) || period.start !== range.start || period.end !== range.end)) continue;
    if (!Number.isFinite(Date.parse(row.updated_at))) continue;
    const entry = entries[front];
    if (kind === "snapshot") { entry.snapshot = data.values as ManualFunnelInput; entry.snapshotUpdatedAt = row.updated_at; }
    else { entry.result = data.values as ManualPeriodResults; entry.resultUpdatedAt = row.updated_at; }
  }
  return entries;
}
