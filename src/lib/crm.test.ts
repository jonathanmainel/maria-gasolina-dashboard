import { describe, expect, it } from "vitest";
import { buildCrmSummary, slowestCommercialStage } from "./crm";
import { defaultFunnel, defaultResults } from "./manual-funnel";
import type { FrontDaily, ManualFunnelInput, ManualPeriodResults } from "../types";

// ---------------------------------------------------------------------------
// Os volumes das etapas são uma FOTO DO KANBAN, não um funil acumulado.
//
// O cenário abaixo é o estoque real informado pelo cliente. Ele é deliberadamente
// impossível de ler como progressão e serve de trava contra a volta do modelo
// cumulativo: "Contato" tem 1962 cards com "Lead" em 9, "COF" tem 194 com
// "Visita / Call" em 0, e "Implantação" tem 149 com "Contrato" em 0.
// ---------------------------------------------------------------------------

const SNAPSHOT: ManualFunnelInput = {
  stages: { lead: 9, contact: 1962, recall: 474, fqc: 72, visit_call: 0, cof: 194, pre_contract: 0, waiting: 0, contract: 0, implementation: 149 },
  stage_days: { lead: 2, contact: 5, recall: 4, fqc: 9, visit_call: 12, cof: 7, pre_contract: 3, waiting: 6, implementation: 45 },
  avg_ticket: 84500,
};

const CONDO_SNAPSHOT: ManualFunnelInput = {
  stages: { lead: 3, contact: 798, recall: 9, fqa: 11, visit_proposal: 547, assembly: 13, contract: 0, implementation: 22 },
  stage_days: { lead: 4, contact: 6, recall: 5, fqa: 8, visit_proposal: 11, assembly: 20, implementation: 30 },
  avg_ticket: 0,
};

const RESULTS: ManualPeriodResults = { contracts_closed: 4, revenue: 338000 };
const NO_RESULTS: ManualPeriodResults = { contracts_closed: 0, revenue: 0 };

const rows: FrontDaily[] = [
  { date: "2026-08-10", front: "franchise", channel: "meta_ads", spend: 1000, impressions: 10000, reach: 8000, clicks: 200, leads: 60 },
  { date: "2026-08-20", front: "franchise", channel: "google_ads", spend: 500, impressions: 4000, reach: 3000, clicks: 100, leads: 40 },
  { date: "2026-09-05", front: "franchise", channel: "meta_ads", spend: 900, impressions: 9000, reach: 7000, clicks: 180, leads: 50 },
];

const build = (input = SNAPSHOT, results = RESULTS) => buildCrmSummary("franchise", input, results, { rows });

describe("snapshot do kanban", () => {
  const crm = build();

  it("aceita uma etapa posterior com mais cards que a anterior", () => {
    const byId = Object.fromEntries(crm.stages.map((stage) => [stage.id, stage.count]));
    expect(byId.contact).toBe(1962);
    expect(byId.contact).toBeGreaterThan(byId.lead);
    expect(byId.lead).toBe(9);
  });

  it("aceita COF com volume e Visita / Call zerada", () => {
    const byId = Object.fromEntries(crm.stages.map((stage) => [stage.id, stage.count]));
    expect(byId.visit_call).toBe(0);
    expect(byId.cof).toBe(194);
  });

  it("aceita Implantação maior que Contrato", () => {
    const byId = Object.fromEntries(crm.stages.map((stage) => [stage.id, stage.count]));
    expect(byId.contract).toBe(0);
    expect(byId.implementation).toBe(149);
  });

  it("conta oportunidades abertas somando as etapas comerciais, sem fechamento nem pós-venda", () => {
    // 9 + 1962 + 474 + 72 + 0 + 194 + 0 + 0 = 2711. Contrato e Implantação fora.
    expect(crm.open_opportunities).toBe(2711);
  });

  it("expõe a etapa anterior ao fechamento como contagem, não como receita esperada", () => {
    expect(crm.pipeline_stage?.id).toBe("waiting");
    expect(crm).not.toHaveProperty("pipeline_value");
    expect(crm).not.toHaveProperty("projected_revenue");
  });
});

