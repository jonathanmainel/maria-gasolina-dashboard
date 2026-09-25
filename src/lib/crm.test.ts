import { describe, expect, it } from "vitest";
import { buildCrmSummary, slowestCommercialStage } from "./crm";
import type { FrontDaily, ManualFunnelInput } from "../types";

const input: ManualFunnelInput = {
  stages: { lead: 400, contact: 240, recall: 180, fqc: 120, visit_call: 90, cof: 60, pre_contract: 40, waiting: 30, contract: 20, implementation: 12 },
  stage_days: { lead: 3, contact: 6, recall: 4, fqc: 9, visit_call: 12, cof: 5, pre_contract: 3, waiting: 5, implementation: 40 },
  avg_ticket: 80000,
};

const rows: FrontDaily[] = [
  { date: "2026-08-10", front: "franchise", channel: "meta_ads", spend: 1000, impressions: 10000, reach: 8000, clicks: 200, leads: 60 },
  { date: "2026-08-20", front: "franchise", channel: "google_ads", spend: 500, impressions: 4000, reach: 3000, clicks: 100, leads: 40 },
  { date: "2026-09-05", front: "franchise", channel: "meta_ads", spend: 900, impressions: 9000, reach: 7000, clicks: 180, leads: 50 },
];

describe("funil comercial derivado da entrada manual", () => {
  const crm = buildCrmSummary("franchise", input, { rows });

  it("expõe todas as etapas da frente, na ordem, incluindo a pós-venda", () => {
    expect(crm.stages.map((stage) => stage.id)).toEqual([
      "lead", "contact", "recall", "fqc", "visit_call", "cof", "pre_contract", "waiting", "contract", "implementation",
    ]);
  });

  it("contratos vêm da etapa Contrato, não da última etapa do funil", () => {
    expect(crm.close_stage?.id).toBe("contract");
    expect(crm.contracts).toBe(20);
    expect(crm.contracts).not.toBe(crm.stages[crm.stages.length - 1].count);
  });

  it("mexer em Implantação não muda contratos, receita nem conversão", () => {
    const more = buildCrmSummary("franchise", { ...input, stages: { ...input.stages, implementation: 999 } }, { rows });
    const less = buildCrmSummary("franchise", { ...input, stages: { ...input.stages, implementation: 0 } }, { rows });
    [more, less].forEach((variant) => {
      expect(variant.contracts).toBe(crm.contracts);
      expect(variant.revenue).toBe(crm.revenue);
      expect(variant.conversion_rate).toBe(crm.conversion_rate);
      expect(variant.projected_revenue).toBe(crm.projected_revenue);
      expect(variant.monthly.map((month) => month.contracts)).toEqual(crm.monthly.map((month) => month.contracts));
      expect(variant.sources.map((source) => source.contracts)).toEqual(crm.sources.map((source) => source.contracts));
    });
  });

  it("receita e conversão usam a etapa Contrato sobre o topo do funil", () => {
    expect(crm.revenue).toBe(20 * 80000);
    expect(crm.conversion_rate).toBeCloseTo(5, 5); // 20 contratos / 400 leads
  });

  it("o ciclo comercial soma só as etapas anteriores ao Contrato", () => {
    // 3+6+4+9+12+5+3+5 = 47; os 40 dias de Implantação ficam de fora.
    expect(crm.avg_cycle_days).toBe(47);
    const longerImplementation = buildCrmSummary("franchise", { ...input, stage_days: { ...input.stage_days, implementation: 300 } }, { rows });
    expect(longerImplementation.avg_cycle_days).toBe(47);
  });

  it("a etapa mais demorada ignora a pós-venda mesmo quando ela é a mais longa", () => {
    // Implantação tem 40 dias, o dobro da etapa comercial mais lenta.
    expect(slowestCommercialStage(crm.stages)?.id).toBe("visit_call");
  });

  it("o pipeline usa a última etapa comercial antes do Contrato", () => {
    expect(crm.pipeline_stage?.id).toBe("waiting");
    expect(crm.pipeline_value).toBe(30 * 80000);
  });

  it("monta a série mensal com o volume real de leads de mídia", () => {
    expect(crm.monthly.map((month) => month.leads)).toEqual([100, 50]);
    // 20 contratos sobre 400 leads = 5% aplicados ao volume real de cada mês.
    expect(crm.monthly.map((month) => month.contracts)).toEqual([5, 3]);
    // Visitas seguem a etapa de visita da frente (90/400), não uma posição fixa.
    expect(crm.monthly.map((month) => month.visits)).toEqual([23, 11]);
  });

  it("distribui os contratos pelas origens reais de mídia", () => {
    expect(crm.sources.map((source) => source.name)).toEqual(["Meta Ads", "Google Ads"]);
    expect(crm.sources.reduce((sum, source) => sum + source.leads, 0)).toBe(150);
    expect(crm.sources.reduce((sum, source) => sum + source.contracts, 0)).toBe(crm.contracts);
  });

  it("não inventa negociações quando o CRM não expõe a lista", () => {
    expect(crm.recent).toEqual([]);
  });
});

describe("funil de Condomínios", () => {
  const crm = buildCrmSummary("condominium", {
    stages: { lead: 200, contact: 140, recall: 100, fqa: 70, visit_proposal: 50, assembly: 30, contract: 14, implementation: 9 },
    stage_days: { lead: 5, contact: 9, recall: 6, fqa: 8, visit_proposal: 10, assembly: 16, implementation: 25 },
    avg_ticket: 0,
  }, { rows: [] });

  it("tem 8 etapas e fecha em Contrato", () => {
    expect(crm.stages).toHaveLength(8);
    expect(crm.contracts).toBe(14);
    expect(crm.conversion_rate).toBeCloseTo(7, 5);
  });

  it("sem ticket médio não inventa receita nem projeção", () => {
    expect(crm.revenue).toBe(0);
    expect(crm.projected_revenue).toBe(0);
    expect(crm.pipeline_value).toBe(0);
  });

  it("o ciclo comercial exclui os 25 dias de Implantação", () => {
    expect(crm.avg_cycle_days).toBe(54);
  });
});

describe("funil zerado", () => {
  it("devolve null em vez de NaN e não quebra sem nenhuma etapa preenchida", () => {
    const empty = buildCrmSummary("condominium", { stages: {}, stage_days: {}, avg_ticket: 0 }, { rows: [] });
    expect(empty.stages).toHaveLength(8);
    expect(empty.stages.every((stage) => stage.count === 0)).toBe(true);
    expect(empty.conversion_rate).toBeNull();
    expect(empty.revenue).toBe(0);
    expect(empty.projected_revenue).toBe(0);
    expect(empty.avg_cycle_days).toBe(0);
    expect(empty.monthly).toEqual([]);
    expect(empty.sources).toEqual([]);
    expect(slowestCommercialStage(empty.stages)).toBeNull();
  });
});
