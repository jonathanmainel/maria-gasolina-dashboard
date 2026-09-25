import { describe, expect, it } from "vitest";
import {
  closeStage, crmStageDefinitions, crmStageNames, cycleStages, isCommercialClose, isPostSale,
  preCloseStage, topStage, visitStage,
} from "./crm-stages";

// Os dois funis reais da Maria Gasolina. Os nomes no CRM de origem carregam
// percentuais ("FQC-50%", "CONTRATO-100%") que são organização interna do CRM,
// não probabilidade: não entram no dashboard nem como rótulo nem como cálculo.

const FRANCHISE = ["Lead", "Contato", "Recall", "FQC", "Visita / Call", "COF", "Pré-contrato", "Espera", "Contrato", "Implantação"];
const CONDOMINIUM = ["Lead", "Contato", "Recall", "FQA", "Visita / Proposta", "Assembleia", "Contrato", "Implantação"];

describe("estrutura das etapas", () => {
  it("Franquias tem as 10 etapas reais, na ordem exata", () => {
    expect(crmStageNames("franchise")).toEqual(FRANCHISE);
  });

  it("Condomínios tem as 8 etapas reais, na ordem exata", () => {
    expect(crmStageNames("condominium")).toEqual(CONDOMINIUM);
  });

  it("nenhum rótulo carrega percentual do CRM de origem", () => {
    [...crmStageNames("franchise"), ...crmStageNames("condominium")].forEach((name) => {
      expect(name).not.toMatch(/\d+\s*%/);
      expect(name).not.toMatch(/%/);
    });
  });

  it("nenhum nome do modelo antigo sobrou como etapa atual", () => {
    const retired = ["Perfil validado", "Discovery Day", "Proposta / COF", "Contrato assinado", "Contato com síndico", "Visita técnica", "Aprovação em assembleia", "Loja contratada", "Indicações", "Leads"];
    [...crmStageNames("franchise"), ...crmStageNames("condominium")].forEach((name) => {
      expect(retired).not.toContain(name);
    });
  });

  it("os ids não se repetem dentro de uma frente", () => {
    (["franchise", "condominium"] as const).forEach((front) => {
      const ids = crmStageDefinitions[front].map((stage) => stage.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});

describe("semântica das etapas", () => {
  (["franchise", "condominium"] as const).forEach((front) => {
    const stages = crmStageDefinitions[front];

    it(`${front}: "Contrato" é o fechamento comercial e é único`, () => {
      expect(stages.filter(isCommercialClose).map((stage) => stage.name)).toEqual(["Contrato"]);
      expect(closeStage(stages)?.id).toBe("contract");
    });

    it(`${front}: "Implantação" é pós-venda e vem depois do Contrato`, () => {
      const postSale = stages.filter(isPostSale);
      expect(postSale.map((stage) => stage.name)).toEqual(["Implantação"]);
      expect(stages.indexOf(postSale[0])).toBeGreaterThan(stages.findIndex(isCommercialClose));
    });

    it(`${front}: o fechamento não é a última etapa do funil`, () => {
      expect(closeStage(stages)).not.toBe(stages[stages.length - 1]);
    });

    it(`${front}: "Lead" é o topo e existe uma etapa de visita`, () => {
      expect(topStage(stages).name).toBe("Lead");
      expect(visitStage(stages)?.name).toBe(front === "franchise" ? "Visita / Call" : "Visita / Proposta");
    });

    it(`${front}: o ciclo comercial não inclui Implantação nem o próprio Contrato`, () => {
      const cycle = cycleStages(stages).map((stage) => stage.name);
      expect(cycle).not.toContain("Implantação");
      expect(cycle).not.toContain("Contrato");
      expect(cycle[0]).toBe("Lead");
    });

    it(`${front}: o pipeline usa a última etapa comercial antes do Contrato`, () => {
      expect(preCloseStage(stages)?.name).toBe(front === "franchise" ? "Espera" : "Assembleia");
    });
  });
});