describe("resultado do período é independente do snapshot", () => {
  it("contratos vêm do bloco de resultado, não da coluna Contrato", () => {
    const crm = build();
    expect(crm.close_stage?.count).toBe(0); // coluna vazia
    expect(crm.contracts).toBe(4); // e ainda assim 4 fechamentos no período
  });

  it("mexer em qualquer etapa do snapshot não altera contratos nem receita", () => {
    const base = build();
    const variants: ManualFunnelInput[] = [
      { ...SNAPSHOT, stages: { ...SNAPSHOT.stages, lead: 99999 } },
      { ...SNAPSHOT, stages: { ...SNAPSHOT.stages, contract: 777 } },
      { ...SNAPSHOT, stages: { ...SNAPSHOT.stages, implementation: 0 } },
      { ...SNAPSHOT, stages: { ...SNAPSHOT.stages, implementation: 99999 } },
      { ...SNAPSHOT, stages: Object.fromEntries(Object.keys(SNAPSHOT.stages).map((id) => [id, 0])) },
    ];
    variants.forEach((input) => {
      const crm = build(input);
      expect(crm.contracts).toBe(base.contracts);
      expect(crm.revenue).toBe(base.revenue);
      expect(crm.avg_ticket).toBe(base.avg_ticket);
    });
  });

  it("sem resultado informado, contratos e receita ficam em zero mesmo com o kanban cheio", () => {
    const crm = build(SNAPSHOT, NO_RESULTS);
    expect(crm.open_opportunities).toBe(2711);
    expect(crm.contracts).toBe(0);
    expect(crm.revenue).toBe(0);
  });

  it("o ticket é realizado quando há resultado e referência quando não há", () => {
    expect(build().avg_ticket).toBe(338000 / 4);
    expect(build().avg_ticket_realized).toBe(true);
    const sem = build(SNAPSHOT, NO_RESULTS);
    expect(sem.avg_ticket).toBe(84500); // referência digitada no bloco do funil
    expect(sem.avg_ticket_realized).toBe(false);
  });
});

describe("nada é inferido a partir do estoque", () => {
  const crm = build();

  it("não existe taxa de conversão derivada da coluna Lead", () => {
    expect(crm).not.toHaveProperty("conversion_rate");
    // A armadilha antiga: 4 contratos sobre 9 cards em "Lead" daria 44%.
    expect(Object.values(crm)).not.toContain((4 * 100) / 9);
  });

  it("a série mensal traz só leads reais de mídia, sem contratos nem receita", () => {
    expect(crm.monthly).toEqual([{ month: "ago", leads: 100 }, { month: "set", leads: 50 }]);
    crm.monthly.forEach((month) => {
      expect(month).not.toHaveProperty("contracts");
      expect(month).not.toHaveProperty("revenue");
      expect(month).not.toHaveProperty("visits");
    });
  });

  it("nenhum contrato é atribuído a Meta ou Google", () => {
    expect(crm.sources).toEqual([{ name: "Meta Ads", leads: 110 }, { name: "Google Ads", leads: 40 }]);
    crm.sources.forEach((source) => expect(source).not.toHaveProperty("contracts"));
  });

  it("mudar o resultado do período não redistribui nada por canal", () => {
    const dobro = build(SNAPSHOT, { contracts_closed: 8, revenue: 676000 });
    expect(dobro.sources).toEqual(crm.sources);
    expect(dobro.monthly).toEqual(crm.monthly);
  });
});

describe("semântica de fechamento e pós-venda", () => {
  const crm = build();

  it("Contrato continua sendo a etapa de fechamento comercial", () => {
    expect(crm.close_stage?.id).toBe("contract");
    expect(crm.close_stage?.kind).toBe("close");
  });

  it("Implantação continua pós-venda, depois do Contrato e fora do ciclo", () => {
    const postSale = crm.stages.filter((stage) => stage.kind === "post_sale");
    expect(postSale.map((stage) => stage.id)).toEqual(["implementation"]);
    expect(crm.stages.indexOf(postSale[0])).toBeGreaterThan(crm.stages.findIndex((stage) => stage.kind === "close"));
    // 2+5+4+9+12+7+3+6 = 48; os 45 dias de Implantação ficam de fora.
    expect(crm.avg_cycle_days).toBe(48);
  });

  it("a etapa mais demorada ignora a pós-venda mesmo sendo a mais longa", () => {
    expect(slowestCommercialStage(crm.stages)?.id).toBe("visit_call");
  });
});

describe("funil de Condomínios", () => {
  const crm = buildCrmSummary("condominium", CONDO_SNAPSHOT, { contracts_closed: 2, revenue: 0 }, { rows: [] });

  it("tem 8 etapas e o pipeline aponta para Assembleia", () => {
    expect(crm.stages).toHaveLength(8);
    expect(crm.pipeline_stage?.id).toBe("assembly");
    expect(crm.open_opportunities).toBe(3 + 798 + 9 + 11 + 547 + 13);
  });

  it("registra fechamento sem receita quando a frente não tem taxa direta", () => {
    expect(crm.contracts).toBe(2);
    expect(crm.revenue).toBe(0);
    expect(crm.avg_ticket_realized).toBe(false);
    expect(crm.avg_ticket).toBe(0);
  });

  it("o ciclo comercial exclui os 30 dias de Implantação", () => {
    expect(crm.avg_cycle_days).toBe(54);
  });
});

