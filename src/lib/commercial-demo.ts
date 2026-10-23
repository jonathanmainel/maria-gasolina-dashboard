import { buildCrmSummary } from "./crm";
import { defaultFunnel, defaultResults } from "./manual-funnel";
import type { Front } from "../types";

export const COMMERCIAL_DEMO_LABEL = "Dados comerciais ilustrativos";
/** A view-only projection. Never passed to manual-input mutations or media KPIs. */
export function commercialDemoSummary(front: Front) {
  return buildCrmSummary(front, structuredClone(defaultFunnel[front]), { ...defaultResults[front] }, { rows: [] });
}
