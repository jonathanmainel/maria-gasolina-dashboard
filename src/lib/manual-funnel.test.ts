import { describe, expect, it } from "vitest";
import { crmStages } from "./crm-stages";
import { defaultFunnel, legacyStageMap, normalizeFunnel } from "./manual-funnel";
import { normalize } from "./manual-inputs";

// O payload já salvo em `dashboard_manual_inputs` guarda o funil no modelo
// antigo de 6 etapas, como dois arrays posicionais. Ele precisa continuar
// carregando, mapeado de forma conservadora e sem inventar volume para as
// etapas do CRM real que nunca foram medidas.

const legacyFranchise = { stages: [420, 260, 130, 67, 36, 18], stage_days: [3, 6, 9, 12, 17], avg_ticket: 84500 };
const legacyCondominium = { stages: [180, 126, 79, 49, 27, 16], stage_days: [5, 9, 12, 16, 20], avg_ticket: 0 };

describe("migração do payload legado de 6 etapas", () => {
  it("Franquias: Leads → Lead, Contato realizado → Contato, Contrato assinado → Contrato", () => {
    const funnel = normalizeFunnel("franchise", legacyFranchise);
    expect(funnel.stages.lead).toBe(420);
    expect(funnel.stages.contact).toBe(260);
    expect(funnel.stages.contract).toBe(18);
  });

  it("Franquias: etapas antigas sem equivalência clara entram em 0, não em um palpite", () => {
    const funnel = normalizeFunnel("franchise", legacyFranchise);
    // "Perfil validado" (130), "Discovery Day" (67) e "Proposta / COF" (36) não
    // têm par seguro entre Recall/FQC/Visita/COF/Pré-contrato/Espera.
    ["recall", "fqc", "visit_call", "cof", "pre_contract", "waiting", "implementation"].forEach((id) => {
      expect(funnel.stages[id]).toBe(0);
    });
  });

  it("Condomínios: Indicações, Contato com síndico, Aprovação em assembleia e Loja contratada são mapeados", () => {
    const funnel = normalizeFunnel("condominium", legacyCondominium);
    expect(funnel.stages.lead).toBe(180);
    expect(funnel.stages.contact).toBe(126);
    expect(funnel.stages.assembly).toBe(49);
    expect(funnel.stages.contract).toBe(16);
    // "Visita técnica" (79) e "Proposta" (27) cairiam ambos em "Visita / Proposta".
    expect(funnel.stages.recall).toBe(0);
    expect(funnel.stages.fqa).toBe(0);
    expect(funnel.stages.visit_proposal).toBe(0);
    expect(funnel.stages.implementation).toBe(0);
  });

  it("os tempos seguem exatamente o mesmo mapa dos volumes", () => {
    expect(normalizeFunnel("franchise", legacyFranchise).stage_days).toMatchObject({ lead: 3, contact: 6, recall: 0, fqc: 0 });
    expect(normalizeFunnel("condominium", legacyCondominium).stage_days).toMatchObject({ lead: 5, contact: 9, assembly: 16, fqa: 0 });
  });

  it("o ticket médio do payload antigo é preservado", () => {
    expect(normalizeFunnel("franchise", legacyFranchise).avg_ticket).toBe(84500);
    expect(normalizeFunnel("condominium", legacyCondominium).avg_ticket).toBe(0);
  });

  it("todo índice legado mapeado aparece no resultado — nenhuma perda silenciosa", () => {
    (["franchise", "condominium"] as const).forEach((front) => {
      const legacy = front === "franchise" ? legacyFranchise : legacyCondominium;
      const funnel = normalizeFunnel(front, legacy);
      Object.entries(legacyStageMap[front]).forEach(([index, id]) => {
        expect(funnel.stages[id]).toBe(legacy.stages[Number(index)]);
      });
    });
  });

  it("o resultado tem exatamente as chaves das etapas atuais da frente", () => {
    (["franchise", "condominium"] as const).forEach((front) => {
      const funnel = normalizeFunnel(front, front === "franchise" ? legacyFranchise : legacyCondominium);
      expect(Object.keys(funnel.stages).sort()).toEqual(crmStages(front).map((stage) => stage.id).sort());
      expect(Object.keys(funnel.stage_days).sort()).toEqual(
        crmStages(front).filter((stage) => stage.tracksDays).map((stage) => stage.id).sort(),
      );
    });
  });
});

describe("payload no formato atual (registro por id)", () => {
  it("valores por id passam inteiros e são travados em zero quando negativos", () => {
    const funnel = normalizeFunnel("franchise", {
      stages: { lead: 500, contact: 300, recall: 210, fqc: 150, visit_call: 110, cof: 80, pre_contract: 50, waiting: 33, contract: 21, implementation: 14 },
      stage_days: { lead: 2, contact: -5, implementation: 30 },
      avg_ticket: 90000,
    });
    expect(funnel.stages.waiting).toBe(33);
    expect(funnel.stages.implementation).toBe(14);
    expect(funnel.stage_days.contact).toBe(0);
    expect(funnel.stage_days.implementation).toBe(30);
    expect(funnel.avg_ticket).toBe(90000);
  });

  it("etapa ausente do payload entra em 0, nunca no número ilustrativo do padrão", () => {
    const funnel = normalizeFunnel("franchise", { stages: { lead: 10, contract: 1 }, stage_days: {}, avg_ticket: 1000 });
    expect(funnel.stages.contact).toBe(0);
    expect(funnel.stages.contact).not.toBe(defaultFunnel.franchise.stages.contact);
  });

  it("chaves desconhecidas (etapa removida do modelo) são descartadas", () => {
    const funnel = normalizeFunnel("condominium", { stages: { lead: 10, discovery_day: 99 }, stage_days: {}, avg_ticket: 0 });
    expect(funnel.stages).not.toHaveProperty("discovery_day");
  });

  it("payload ausente devolve o padrão da frente", () => {
    expect(normalizeFunnel("franchise", undefined)).toEqual(defaultFunnel.franchise);
    expect(normalizeFunnel("condominium", {})).toEqual(defaultFunnel.condominium);
  });
});

describe("normalize() do bloco manual inteiro", () => {
  it("um payload salvo com o modelo antigo continua carregando", () => {
    const result = normalize({ funnel: { franchise: legacyFranchise, condominium: legacyCondominium } });
    expect(result.funnel.franchise.stages.contract).toBe(18);
    expect(result.funnel.condominium.stages.assembly).toBe(49);
    expect(result.goals).toBeDefined();
    expect(result.delivery).toBeDefined();
  });

  it("os padrões do funil não trazem volume inventado para as etapas novas", () => {
    expect(defaultFunnel.franchise.stages.fqc).toBe(0);
    expect(defaultFunnel.franchise.stages.cof).toBe(0);
    expect(defaultFunnel.condominium.stages.fqa).toBe(0);
    expect(defaultFunnel.franchise.stages.implementation).toBe(0);
  });
});