describe("estado vazio", () => {
  it("não quebra nem produz NaN sem snapshot e sem resultado", () => {
    const empty = buildCrmSummary("condominium", { stages: {}, stage_days: {}, avg_ticket: 0 }, NO_RESULTS, { rows: [] });
    expect(empty.stages).toHaveLength(8);
    expect(empty.stages.every((stage) => stage.count === 0)).toBe(true);
    expect(empty.open_opportunities).toBe(0);
    expect(empty.contracts).toBe(0);
    expect(empty.revenue).toBe(0);
    expect(empty.avg_ticket).toBe(0);
    expect(empty.avg_cycle_days).toBe(0);
    expect(empty.monthly).toEqual([]);
    expect(empty.sources).toEqual([]);
    expect(slowestCommercialStage(empty.stages)).toBeNull();
  });

  it("valores negativos são travados em zero nos dois blocos", () => {
    const crm = buildCrmSummary(
      "franchise",
      { stages: { lead: -5, contact: 10 }, stage_days: { lead: -3 }, avg_ticket: -1 },
      { contracts_closed: -2, revenue: -900 },
      { rows: [] },
    );
    expect(crm.stages.find((stage) => stage.id === "lead")?.count).toBe(0);
    expect(crm.stages.find((stage) => stage.id === "lead")?.avg_days).toBe(0);
    expect(crm.contracts).toBe(0);
    expect(crm.revenue).toBe(0);
    expect(crm.avg_ticket).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Seed de apresentação: os números que o dashboard mostra enquanto o CRM não
// tem integração automática. Travados aqui porque são o que vai para a tela.
// ---------------------------------------------------------------------------

describe("seed manual de apresentação", () => {
  const franchise = buildCrmSummary("franchise", defaultFunnel.franchise, defaultResults.franchise, { rows: [] });
  const condominium = buildCrmSummary("condominium", defaultFunnel.condominium, defaultResults.condominium, { rows: [] });

  it("Franquias: 9 contratos, R$ 760.500 e ticket realizado de R$ 84.500", () => {
    expect(franchise.contracts).toBe(9);
    expect(franchise.revenue).toBe(760500);
    expect(franchise.avg_ticket).toBe(84500);
    expect(franchise.avg_ticket_realized).toBe(true);
  });

  it("Condomínios: 6 contratos, R$ 108.000 e ticket realizado de R$ 18.000", () => {
    expect(condominium.contracts).toBe(6);
    expect(condominium.revenue).toBe(108000);
    expect(condominium.avg_ticket).toBe(18000);
    expect(condominium.avg_ticket_realized).toBe(true);
  });

  it("o pipeline aberto fica plausível nas duas frentes", () => {
    // Franquias: 24+68+31+22+14+11+7+4 = 181 (sem Contrato nem Implantação).
    expect(franchise.open_opportunities).toBe(181);
    // Condomínios: 15+42+18+14+11+6 = 106.
    expect(condominium.open_opportunities).toBe(106);
    expect(franchise.avg_cycle_days).toBe(28); // 1+2+3+4+5+6+4+3, sem os 12 de Implantação
    expect(condominium.avg_cycle_days).toBe(22); // 1+2+3+4+5+7, sem os 10 de Implantação
  });

  it("o resultado do período não acompanha a coluna Contrato nem a Implantação", () => {
    expect(franchise.close_stage?.count).toBe(3);
    expect(franchise.stages.find((stage) => stage.id === "implementation")?.count).toBe(18);
    expect(franchise.contracts).toBe(9); // nem 3, nem 18

    // E mexer em qualquer uma das duas colunas não move contratos nem receita.
    (["contract", "implementation"] as const).forEach((id) => {
      [0, 500].forEach((value) => {
        const variant = buildCrmSummary(
          "franchise",
          { ...defaultFunnel.franchise, stages: { ...defaultFunnel.franchise.stages, [id]: value } },
          defaultResults.franchise,
          { rows: [] },
        );
        expect(variant.contracts).toBe(9);
        expect(variant.revenue).toBe(760500);
        expect(variant.avg_ticket).toBe(84500);
      });
    });
  });

  it("o seed não reintroduz taxa, projeção nem origem de contrato", () => {
    [franchise, condominium].forEach((crm) => {
      expect(crm).not.toHaveProperty("conversion_rate");
      expect(crm).not.toHaveProperty("projected_revenue");
      expect(crm).not.toHaveProperty("pipeline_value");
      expect(crm.monthly).toEqual([]); // sem rows de mídia, nada é fabricado
      expect(crm.sources).toEqual([]);
    });
  });

  it("a série mensal continua vindo só da mídia real, nunca do seed", () => {
    const comMidia = buildCrmSummary("franchise", defaultFunnel.franchise, defaultResults.franchise, { rows });
    expect(comMidia.monthly).toEqual([{ month: "ago", leads: 100 }, { month: "set", leads: 50 }]);
    expect(comMidia.sources).toEqual([{ name: "Meta Ads", leads: 110 }, { name: "Google Ads", leads: 40 }]);
    comMidia.sources.forEach((source) => expect(source).not.toHaveProperty("contracts"));
  });
});
